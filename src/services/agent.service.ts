import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { AgentKey, AITaskStatus } from "@/generated/prisma/enums";
import { AGENT_DEFINITIONS, AGENTS_BY_KEY } from "@/lib/ai/agents";
import { audit } from "@/lib/audit";
import { ACTION_AGENT } from "@/lib/automation/catalog";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import type { ServiceContext } from "@/lib/service-context";

export async function ensureAgents(storeId: string) {
  for (const def of AGENT_DEFINITIONS) {
    await db.aIAgent.upsert({
      where: { storeId_key: { storeId, key: def.key } },
      create: {
        storeId,
        key: def.key,
        name: def.name,
        description: def.description,
        autonomy: def.defaultAutonomy,
        tools: def.defaultTools,
        config: { instructions: def.instructions, confidenceThreshold: 0.7 },
      },
      update: {},
    });
  }
}

export async function getAgent(storeId: string, key: AgentKey) {
  return db.aIAgent.findUnique({ where: { storeId_key: { storeId, key } } });
}

export type TaskRecord = {
  type: string;
  title: string;
  status?: AITaskStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  relatedType?: string;
  relatedId?: string;
};

/** Persists a unit of agent work — feeds the AI Activity Center and agent stats. */
export async function recordAITask(storeId: string, key: AgentKey | null, t: TaskRecord) {
  const agent = key ? await getAgent(storeId, key) : null;
  const task = await db.aITask.create({
    data: {
      storeId,
      agentId: agent?.id ?? null,
      type: t.type,
      title: t.title.slice(0, 300),
      status: t.status ?? "SUCCEEDED",
      input: (t.input ?? undefined) as Prisma.InputJsonValue | undefined,
      output: (t.output ?? undefined) as Prisma.InputJsonValue | undefined,
      error: t.error ?? null,
      provider: t.provider ?? null,
      model: t.model ?? null,
      durationMs: t.durationMs ?? null,
      relatedType: t.relatedType ?? null,
      relatedId: t.relatedId ?? null,
      completedAt: new Date(),
    },
  });
  if (agent) await db.aIAgent.update({ where: { id: agent.id }, data: { lastActiveAt: new Date() } });
  return task;
}

export async function listAgentsWithStats(storeId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [agents, taskStats, decisionStats, automationCounts] = await Promise.all([
    db.aIAgent.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } }),
    db.aITask.groupBy({ by: ["agentId", "status"], where: { storeId, createdAt: { gte: since } }, _count: { _all: true } }),
    db.aIDecision.groupBy({ by: ["agentId", "status"], where: { storeId, createdAt: { gte: since } }, _count: { _all: true } }),
    db.automationNode.findMany({ where: { automation: { storeId, deletedAt: null, status: "ACTIVE" }, type: { in: ["ACTION", "AI_DECISION"] } }, select: { config: true, automationId: true } }),
  ]);
  return agents.map((a) => {
    const tasks = taskStats.filter((t) => t.agentId === a.id);
    const total = tasks.reduce((s, t) => s + t._count._all, 0);
    const succeeded = tasks.filter((t) => t.status === "SUCCEEDED").reduce((s, t) => s + t._count._all, 0);
    const decisions = decisionStats.filter((d) => d.agentId === a.id);
    const def = AGENTS_BY_KEY.get(a.key);
    const automationIds = new Set(
      automationCounts
        .filter((n) => {
          const action = (n.config as { action?: string }).action;
          // AI decision nodes are evaluated by the Order Agent.
          return action ? ACTION_AGENT[action] === a.key : a.key === "ORDER";
        })
        .map((n) => n.automationId),
    );
    return {
      ...a,
      icon: def?.icon ?? "bot",
      responsibilities: def?.responsibilities ?? [],
      tasksCompleted: succeeded,
      tasksTotal: total,
      successRate: total ? Math.round((succeeded / total) * 1000) / 10 : null,
      pendingDecisions: decisions.filter((d) => d.status === "PENDING_APPROVAL").reduce((s, d) => s + d._count._all, 0),
      automationCount: automationIds.size,
    };
  });
}

export async function getAgentDetail(storeId: string, key: AgentKey) {
  const agent = await db.aIAgent.findUnique({
    where: { storeId_key: { storeId, key } },
    include: {
      tasks: { orderBy: { createdAt: "desc" }, take: 30 },
      decisions: { orderBy: { createdAt: "desc" }, take: 15 },
      knowledge: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!agent) throw notFound("Agent");
  const def = AGENTS_BY_KEY.get(key)!;
  const sharedKnowledge = await db.knowledgeArticle.findMany({ where: { storeId, agentId: null, active: true }, orderBy: { category: "asc" } });
  return { ...agent, definition: def, sharedKnowledge };
}

export const agentUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  autonomy: z.enum(["SUGGEST_ONLY", "APPROVAL_REQUIRED", "AUTONOMOUS"]).optional(),
  tools: z.array(z.string()).max(40).optional(),
  instructions: z.string().max(4000).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
});

export async function updateAgent(ctx: ServiceContext, key: AgentKey, input: z.infer<typeof agentUpdateSchema>) {
  const agent = await getAgent(ctx.storeId, key);
  if (!agent) throw notFound("Agent");
  if (input.tools) {
    const { TOOL_NAMES } = await import("@/lib/ai/tools/registry");
    const unknown = input.tools.filter((t) => !TOOL_NAMES.includes(t));
    if (unknown.length) throw badRequest(`Unknown tools: ${unknown.join(", ")}`);
  }
  const config = { ...(agent.config as Record<string, unknown>) };
  if (input.instructions !== undefined) config.instructions = input.instructions;
  if (input.confidenceThreshold !== undefined) config.confidenceThreshold = input.confidenceThreshold;
  const updated = await db.aIAgent.update({
    where: { id: agent.id },
    data: {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.autonomy ? { autonomy: input.autonomy } : {}),
      ...(input.tools ? { tools: input.tools } : {}),
      config: config as Prisma.InputJsonValue,
    },
  });
  await audit(ctx, {
    action: "ai.agent.update",
    resourceType: "ai_agent",
    resourceId: agent.id,
    resourceLabel: agent.name,
    oldValue: { enabled: agent.enabled, autonomy: agent.autonomy, tools: agent.tools, config: agent.config },
    newValue: input,
  });
  return updated;
}

/** Lightweight agent list for filters and pickers. */
export async function listAgentOptions(storeId: string) {
  return db.aIAgent.findMany({ where: { storeId }, orderBy: { createdAt: "asc" }, select: { key: true, name: true, enabled: true } });
}

/** Unified AI activity timeline (tasks + decisions), newest first. */
export async function aiActivity(storeId: string, opts: { agentKey?: AgentKey; limit?: number } = {}) {
  const agentFilter = opts.agentKey ? { agent: { key: opts.agentKey } } : {};
  const limit = opts.limit ?? 50;
  const [tasks, decisions] = await Promise.all([
    db.aITask.findMany({ where: { storeId, ...agentFilter }, orderBy: { createdAt: "desc" }, take: limit, include: { agent: { select: { name: true, key: true } } } }),
    db.aIDecision.findMany({ where: { storeId, ...agentFilter }, orderBy: { createdAt: "desc" }, take: limit, include: { agent: { select: { name: true, key: true } } } }),
  ]);
  const items = [
    ...tasks.map((t) => ({ id: t.id, kind: "task" as const, at: t.createdAt, agent: t.agent, title: t.title, status: t.status, relatedType: t.relatedType, relatedId: t.relatedId, durationMs: t.durationMs })),
    ...decisions.map((d) => ({ id: d.id, kind: "decision" as const, at: d.createdAt, agent: d.agent, title: d.title, status: d.status, relatedType: d.relatedType, relatedId: d.relatedId, durationMs: null })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
