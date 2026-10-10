import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resumeDueRuns } from "@/services/automation.service";
import { receiveInbound } from "@/services/conversation.service";
import { ingestOrder, transitionOrder } from "@/services/order.service";
import { createTestStore, destroyTestStore, sampleOrder } from "./helpers";

let t: Awaited<ReturnType<typeof createTestStore>>;
beforeAll(async () => {
  t = await createTestStore();
});
afterAll(async () => {
  await destroyTestStore(t.store.id);
});

describe("new COD order → AI risk → WhatsApp confirmation → customer reply", () => {
  let orderId: string;

  it("ingests the order, scores risk and starts the COD confirmation automation", async () => {
    const { order, created } = await ingestOrder(t.store.id, sampleOrder(t.tag), { source: "demo", adjustInventory: true });
    expect(created).toBe(true);
    orderId = order.id;

    const fresh = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { events: true } });
    expect(fresh.riskSignals).toBeTruthy();
    expect(fresh.events.map((e) => e.type)).toEqual(expect.arrayContaining(["placed", "risk_analyzed", "confirmation_sent"]));
    expect(fresh.status).toBe("PENDING_CONFIRMATION");
    expect(fresh.confirmationStatus).toBe("PENDING");

    const msg = await db.message.findFirst({ where: { storeId: t.store.id, templateName: "order_confirmation" } });
    expect(msg?.body).toContain(fresh.name);
    expect(msg?.status).toBe("DELIVERED");

    const run = await db.automationRun.findFirstOrThrow({ where: { storeId: t.store.id, automation: { templateKey: "cod-confirmation" } } });
    expect(run.status).toBe("WAITING");
    expect(run.currentNodeKey).toBe("wait_2h");

    const variant = await db.productVariant.findFirstOrThrow({ where: { externalId: `v-xl-${t.tag}` } });
    expect(variant.inventoryQuantity).toBe(11);
  });

  it("is idempotent for duplicate webhook deliveries", async () => {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const again = await ingestOrder(t.store.id, sampleOrder(t.tag, { externalId: order.externalId!, orderNumber: order.orderNumber, name: order.name }), { source: "demo" });
    expect(again.created).toBe(false);
  });

  it("customer replies 'Han ji confirm' → WhatsApp agent confirms the order and replies", async () => {
    await receiveInbound(t.store.id, { channel: "WHATSAPP", handle: "03001234567", name: "Muhammad Ali", text: "Han ji confirm" });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("CONFIRMED");
    expect(order.confirmationStatus).toBe("CONFIRMED");

    const reply = await db.message.findFirst({ where: { storeId: t.store.id, sender: "AI" }, orderBy: { createdAt: "desc" } });
    expect(reply?.body).toMatch(/confirm/i);
    expect((reply?.aiMeta as { intent: string }).intent).toBe("CONFIRM_ORDER");

    const audit = await db.auditLog.findFirst({ where: { storeId: t.store.id, action: "order.confirm", resourceId: orderId } });
    expect(audit?.actorType).toBe("AI");
    expect(audit?.reason).toContain("Han ji confirm");
  });

  it("resumed automation sees the confirmation and skips the reminder", async () => {
    await db.automationRun.updateMany({ where: { storeId: t.store.id, status: "WAITING" }, data: { resumeAt: new Date(Date.now() - 1000) } });
    await resumeDueRuns();
    const run = await db.automationRun.findFirstOrThrow({ where: { storeId: t.store.id, automation: { templateKey: "cod-confirmation" } } });
    expect(run.status).toBe("COMPLETED");
    const reminder = await db.message.count({ where: { storeId: t.store.id, templateName: "order_confirmation_reminder" } });
    expect(reminder).toBe(0);
  });

  it("answers product questions from live inventory (never invented)", async () => {
    await receiveInbound(t.store.id, { channel: "WHATSAPP", handle: "03001234567", name: "Muhammad Ali", text: "Bhai black shirt XL available hai?" });
    const reply = await db.message.findFirstOrThrow({ where: { storeId: t.store.id, sender: "AI" }, orderBy: { createdAt: "desc" } });
    expect(reply.body).toContain("Premium Black Shirt");
    expect(reply.body).toMatch(/3,990|3990/);
  });

  it("hands off to a human when the request needs judgement", async () => {
    await receiveInbound(t.store.id, { channel: "WHATSAPP", handle: "03001234567", name: "Muhammad Ali", text: "Can I exchange size L for XL? It's been 10 days, special case please" });
    const conv = await db.conversation.findFirstOrThrow({ where: { storeId: t.store.id, channel: "WHATSAPP" } });
    expect(conv.needsAttention).toBe(true);
    expect(conv.attentionReason).toBeTruthy();
    const ticket = await db.supportTicket.findFirst({ where: { storeId: t.store.id, category: "EXCHANGE" } });
    expect(ticket).toBeTruthy();
  });
});

describe("order cancellation rules", () => {
  it("requires a reason and blocks invalid transitions", async () => {
    const { order } = await ingestOrder(t.store.id, sampleOrder(t.tag, { paymentMethod: "CARD", phone: "03111111111" }), { source: "demo" });
    await expect(transitionOrder(t.ownerCtx, order.id, "cancel")).rejects.toThrow(/reason/i);
    const cancelled = await transitionOrder(t.ownerCtx, order.id, "cancel", "Customer changed mind");
    expect(cancelled.status).toBe("CANCELLED");
    await expect(transitionOrder(t.ownerCtx, order.id, "confirm")).rejects.toThrow(/cancelled/i);
    const ev = await db.domainEvent.findFirst({ where: { storeId: t.store.id, type: "ORDER_CANCELLED" } });
    expect(ev).toBeTruthy();
  });
});
