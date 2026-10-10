import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getAIProvider } from "@/lib/ai/factory";
import { audit } from "@/lib/audit";
import { ACTIONS_BY_KEY } from "@/lib/automation/catalog";
import { evaluateRule, getPath, interpolate } from "@/lib/automation/conditions";
import { advanceRun, initialRunState, type EngineDeps } from "@/lib/automation/engine";
import { TEMPLATES_BY_KEY } from "@/lib/automation/templates";
import {
  actionConfigSchema,
  aiDecisionConfigSchema,
  approvalConfigSchema,
  graphSchema,
  notificationConfigSchema,
  triggerConfigSchema,
  type AutomationGraph,
  type GraphNode,
  type RunContext,
  type RunState,
  type RunStatus,
  type RunStep,
} from "@/lib/automation/types";
import { validateGraph } from "@/lib/automation/validate";
import { db } from "@/lib/db";
import { daysBetween } from "@/lib/dates";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { isEventType } from "@/lib/events/types";
import { formatMoney, toMajor } from "@/lib/money";
import type { ServiceContext } from "@/lib/service-context";
import { createDecision } from "./decision.service";
import { analyzeVariantInventory } from "./inventory.service";
import { recommendWinbackCampaign } from "./marketing.service";
import { sendWhatsApp } from "./messaging.service";
import { notify } from "./notification.service";
import { addOrderEvent, addOrderTag, requestOrderConfirmation, transitionOrder } from "./order.service";
import { addCustomerToSegment } from "./segment.service";
import { createShipment } from "./shipment.service";
import { getStore } from "./store.service";
import { createTicket } from "./ticket.service";

// ───────────────────────── CRUD ─────────────────────────

export async function listAutomations(storeId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [automations, runStats] = await Promise.all([
    db.automation.findMany({ where: { storeId, deletedAt: null }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], include: { _count: { select: { nodes: true } } } }),
    db.automationRun.groupBy({ by: ["automationId", "status"], where: { storeId, startedAt: { gte: since } }, _count: { _all: true } }),
  ]);
  return automations.map((a) => {
    const stats = runStats.filter((r) => r.automationId === a.id);
    const count = (s: string) => stats.filter((r) => r.status === s).reduce((n, r) => n + r._count._all, 0);
    const total = stats.reduce((n, r) => n + r._count._all, 0);
    return {
      ...a,
      stats: { runs30d: total, completed: count("COMPLETED"), failed: count("FAILED"), waiting: count("WAITING") + count("AWAITING_APPROVAL"), successRate: total ? Math.round(((total - count("FAILED")) / total) * 1000) / 10 : null },
    };
  });
}

export function toGraph(nodes: { key: string; type: string; label: string; config: unknown; positionX: number; positionY: number }[], edges: { sourceKey: string; targetKey: string; handle: string }[]): AutomationGraph {
  return {
    nodes: nodes.map((n) => ({ key: n.key, type: n.type as GraphNode["type"], label: n.label, config: (n.config ?? {}) as Record<string, unknown>, position: { x: n.positionX, y: n.positionY } })),
    edges: edges.map((e) => ({ source: e.sourceKey, target: e.targetKey, handle: e.handle })),
  };
}

export async function getAutomation(storeId: string, id: string) {
  const a = await db.automation.findFirst({ where: { id, storeId, deletedAt: null }, include: { nodes: true, edges: true } });
  if (!a) throw notFound("Automation");
  const { nodes, edges, ...rest } = a;
  const graph = toGraph(nodes, edges);
  return { ...rest, graph, validation: validateGraph(graph) };
}

export const automationSaveSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(500).nullable().optional(),
  graph: graphSchema,
});

function triggerTypeOf(graph: AutomationGraph): string {
  const trigger = graph.nodes.find((n) => n.type === "TRIGGER");
  const parsed = trigger ? triggerConfigSchema.safeParse(trigger.config) : null;
  if (!parsed?.success) throw badRequest("The workflow needs a valid trigger");
  return parsed.data.event;
}

async function writeGraph(tx: Prisma.TransactionClient, automationId: string, graph: AutomationGraph) {
  await tx.automationEdge.deleteMany({ where: { automationId } });
  await tx.automationNode.deleteMany({ where: { automationId } });
  await tx.automationNode.createMany({
    data: graph.nodes.map((n) => ({ automationId, key: n.key, type: n.type, label: n.label, config: n.config as Prisma.InputJsonValue, positionX: n.position?.x ?? 0, positionY: n.position?.y ?? 0 })),
  });
  if (graph.edges.length) {
    await tx.automationEdge.createMany({
      data: graph.edges.map((e) => ({ automationId, sourceKey: e.source, targetKey: e.target, handle: e.handle || "next" })),
      skipDuplicates: true,
    });
  }
}

export async function createAutomation(ctx: ServiceContext, input: z.infer<typeof automationSaveSchema> & { templateKey?: string; status?: "DRAFT" | "ACTIVE" }) {
  const triggerType = triggerTypeOf(input.graph);
  const automation = await db.$transaction(async (tx) => {
    const a = await tx.automation.create({
      data: {
        storeId: ctx.storeId,
        name: input.name,
        description: input.description ?? null,
        triggerType,
        templateKey: input.templateKey ?? null,
        status: input.status ?? "DRAFT",
        createdById: ctx.actor.type === "USER" ? ctx.actor.id : null,
      },
    });
    await writeGraph(tx, a.id, input.graph);
    return a;
  });
  await audit(ctx, { action: "automation.create", resourceType: "automation", resourceId: automation.id, resourceLabel: automation.name, newValue: { triggerType, nodes: input.graph.nodes.length } });
  return automation;
}

export async function createFromTemplate(ctx: ServiceContext, templateKey: string) {
  const t = TEMPLATES_BY_KEY.get(templateKey);
  if (!t) throw notFound("Template");
  return createAutomation(ctx, { name: t.name, description: t.description, graph: t.graph, templateKey: t.key });
}

export async function updateAutomation(ctx: ServiceContext, id: string, input: z.infer<typeof automationSaveSchema>) {
  const existing = await db.automation.findFirst({ where: { id, storeId: ctx.storeId, deletedAt: null } });
  if (!existing) throw notFound("Automation");
  const triggerType = triggerTypeOf(input.graph);
  if (existing.status === "ACTIVE") {
    const { errors } = validateGraph(input.graph);
    if (errors.length) throw badRequest(`Can't save an active workflow with errors: ${errors[0].message}`, errors);
  }
  await db.$transaction(async (tx) => {
    await tx.automation.update({ where: { id }, data: { name: input.name, description: input.description ?? null, triggerType, version: { increment: 1 } } });
    await writeGraph(tx, id, input.graph);
  });
  await audit(ctx, { action: "automation.update", resourceType: "automation", resourceId: id, resourceLabel: input.name, oldValue: { version: existing.version }, newValue: { version: existing.version + 1, nodes: input.graph.nodes.length } });
  return getAutomation(ctx.storeId, id);
}

export async function setAutomationStatus(ctx: ServiceContext, id: string, status: "ACTIVE" | "PAUSED" | "DRAFT") {
  const a = await getAutomation(ctx.storeId, id);
  if (status === "ACTIVE" && a.validation.errors.length) throw badRequest(`Fix before activating: ${a.validation.errors[0].message}`, a.validation.errors);
  const updated = await db.automation.update({ where: { id }, data: { status } });
  await audit(ctx, { action: `automation.${status.toLowerCase()}`, resourceType: "automation", resourceId: id, resourceLabel: a.name, oldValue: { status: a.status }, newValue: { status } });
  return updated;
}

export async function deleteAutomation(ctx: ServiceContext, id: string) {
  const a = await db.automation.findFirst({ where: { id, storeId: ctx.storeId, deletedAt: null } });
  if (!a) throw notFound("Automation");
  await db.automation.update({ where: { id }, data: { deletedAt: new Date(), status: "PAUSED" } });
  await db.automationRun.updateMany({ where: { automationId: id, status: { in: ["RUNNING", "WAITING", "AWAITING_APPROVAL"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
  await audit(ctx, { action: "automation.delete", resourceType: "automation", resourceId: id, resourceLabel: a.name });
}

export async function listRuns(storeId: string, opts: { automationId?: string; status?: RunStatus; limit?: number } = {}) {
  return db.automationRun.findMany({
    where: { storeId, ...(opts.automationId ? { automationId: opts.automationId } : {}), ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { startedAt: "desc" },
    take: opts.limit ?? 50,
    include: { automation: { select: { name: true } } },
  });
}

// ───────────────────────── Engine wiring ─────────────────────────

type Loaded = Record<string, Record<string, unknown> | null>;

/** Loads fresh entity state referenced by the run context (orders, customers…). */
async function loadEntities(storeId: string, ctx: RunContext): Promise<Loaded> {
  const p = ctx.event.payload as Record<string, string | undefined>;
  const store = await getStore(storeId);
  const order = p.orderId ? await db.order.findFirst({ where: { id: p.orderId, storeId } }) : null;
  const customerId = p.customerId ?? order?.customerId ?? null;
  const customer = customerId ? await db.customer.findFirst({ where: { id: customerId, storeId } }) : null;
  const variant = p.variantId ? await db.productVariant.findFirst({ where: { id: p.variantId, storeId }, include: { product: { select: { title: true } } } }) : null;
  const shipment = p.shipmentId ? await db.shipment.findFirst({ where: { id: p.shipmentId, storeId } }) : order ? await db.shipment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } }) : null;
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  return {
    store: { name: store.name },
    order: order ? { ...order, totalMajor: toMajor(order.total), totalFormatted: money(order.total) } : null,
    customer: customer
      ? { ...customer, firstName: customer.name.split(" ")[0], daysSinceLastOrder: customer.lastOrderAt ? daysBetween(customer.lastOrderAt, new Date()) : null }
      : null,
    variant: variant ? { ...variant, displayName: `${variant.product.title} ${variant.title}` } : null,
    shipment: shipment ? { ...shipment } : null,
    vars: ctx.vars,
  };
}

function engineDeps(storeId: string, automation: { id: string; name: string }, runId: string): EngineDeps {
  const actorCtx: ServiceContext = { storeId, actor: { type: "SYSTEM", name: `Automation · ${automation.name}`, id: automation.id } };
  const resolve = async (path: string, ctx: RunContext) => getPath(await loadEntities(storeId, ctx), path);
  const require = (entities: Loaded, key: string) => {
    const e = entities[key];
    if (!e) throw new Error(`This step needs a ${key}, but the trigger didn't provide one`);
    return e as Record<string, unknown> & { id: string };
  };

  return {
    now: () => new Date(),
    resolveField: resolve,
    async executeAction(node, ctx) {
      const cfg = actionConfigSchema.parse(node.config);
      const def = ACTIONS_BY_KEY.get(cfg.action);
      if (!def) throw new Error(`Unknown action ${cfg.action}`);
      const e = await loadEntities(storeId, ctx);
      const params = cfg.params as Record<string, string>;
      const render = (s: string) => interpolate(s, async (path) => getPath(e, path));
      switch (cfg.action) {
        case "request_order_confirmation": {
          const order = require(e, "order");
          if (!["NEW", "PENDING_CONFIRMATION"].includes(String(order.status))) return { detail: `Skipped — order is ${order.status}` };
          // Several workflows may react to the same order; never message the customer twice.
          if (order.confirmationStatus === "PENDING") return { detail: "Skipped — confirmation already requested" };
          await requestOrderConfirmation(actorCtx, order.id);
          return { detail: `Confirmation sent for ${order.name}` };
        }
        case "send_confirmation_reminder": {
          const order = require(e, "order");
          if (order.confirmationStatus !== "PENDING") return { detail: "Skipped — already answered" };
          await requestOrderConfirmation(actorCtx, order.id, { reminder: true });
          return { detail: `Reminder sent for ${order.name}` };
        }
        case "send_whatsapp_message": {
          const customer = require(e, "customer");
          const text = await render(params.text ?? "");
          await sendWhatsApp({ storeId, phone: customer.phone as string, name: customer.name as string, customerId: customer.id, sender: "SYSTEM", text });
          return { detail: "Message sent" };
        }
        case "send_tracking_update": {
          const order = require(e, "order");
          const shipment = e.shipment;
          if (!shipment?.trackingNumber) return { detail: "Skipped — no tracking number" };
          await sendWhatsApp({
            storeId,
            phone: order.phone as string,
            name: order.customerName as string,
            customerId: order.customerId as string,
            orderId: order.id,
            sender: "SYSTEM",
            template: { name: "shipment_tracking", variables: [String(order.customerName).split(" ")[0], String(order.name), String(shipment.trackingNumber)] },
          });
          await addOrderEvent(storeId, order.id, "tracking_sent", "Tracking shared on WhatsApp", { actorName: actorCtx.actor.name });
          return { detail: `Tracking ${shipment.trackingNumber} sent` };
        }
        case "send_review_request": {
          const order = require(e, "order");
          await sendWhatsApp({
            storeId,
            phone: order.phone as string,
            name: order.customerName as string,
            customerId: order.customerId as string,
            orderId: order.id,
            sender: "SYSTEM",
            template: { name: "review_request", variables: [String(order.customerName).split(" ")[0], String(order.name)] },
          });
          await addOrderEvent(storeId, order.id, "review_requested", "Review requested", { actorName: actorCtx.actor.name });
          return { detail: "Review request sent" };
        }
        case "update_order_status": {
          const order = require(e, "order");
          const map: Record<string, "confirm" | "process" | "cancel"> = { CONFIRMED: "confirm", PROCESSING: "process", CANCELLED: "cancel" };
          const action = map[params.status];
          if (!action) throw new Error(`Unsupported status ${params.status}`);
          if (action === "cancel") {
            // Automations never cancel on their own — route to approval.
            const d = await createDecision(storeId, {
              agentKey: "ORDER",
              title: `Cancel ${order.name} (automation “${automation.name}”)`,
              summary: "An automation step requested cancellation.",
              reasoning: "Cancellations always require a human decision.",
              evidence: [{ label: "Order", value: String(order.name) }, { label: "Status", value: String(order.status) }],
              action: "updateOrderStatus",
              actionInput: { orderId: order.id, action: "cancel", reason: `Automation: ${automation.name}` },
              riskLevel: "HIGH",
              requiresApproval: true,
              relatedType: "order",
              relatedId: order.id,
            });
            return { detail: "Cancellation sent for approval", output: { decisionId: d.id } };
          }
          await transitionOrder(actorCtx, order.id, action);
          return { detail: `Order ${order.name} → ${params.status}` };
        }
        case "add_order_tag": {
          const order = require(e, "order");
          await addOrderTag(actorCtx, order.id, await render(params.tag ?? "automation"));
          return { detail: `Tagged ${order.name}` };
        }
        case "create_manual_review": {
          const order = require(e, "order");
          await addOrderTag(actorCtx, order.id, "manual-review");
          await db.order.update({ where: { id: order.id }, data: { confirmationStatus: order.confirmationStatus === "PENDING" ? "NO_RESPONSE" : undefined } });
          const ticket = await createTicket(actorCtx, {
            subject: `Manual review: ${order.name}`,
            description: (await render(params.reason ?? "Flagged by automation")) + `\nCustomer: ${order.customerName} · ${order.phone ?? ""}`,
            category: "OTHER",
            priority: "HIGH",
            orderId: order.id,
            customerId: (order.customerId as string) ?? undefined,
          });
          return { detail: `Ticket #${ticket.number} created`, output: { ticketId: ticket.id } };
        }
        case "create_shipment": {
          const order = require(e, "order");
          const s = await createShipment(actorCtx, order.id);
          return { detail: `Shipment ${s.trackingNumber}`, output: { shipmentId: s.id } };
        }
        case "create_support_ticket": {
          const ticket = await createTicket(actorCtx, {
            subject: await render(params.subject ?? "Automation ticket"),
            category: "OTHER",
            priority: (params.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") ?? "MEDIUM",
            orderId: (e.order?.id as string) ?? undefined,
            customerId: (e.customer?.id as string) ?? undefined,
          });
          return { detail: `Ticket #${ticket.number}`, output: { ticketId: ticket.id } };
        }
        case "add_customer_to_segment": {
          const customer = require(e, "customer");
          const seg = await addCustomerToSegment(storeId, customer.id, params.segmentKey);
          return { detail: `Added to ${seg.name}` };
        }
        case "recommend_marketing_campaign": {
          const d = await recommendWinbackCampaign(storeId, { customerId: (e.customer?.id as string) ?? undefined });
          return { detail: d ? "Recommendation sent for approval" : "Not enough inactive customers yet", output: d ? { decisionId: d.id } : undefined };
        }
        case "analyze_inventory": {
          const variant = require(e, "variant");
          const insight = await analyzeVariantInventory(storeId, variant.id);
          return { detail: insight.whatHappened, output: { insightId: insight.id } };
        }
        default:
          throw new Error(`Action ${cfg.action} is not implemented`);
      }
    },
    async decide(node, ctx) {
      const cfg = aiDecisionConfigSchema.parse(node.config);
      const e = await loadEntities(storeId, ctx);
      const order = e.order as { riskScore?: number; riskSignals?: unknown } | null;
      const fallback = () => {
        if (order && typeof order.riskScore === "number") {
          const outcome = order.riskScore >= 80 ? cfg.outcomes[0] : cfg.defaultOutcome;
          return { outcome, confidence: 0.7, reasoning: `Rule-based: risk score ${order.riskScore}/100 ${order.riskScore >= 80 ? "≥" : "<"} 80.` };
        }
        return { outcome: cfg.defaultOutcome, confidence: 0.5, reasoning: "No decisive data; using the default branch." };
      };
      const ai = await getAIProvider(storeId);
      const { data } = await ai.generateObject({
        system: "You make a single routing decision inside an ecommerce automation. Choose exactly one outcome and justify it with the data.",
        prompt: JSON.stringify({ question: cfg.question, outcomes: cfg.outcomes, data: { order: e.order, customer: e.customer } }).slice(0, 12000),
        schema: z.object({ outcome: z.string(), confidence: z.number().min(0).max(1), reasoning: z.string() }),
        schemaName: "automation_decision",
        fallback,
      });
      return data;
    },
    async requestApproval(node, ctx) {
      const cfg = approvalConfigSchema.parse(node.config);
      const e = await loadEntities(storeId, ctx);
      const render = (s: string) => interpolate(s, async (path) => getPath(e, path));
      const d = await createDecision(storeId, {
        agentKey: "ORDER",
        title: await render(cfg.title),
        summary: (await render(cfg.summary)) || `Approval step in “${automation.name}”`,
        reasoning: `The “${automation.name}” workflow requires human approval to continue.`,
        evidence: Object.entries(ctx.vars)
          .filter(([, v]) => v && typeof v === "object" && "reasoning" in (v as object))
          .map(([k, v]) => ({ label: k, value: String((v as { reasoning: string }).reasoning) })),
        action: "automation.approval",
        actionInput: { runId },
        riskLevel: cfg.risk,
        requiresApproval: true,
        relatedType: e.order ? "order" : undefined,
        relatedId: (e.order?.id as string) ?? undefined,
        automationRunId: runId,
      });
      return { decisionId: d.id };
    },
    async notify(node, ctx) {
      const cfg = notificationConfigSchema.parse(node.config);
      const e = await loadEntities(storeId, ctx);
      const render = (s: string) => interpolate(s, async (path) => getPath(e, path));
      await notify(storeId, {
        type: "AUTOMATION",
        severity: cfg.severity,
        title: await render(cfg.title),
        body: await render(cfg.body),
        href: e.order ? `/orders/${e.order.id}` : e.variant ? `/products/${e.variant.productId}` : `/automations/${automation.id}`,
        roles: cfg.roles,
      });
    },
  };
}

async function persist(runId: string, state: RunState) {
  const done = state.status === "COMPLETED" || state.status === "FAILED" || state.status === "CANCELLED";
  await db.automationRun.update({
    where: { id: runId },
    data: {
      status: state.status,
      currentNodeKey: state.currentNodeKey,
      resumeAt: state.resumeAt,
      steps: state.steps as unknown as Prisma.InputJsonValue,
      context: state.context as unknown as Prisma.InputJsonValue,
      error: state.error ?? null,
      finishedAt: done ? new Date() : null,
    },
  });
}

async function execute(runId: string, resumeHandle?: string) {
  const run = await db.automationRun.findUnique({ where: { id: runId }, include: { automation: { include: { nodes: true, edges: true } } } });
  if (!run || ["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) return run;
  const graph = toGraph(run.automation.nodes, run.automation.edges);
  const state: RunState = {
    status: run.status,
    currentNodeKey: run.currentNodeKey,
    resumeAt: run.resumeAt,
    steps: (run.steps as unknown as RunStep[]) ?? [],
    context: run.context as unknown as RunContext,
    error: run.error,
  };
  const next = await advanceRun(graph, state, engineDeps(run.storeId, run.automation, run.id), { resumeHandle });
  await persist(run.id, next);
  if (next.status === "FAILED") {
    const store = await getStore(run.storeId);
    if (store.settings.notifications.alerts.automationFailure) {
      await notify(run.storeId, { type: "AUTOMATION", severity: "WARNING", title: `Automation failed: ${run.automation.name}`, body: next.error ?? undefined, href: `/automations/${run.automationId}?tab=runs`, roles: ["OWNER", "ADMIN", "MANAGER"] });
    }
  }
  return next;
}

/** Starts runs for every active automation listening to this event. Idempotent per (automation, event). */
export async function dispatchEvent(eventId: string) {
  const event = await db.domainEvent.findUnique({ where: { id: eventId } });
  if (!event || !isEventType(event.type)) return 0;
  const automations = await db.automation.findMany({
    where: { storeId: event.storeId, status: "ACTIVE", triggerType: event.type, deletedAt: null },
    include: { nodes: true },
  });
  if (!automations.length) return 0;
  const store = await getStore(event.storeId);
  const recentRuns = await db.automationRun.count({ where: { storeId: event.storeId, startedAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recentRuns >= store.settings.automation.maxRunsPerHour) {
    console.warn(`[automation] run limit reached for store ${event.storeId}`);
    return 0;
  }

  let started = 0;
  for (const automation of automations) {
    const trigger = automation.nodes.find((n) => n.type === "TRIGGER");
    const cfg = trigger ? triggerConfigSchema.safeParse(trigger.config) : null;
    const context: RunContext = { event: { type: event.type, id: event.id, payload: event.payload as Record<string, unknown> }, vars: {} };
    if (cfg?.success && cfg.data.filters.length) {
      const entities = await loadEntities(event.storeId, context);
      if (!cfg.data.filters.every((f) => evaluateRule(getPath(entities, f.field), f))) continue;
    }
    try {
      const run = await db.automationRun.create({
        data: { storeId: event.storeId, automationId: automation.id, triggerEvent: event.type, dedupeKey: event.id, context: context as unknown as Prisma.InputJsonValue, status: "RUNNING" },
      });
      await db.automation.update({ where: { id: automation.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
      started++;
      await execute(run.id);
    } catch (err) {
      // Unique (automationId, dedupeKey) violation = already dispatched (job retry). Safe to skip.
      if (!/Unique constraint/i.test((err as Error).message)) throw err;
    }
  }
  return started;
}

export async function resumeRun(runId: string, handle?: string) {
  return execute(runId, handle);
}

/** Called by the scheduler tick: resumes WAITING runs whose resumeAt has passed. */
export async function resumeDueRuns(limit = 200) {
  const due = await db.automationRun.findMany({ where: { status: "WAITING", resumeAt: { lte: new Date() } }, select: { id: true }, take: limit, orderBy: { resumeAt: "asc" } });
  for (const r of due) {
    try {
      await execute(r.id);
    } catch (err) {
      console.error(`[automation] resume ${r.id} failed`, err);
    }
  }
  return due.length;
}

export async function cancelRun(ctx: ServiceContext, runId: string) {
  const run = await db.automationRun.findFirst({ where: { id: runId, storeId: ctx.storeId } });
  if (!run) throw notFound("Run");
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) throw conflict("Run already finished");
  await db.automationRun.update({ where: { id: runId }, data: { status: "CANCELLED", finishedAt: new Date() } });
  await audit(ctx, { action: "automation.run_cancel", resourceType: "automation_run", resourceId: runId });
}

export const testRunSchema = z.object({ orderId: z.string().optional(), customerId: z.string().optional(), variantId: z.string().optional() });

/**
 * Manually runs an automation (POST /api/automations/[id]/run) against a
 * chosen or most recent entity. Waits are honoured, so long workflows
 * continue via the scheduler.
 */
export async function testRun(ctx: ServiceContext, id: string, input: z.infer<typeof testRunSchema>) {
  const a = await getAutomation(ctx.storeId, id);
  if (a.validation.errors.length) throw badRequest(a.validation.errors[0].message, a.validation.errors);
  const payload: Record<string, unknown> = { ...input, manual: true };
  const needsOrder = ["ORDER_CREATED", "ORDER_CONFIRMED", "ORDER_DELIVERED", "ORDER_HIGH_RISK", "ORDER_CANCELLED", "ORDER_FULFILLED", "SHIPMENT_CREATED", "ORDER_RETURNED", "ORDER_DECLINED"].includes(a.triggerType);
  if (needsOrder && !payload.orderId) {
    const latest = await db.order.findFirst({ where: { storeId: ctx.storeId }, orderBy: { placedAt: "desc" } });
    payload.orderId = latest?.id;
    payload.customerId = latest?.customerId;
  }
  if (a.triggerType.startsWith("INVENTORY") && !payload.variantId) {
    const low = await db.productVariant.findFirst({ where: { storeId: ctx.storeId }, orderBy: { inventoryQuantity: "asc" } });
    payload.variantId = low?.id;
  }
  if (a.triggerType === "CUSTOMER_INACTIVE" && !payload.customerId) {
    const c = await db.customer.findFirst({ where: { storeId: ctx.storeId, lastOrderAt: { not: null } }, orderBy: { lastOrderAt: "asc" } });
    payload.customerId = c?.id;
  }
  const context: RunContext = { event: { type: a.triggerType, payload }, vars: {} };
  const run = await db.automationRun.create({
    data: { storeId: ctx.storeId, automationId: id, triggerEvent: `${a.triggerType} (manual)`, dedupeKey: `manual:${Date.now()}`, context: context as unknown as Prisma.InputJsonValue },
  });
  await audit(ctx, { action: "automation.test_run", resourceType: "automation", resourceId: id, resourceLabel: a.name, metadata: { runId: run.id } });
  const state = await execute(run.id);
  return { runId: run.id, status: state && "status" in state ? state.status : "RUNNING", steps: state && "steps" in state ? state.steps : [] };
}

export { initialRunState };
