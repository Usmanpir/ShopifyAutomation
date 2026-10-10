import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { AgentKey, DecisionStatus, RiskLevel } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { publishEvent } from "@/lib/events/bus";
import { enqueue } from "@/lib/queue";
import type { ServiceContext } from "@/lib/service-context";
import { notify } from "./notification.service";
import { getStore } from "./store.service";

export type EvidenceItem = { label: string; value: string; points?: number };

export type CreateDecisionInput = {
  agentKey?: AgentKey;
  taskId?: string;
  title: string;
  summary: string;
  reasoning: string;
  evidence: EvidenceItem[];
  /** Tool name (see lib/ai/tools) or "automation.approval". */
  action: string;
  actionInput: Record<string, unknown>;
  expectedImpact?: string;
  riskLevel?: RiskLevel;
  confidence?: number;
  requiresApproval: boolean;
  relatedType?: string;
  relatedId?: string;
  automationRunId?: string;
};

/**
 * Records an AI recommendation. Sensitive actions wait in the Approval
 * Center; everything else executes immediately and is still audited.
 */
export async function createDecision(storeId: string, input: CreateDecisionInput) {
  const store = await getStore(storeId);
  const agent = input.agentKey ? await db.aIAgent.findUnique({ where: { storeId_key: { storeId, key: input.agentKey } } }) : null;

  // Avoid duplicate pending recommendations for the same action + subject.
  if (input.relatedId) {
    const dup = await db.aIDecision.findFirst({
      where: { storeId, status: "PENDING_APPROVAL", action: input.action, relatedId: input.relatedId },
    });
    if (dup) return dup;
  }

  const decision = await db.aIDecision.create({
    data: {
      storeId,
      agentId: agent?.id ?? null,
      taskId: input.taskId ?? null,
      title: input.title,
      summary: input.summary,
      reasoning: input.reasoning,
      evidence: input.evidence as unknown as Prisma.InputJsonValue,
      action: input.action,
      actionInput: input.actionInput as Prisma.InputJsonValue,
      expectedImpact: input.expectedImpact ?? null,
      riskLevel: input.riskLevel ?? "MEDIUM",
      confidence: input.confidence ?? null,
      requiresApproval: input.requiresApproval,
      status: input.requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
      automationRunId: input.automationRunId ?? null,
      expiresAt: new Date(Date.now() + store.settings.approvals.decisionExpiryHours * 3_600_000),
    },
  });
  if (agent) await db.aIAgent.update({ where: { id: agent.id }, data: { lastActiveAt: new Date() } });

  if (!input.requiresApproval) {
    return executeDecision(decision.id, { type: "AI", name: agent?.name ?? "AI", id: agent?.id }, true);
  }

  await publishEvent(storeId, "AI_DECISION_CREATED", {
    title: `${agent?.name ?? "AI"} recommends: ${input.title}`,
    tone: "ai",
    href: `/approvals?focus=${decision.id}`,
    payload: { decisionId: decision.id },
    silent: true,
  });
  if (store.settings.notifications.alerts.approvalRequired) {
    await notify(storeId, {
      type: "AI",
      severity: input.riskLevel === "HIGH" ? "WARNING" : "INFO",
      title: `Approval needed: ${input.title}`,
      body: input.summary,
      href: `/approvals?focus=${decision.id}`,
      roles: ["OWNER", "ADMIN", "MANAGER"],
    });
  }
  return decision;
}

async function executeDecision(id: string, actor: ServiceContext["actor"], auto = false) {
  const decision = await db.aIDecision.findUnique({ where: { id }, include: { agent: true } });
  if (!decision) throw notFound("Decision");

  let status: DecisionStatus = auto ? "AUTO_EXECUTED" : "EXECUTED";
  let result: unknown = null;
  if (decision.action !== "automation.approval") {
    const { runTool } = await import("@/lib/ai/tools/executor");
    const out = await runTool(
      { storeId: decision.storeId, actor: decision.agent ? { type: "AI", name: decision.agent.name, id: decision.agent.id } : actor },
      decision.action,
      decision.actionInput,
      { approvedDecisionId: decision.id, agent: decision.agent ?? undefined },
    );
    result = out;
    if (!out.ok) status = "FAILED";
  }
  const updated = await db.aIDecision.update({
    where: { id },
    data: { status, executedAt: new Date(), executionResult: (result ?? undefined) as Prisma.InputJsonValue | undefined },
  });
  if (decision.automationRunId) {
    await enqueue("automation.resume", { runId: decision.automationRunId, handle: "approved" });
  }
  return updated;
}

export const reviewSchema = z.object({ note: z.string().trim().max(1000).optional() });

export async function approveDecision(ctx: ServiceContext, id: string, note?: string) {
  const decision = await db.aIDecision.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!decision) throw notFound("Recommendation");
  if (decision.status !== "PENDING_APPROVAL") throw conflict("This recommendation has already been reviewed");
  if (decision.expiresAt && decision.expiresAt < new Date()) {
    await db.aIDecision.update({ where: { id }, data: { status: "EXPIRED" } });
    throw conflict("This recommendation has expired");
  }
  await db.aIDecision.update({
    where: { id },
    data: { status: "APPROVED", reviewedById: ctx.actor.id ?? null, reviewedAt: new Date(), reviewNote: note ?? null },
  });
  await audit(ctx, {
    action: "approval.approve",
    resourceType: "ai_decision",
    resourceId: id,
    resourceLabel: decision.title,
    newValue: { action: decision.action, input: decision.actionInput },
    reason: note,
  });
  return executeDecision(id, ctx.actor);
}

export async function rejectDecision(ctx: ServiceContext, id: string, note?: string) {
  const decision = await db.aIDecision.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!decision) throw notFound("Recommendation");
  if (decision.status !== "PENDING_APPROVAL") throw conflict("This recommendation has already been reviewed");
  const updated = await db.aIDecision.update({
    where: { id },
    data: { status: "REJECTED", reviewedById: ctx.actor.id ?? null, reviewedAt: new Date(), reviewNote: note ?? null },
  });
  await audit(ctx, { action: "approval.reject", resourceType: "ai_decision", resourceId: id, resourceLabel: decision.title, reason: note });
  if (decision.automationRunId) await enqueue("automation.resume", { runId: decision.automationRunId, handle: "rejected" });
  return updated;
}

export const decisionListQuery = z.object({
  status: z.enum(["pending", "approved", "rejected", "executed", "all"]).default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * What is concretely at stake if a decision is approved — money or people
 * affected — read from the records it touches (never estimated).
 */
export async function decisionStakes(
  storeId: string,
  decisions: { id: string; action: string; actionInput: unknown; relatedType: string | null; relatedId: string | null }[],
): Promise<Record<string, { label: string; value: string }>> {
  const store = await getStore(storeId);
  const { formatMoney } = await import("@/lib/money");
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const input = (d: { actionInput: unknown }) => (d.actionInput ?? {}) as Record<string, unknown>;
  const orderIds = decisions.filter((d) => d.relatedType === "order" && d.relatedId).map((d) => d.relatedId!);
  const campaignIds = decisions.map((d) => input(d).campaignId).filter((x): x is string => typeof x === "string");
  const mcIds = decisions.filter((d) => d.action === "sendMarketingCampaign").map((d) => input(d).campaignId).filter((x): x is string => typeof x === "string");
  const segKeys = decisions.filter((d) => d.action === "sendMarketingCampaign").map((d) => input(d).segmentKey).filter((x): x is string => typeof x === "string");
  const [orders, campaigns, mcs, segs] = await Promise.all([
    db.order.findMany({ where: { storeId, id: { in: orderIds } }, select: { id: true, total: true } }),
    db.campaign.findMany({ where: { storeId, id: { in: campaignIds } }, select: { id: true, dailyBudget: true } }),
    db.marketingCampaign.findMany({ where: { storeId, id: { in: mcIds } }, select: { id: true, audienceSize: true } }),
    db.customerSegment.findMany({ where: { storeId, key: { in: segKeys } }, select: { key: true, customerCount: true } }),
  ]);
  const out: Record<string, { label: string; value: string }> = {};
  for (const d of decisions) {
    const i = input(d);
    if (d.action === "refundOrder" && typeof i.amountMajor === "number") out[d.id] = { label: "Refund amount", value: money(Math.round(i.amountMajor * 100)) };
    else if (d.action === "changeCampaignBudget" && typeof i.dailyBudget === "number") {
      const c = campaigns.find((x) => x.id === i.campaignId);
      if (c?.dailyBudget) out[d.id] = { label: "Change in weekly spend", value: `${i.dailyBudget >= c.dailyBudget ? "+" : "−"}${money(Math.abs(i.dailyBudget - c.dailyBudget) * 7)}` };
    } else if (d.action === "pauseCampaign") {
      const c = campaigns.find((x) => x.id === i.campaignId);
      if (c?.dailyBudget) out[d.id] = { label: "Weekly budget stopped", value: money(c.dailyBudget * 7) };
    } else if (d.action === "sendMarketingCampaign") {
      const n = mcs.find((x) => x.id === i.campaignId)?.audienceSize ?? segs.find((x) => x.key === i.segmentKey)?.customerCount;
      if (n) out[d.id] = { label: "Customers messaged", value: n.toLocaleString() };
    } else if (d.relatedType === "order") {
      const o = orders.find((x) => x.id === d.relatedId);
      if (o) out[d.id] = { label: "Order value", value: money(o.total) };
    }
  }
  return out;
}

export async function listDecisions(storeId: string, q: z.infer<typeof decisionListQuery>) {
  const statusMap: Record<string, DecisionStatus[] | undefined> = {
    pending: ["PENDING_APPROVAL"],
    approved: ["APPROVED", "EXECUTED"],
    executed: ["EXECUTED", "AUTO_EXECUTED"],
    rejected: ["REJECTED", "EXPIRED"],
    all: undefined,
  };
  const statuses = statusMap[q.status];
  return db.aIDecision.findMany({
    where: { storeId, ...(statuses ? { status: { in: statuses } } : {}) },
    orderBy: { createdAt: "desc" },
    take: q.limit,
    include: { agent: { select: { name: true, key: true } }, reviewedBy: { select: { name: true } } },
  });
}

/** Counts per Approval Center tab (same status groups as listDecisions). */
export async function decisionTabCounts(storeId: string) {
  const rows = await db.aIDecision.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } });
  const n = (...s: DecisionStatus[]) => rows.filter((r) => s.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0);
  return {
    pending: n("PENDING_APPROVAL"),
    approved: n("APPROVED", "EXECUTED"),
    executed: n("EXECUTED", "AUTO_EXECUTED"),
    rejected: n("REJECTED", "EXPIRED"),
    all: rows.reduce((sum, r) => sum + r._count._all, 0),
  };
}

/** One decision with the same shape as listDecisions items (for deep links). */
export async function getDecision(storeId: string, id: string) {
  return db.aIDecision.findFirst({
    where: { id, storeId },
    include: { agent: { select: { name: true, key: true } }, reviewedBy: { select: { name: true } } },
  });
}

export async function pendingDecisionCount(storeId: string) {
  return db.aIDecision.count({ where: { storeId, status: "PENDING_APPROVAL" } });
}

/** Expires stale approvals; waiting automation runs continue down their "rejected" branch. */
export async function expireDecisions() {
  const stale = await db.aIDecision.findMany({
    where: { status: "PENDING_APPROVAL", expiresAt: { lt: new Date() } },
    select: { id: true, automationRunId: true },
    take: 500,
  });
  if (!stale.length) return 0;
  await db.aIDecision.updateMany({ where: { id: { in: stale.map((d) => d.id) } }, data: { status: "EXPIRED" } });
  for (const d of stale) if (d.automationRunId) await enqueue("automation.resume", { runId: d.automationRunId, handle: "rejected" });
  return stale.length;
}
