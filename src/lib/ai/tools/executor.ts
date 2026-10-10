import { ZodError } from "zod";
import type { AIAgent } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import type { ServiceContext } from "@/lib/service-context";
import { createDecision } from "@/services/decision.service";
import { TOOLS_BY_NAME } from "./registry";

export type ToolRunResult =
  | { ok: true; status: "executed"; output: unknown }
  | { ok: true; status: "approval_required"; decisionId: string; message: string }
  | { ok: false; status: "denied" | "invalid" | "error"; error: string };

export type RunToolOptions = {
  /** The agent acting (AI actors). Its tool allow-list and autonomy are enforced. */
  agent?: Pick<AIAgent, "id" | "key" | "name" | "enabled" | "tools" | "autonomy">;
  /** Set when executing an already-approved decision — skips the approval gate. */
  approvedDecisionId?: string;
};

/**
 * The single guarded path for every AI-initiated action:
 *   validate → authorize (user RBAC / agent allow-list) → approval gate → execute → audit.
 */
export async function runTool(ctx: ServiceContext, name: string, rawInput: unknown, opts: RunToolOptions = {}): Promise<ToolRunResult> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return { ok: false, status: "invalid", error: `Unknown tool "${name}"` };

  // 1) Validate
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, status: "invalid", error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const input = parsed.data;

  // 2) Authorize
  if (ctx.actor.type === "USER" && !can(ctx.actor.role, tool.permission)) {
    return { ok: false, status: "denied", error: `Your role can't use ${name} (requires ${tool.permission})` };
  }
  if (ctx.actor.type === "AI" && opts.agent) {
    if (!opts.agent.enabled) return { ok: false, status: "denied", error: `${opts.agent.name} is disabled` };
    if (!opts.agent.tools.includes(name)) return { ok: false, status: "denied", error: `${opts.agent.name} is not permitted to use ${name}` };
  }

  // 3) Approval gate (AI actions on sensitive tools, or any write when the agent is suggest-only)
  if (!opts.approvedDecisionId && tool.kind !== "read") {
    const suggestOnly = ctx.actor.type === "AI" && opts.agent?.autonomy === "SUGGEST_ONLY";
    let request =
      tool.kind === "sensitive" && tool.describeApproval
        ? await tool.describeApproval(input, ctx)
        : tool.requiresApproval
          ? await tool.requiresApproval(input, ctx)
          : null;
    if (!request && suggestOnly) {
      request = { title: `${opts.agent!.name}: ${name}`, summary: JSON.stringify(input).slice(0, 300), reasoning: "This agent is configured to suggest actions only.", evidence: [], riskLevel: "LOW" };
    }
    // Sensitive tools invoked directly by a permitted human still execute (with audit);
    // AI and system actors always go through approval.
    if (request && (ctx.actor.type !== "USER" || tool.kind === "sensitive")) {
      const decision = await createDecision(ctx.storeId, {
        agentKey: opts.agent?.key ?? tool.agent,
        title: request.title,
        summary: request.summary,
        reasoning: request.reasoning,
        evidence: request.evidence,
        action: name,
        actionInput: input as Record<string, unknown>,
        expectedImpact: request.expectedImpact,
        riskLevel: request.riskLevel,
        requiresApproval: true,
        relatedType: request.relatedType,
        relatedId: request.relatedId,
      });
      await audit(ctx, {
        action: `ai.tool.${name}.approval_requested`,
        resourceType: request.relatedType ?? "tool",
        resourceId: request.relatedId ?? null,
        resourceLabel: request.title,
        newValue: input,
        metadata: { decisionId: decision.id },
      });
      return { ok: true, status: "approval_required", decisionId: decision.id, message: `Sent to the Approval Center: ${request.title}` };
    }
  }

  // 4) Execute + audit
  try {
    const output = await tool.handler(ctx, input as never);
    if (tool.kind !== "read") {
      await audit(ctx, {
        action: `${ctx.actor.type === "AI" ? "ai." : ""}tool.${name}`,
        resourceType: "tool",
        resourceLabel: name,
        newValue: input,
        metadata: { approvedDecisionId: opts.approvedDecisionId ?? null, agent: opts.agent?.name ?? null },
      });
    }
    return { ok: true, status: "executed", output };
  } catch (err) {
    const message = err instanceof AppError || err instanceof ZodError ? err.message : (err as Error).message ?? "Tool failed";
    if (tool.kind !== "read") {
      await audit(ctx, { action: `tool.${name}.failed`, resourceType: "tool", resourceLabel: name, newValue: input, reason: message });
    }
    return { ok: false, status: "error", error: message };
  }
}
