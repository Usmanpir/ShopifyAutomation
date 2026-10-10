import { db } from "@/lib/db";
import { runTool } from "@/lib/ai/tools/executor";
import type { ServiceContext } from "@/lib/service-context";
import { requestOrderConfirmation } from "./order.service";
import { getStore } from "./store.service";

const HOUR = 3_600_000;
const MAX_BATCH = 50;

export type ConfirmationPlanRow = {
  id: string;
  name: string;
  customerName: string;
  city: string | null;
  total: number;
  riskLevel: string;
  riskScore: number;
  placedAt: Date;
  kind: "request" | "reminder";
};

function inQuietHours(timeZone: string, start: number, end: number, now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * "Let AI handle" for COD confirmations — the preview. Lists exactly which
 * customers would get a WhatsApp message and which orders are deliberately
 * left for a human (high risk, no phone). Nothing is sent here.
 */
export async function codConfirmationPlan(storeId: string) {
  const store = await getStore(storeId);
  const orders = await db.order.findMany({
    where: { storeId, paymentMethod: "COD", status: { in: ["NEW", "PENDING_CONFIRMATION"] } },
    select: { id: true, name: true, customerName: true, city: true, total: true, riskLevel: true, riskScore: true, placedAt: true, phone: true, confirmationStatus: true },
    orderBy: { placedAt: "asc" },
  });
  const now = Date.now();
  const toSend: ConfirmationPlanRow[] = [];
  const excluded: (ConfirmationPlanRow & { reason: string })[] = [];
  let waitingForReply = 0;
  for (const o of orders) {
    const kind = o.confirmationStatus === "PENDING" ? "reminder" : "request";
    const row: ConfirmationPlanRow = { id: o.id, name: o.name, customerName: o.customerName, city: o.city, total: o.total, riskLevel: o.riskLevel, riskScore: o.riskScore, placedAt: o.placedAt, kind };
    if (o.riskLevel === "HIGH") excluded.push({ ...row, reason: `High risk (${o.riskScore}/100) — needs a person` });
    else if (!o.phone) excluded.push({ ...row, reason: "No phone number" });
    // Already asked: only remind once a full day has passed without a reply.
    else if (kind === "reminder" && now - o.placedAt.getTime() < 24 * HOUR) waitingForReply++;
    else toSend.push(row);
  }
  const { quietHoursStart, quietHoursEnd } = store.settings.automation;
  return {
    toSend: toSend.slice(0, MAX_BATCH),
    overflow: Math.max(0, toSend.length - MAX_BATCH),
    excluded,
    waitingForReply,
    totalValue: toSend.slice(0, MAX_BATCH).reduce((s, o) => s + o.total, 0),
    quietHours: inQuietHours(store.timezone, quietHoursStart, quietHoursEnd) ? { start: quietHoursStart, end: quietHoursEnd } : null,
  };
}

/** How many COD orders "Let AI handle" would act on right now (same rules as the plan). */
export async function actionableCodCount(storeId: string) {
  return db.order.count({
    where: {
      storeId,
      paymentMethod: "COD",
      status: { in: ["NEW", "PENDING_CONFIRMATION"] },
      riskLevel: { not: "HIGH" },
      phone: { not: null },
      OR: [{ confirmationStatus: { not: "PENDING" } }, { placedAt: { lt: new Date(Date.now() - 24 * HOUR) } }],
    },
  });
}

/**
 * Runs the approved plan. The user confirmed the exact list in the preview,
 * so each order is re-validated (still COD, still open, not high risk) and
 * sent through the guarded tool path — validation, RBAC and audit apply.
 */
export async function executeCodConfirmationPlan(ctx: ServiceContext, orderIds: string[]) {
  const ids = [...new Set(orderIds)].slice(0, MAX_BATCH);
  const orders = await db.order.findMany({ where: { storeId: ctx.storeId, id: { in: ids } } });
  const results: { id: string; name: string; ok: boolean; error?: string }[] = [];
  for (const o of orders) {
    if (o.paymentMethod !== "COD" || !["NEW", "PENDING_CONFIRMATION"].includes(o.status) || o.riskLevel === "HIGH") {
      results.push({ id: o.id, name: o.name, ok: false, error: "No longer eligible" });
      continue;
    }
    try {
      if (o.confirmationStatus === "PENDING") {
        await requestOrderConfirmation(ctx, o.id, { reminder: true });
      } else {
        const r = await runTool(ctx, "requestOrderConfirmation", { orderId: o.id });
        if (!r.ok) throw new Error(r.error);
      }
      results.push({ id: o.id, name: o.name, ok: true });
    } catch (err) {
      results.push({ id: o.id, name: o.name, ok: false, error: (err as Error).message });
    }
  }
  return { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
}
