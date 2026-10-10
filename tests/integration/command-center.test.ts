import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { codConfirmationPlan, executeCodConfirmationPlan } from "@/services/confirmation-assist.service";
import { receiveInbound, updateConversation, inboxCounts } from "@/services/conversation.service";
import { listPopular, togglePopular } from "@/services/popular-automations.service";
import { priorityQueue } from "@/services/priority.service";
import { createTestStore, destroyTestStore, userCtx } from "./helpers";

let t: Awaited<ReturnType<typeof createTestStore>>;
let n = 0;

/** A COD order straight in the database (no automations), so "not asked yet" states are easy to set up. */
async function codOrder(over: { riskLevel?: "LOW" | "MEDIUM" | "HIGH"; phone?: string | null; total?: number } = {}) {
  n++;
  return db.order.create({
    data: {
      storeId: t.store.id,
      orderNumber: 900000 + n,
      name: `#9${n.toString().padStart(5, "0")}`,
      customerName: `Customer ${n}`,
      phone: over.phone === undefined ? `92300${String(1000000 + n)}` : over.phone,
      city: "Lahore",
      currency: "PKR",
      subtotal: over.total ?? 500000,
      total: over.total ?? 500000,
      paymentMethod: "COD",
      status: "NEW",
      confirmationStatus: "NOT_REQUIRED",
      riskLevel: over.riskLevel ?? "LOW",
      riskScore: over.riskLevel === "HIGH" ? 80 : 10,
      placedAt: new Date(Date.now() - 3 * 3_600_000),
    },
  });
}

beforeAll(async () => {
  t = await createTestStore();
});
afterAll(async () => {
  await destroyTestStore(t.store.id);
});

describe("Let AI handle — COD confirmations", () => {
  it("previews exactly who will be messaged and leaves risky orders for a person", async () => {
    const safe = await codOrder();
    const risky = await codOrder({ riskLevel: "HIGH" });
    const noPhone = await codOrder({ phone: null });
    const plan = await codConfirmationPlan(t.store.id);
    expect(plan.toSend.map((o) => o.id)).toContain(safe.id);
    expect(plan.toSend.map((o) => o.id)).not.toContain(risky.id);
    expect(plan.excluded.map((o) => o.id)).toEqual(expect.arrayContaining([risky.id, noPhone.id]));
  });

  it("re-checks eligibility when running, so a high-risk order is never messaged", async () => {
    const safe = await codOrder();
    const risky = await codOrder({ riskLevel: "HIGH" });
    const r = await executeCodConfirmationPlan(t.ownerCtx, [safe.id, risky.id]);
    expect(r.sent).toBe(1);
    expect(r.failed.map((f) => f.id)).toEqual([risky.id]);
    expect((await db.order.findUniqueOrThrow({ where: { id: safe.id } })).confirmationStatus).toBe("PENDING");
    expect((await db.order.findUniqueOrThrow({ where: { id: risky.id } })).confirmationStatus).toBe("NOT_REQUIRED");
    const audit = await db.auditLog.findFirst({ where: { storeId: t.store.id, action: "order.request_confirmation", resourceId: safe.id } });
    expect(audit).toBeTruthy();
  });
});

describe("priority engine", () => {
  it("ranks real work by money and urgency, and hides what a role can't act on", async () => {
    await codOrder({ total: 2_500_000 });
    const owner = await priorityQueue(t.store.id, { role: "OWNER" });
    expect(owner.items.map((i) => i.key)).toEqual(expect.arrayContaining(["cod_confirmation", "high_risk"]));
    for (let i = 1; i < owner.items.length; i++) expect(owner.items[i - 1]!.score).toBeGreaterThanOrEqual(owner.items[i]!.score);
    const cod = owner.items.find((i) => i.key === "cod_confirmation")!;
    expect(cod.action.kind).toBe("cod_confirm");
    expect(cod.confidence).toBeNull();

    const marketing = await priorityQueue(t.store.id, { role: "MARKETING_MANAGER" });
    expect(marketing.items.some((i) => i.category === "orders")).toBe(false);

    const viewer = await priorityQueue(t.store.id, { role: "VIEWER" });
    expect(viewer.items.find((i) => i.key === "cod_confirmation")?.action.kind).toBe("link");
  });
});

describe("inbox AI mode", () => {
  it("keeps AI mode and handler in sync and tracks who spoke last", async () => {
    const msg = await receiveInbound(t.store.id, { channel: "WHATSAPP", handle: "923001112233", name: "Ayesha", text: "Hello" });
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: msg.conversationId } });
    expect(conv.lastMessageDirection).toBeTruthy();

    await updateConversation(t.ownerCtx, conv.id, { aiMode: "MANUAL" });
    let c = await db.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect([c.aiMode, c.handler]).toEqual(["MANUAL", "HUMAN"]);

    await updateConversation(t.ownerCtx, conv.id, { handler: "AI" });
    c = await db.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect([c.aiMode, c.handler]).toEqual(["AUTO", "AI"]);

    const counts = await inboxCounts(t.store.id);
    expect(counts.ai + counts.human).toBeGreaterThan(0);
  });
});

describe("popular automations", () => {
  it("installs on first switch-on and pauses on switch-off", async () => {
    await db.automation.updateMany({ where: { storeId: t.store.id, templateKey: "review-request" }, data: { deletedAt: new Date() } });
    await togglePopular(t.ownerCtx, "review-request", true);
    let items = await listPopular(t.store.id);
    expect(items.find((i) => i.key === "review-request")?.on).toBe(true);
    await togglePopular(t.ownerCtx, "review-request", false);
    items = await listPopular(t.store.id);
    expect(items.find((i) => i.key === "review-request")?.on).toBe(false);
  });

  it("built-in daily report maps to the notification setting", async () => {
    await togglePopular(userCtx(t.store.id, "OWNER", t.owner.id), "daily-report", false);
    const store = await db.store.findUniqueOrThrow({ where: { id: t.store.id } });
    expect((store.settings as { notifications: { alerts: { dailyReport: boolean } } }).notifications.alerts.dailyReport).toBe(false);
  });
});
