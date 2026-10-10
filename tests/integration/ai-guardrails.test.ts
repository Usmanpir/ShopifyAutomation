import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runTool } from "@/lib/ai/tools/executor";
import { MetaGraphAdsProvider } from "@/lib/meta/ads";
import { db } from "@/lib/db";
import { aiContext } from "@/lib/service-context";
import { chat } from "@/services/assistant.service";
import { approveDecision, rejectDecision } from "@/services/decision.service";
import { syncMetaAds } from "@/services/meta.service";
import { ingestOrder } from "@/services/order.service";
import { createTestStore, destroyTestStore, sampleOrder, userCtx } from "./helpers";

let t: Awaited<ReturnType<typeof createTestStore>>;
let campaignId: string;

beforeAll(async () => {
  t = await createTestStore();
  const account = await db.metaAccount.create({ data: { storeId: t.store.id, adAccountId: `act_${t.tag}`, name: "Test", currency: "PKR" } });
  const c = await db.campaign.create({ data: { storeId: t.store.id, metaAccountId: account.id, externalId: `c-${t.tag}`, name: "Winter Sales", objective: "OUTCOME_SALES", dailyBudget: 500000 } });
  campaignId = c.id;
});
afterAll(async () => {
  await destroyTestStore(t.store.id);
});

const agent = async (key: "ADS" | "ORDER" | "WHATSAPP") => db.aIAgent.findUniqueOrThrow({ where: { storeId_key: { storeId: t.store.id, key } } });

describe("AI tool guardrails", () => {
  it("validates tool input against its schema", async () => {
    const ads = await agent("ADS");
    const r = await runTool(aiContext(t.store.id, ads.name, ads.id), "changeCampaignBudget", { campaignId }, { agent: ads });
    expect(r).toMatchObject({ ok: false, status: "invalid" });
  });

  it("denies tools outside the agent's allow-list", async () => {
    const wa = await agent("WHATSAPP");
    const r = await runTool(aiContext(t.store.id, wa.name, wa.id), "changeCampaignBudget", { campaignId, dailyBudget: 600000 }, { agent: wa });
    expect(r).toMatchObject({ ok: false, status: "denied" });
  });

  it("small budget changes execute directly and are audited", async () => {
    const ads = await agent("ADS");
    const r = await runTool(aiContext(t.store.id, ads.name, ads.id), "changeCampaignBudget", { campaignId, dailyBudget: 550000 }, { agent: ads });
    expect(r).toMatchObject({ ok: true, status: "executed" });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).dailyBudget).toBe(550000);
    expect(await db.auditLog.findFirst({ where: { storeId: t.store.id, action: "ai.tool.changeCampaignBudget", actorType: "AI" } })).toBeTruthy();
  });

  it("large budget changes require approval → human approves → executed → audit log", async () => {
    const ads = await agent("ADS");
    const r = await runTool(aiContext(t.store.id, ads.name, ads.id), "changeCampaignBudget", { campaignId, dailyBudget: 1_500_000 }, { agent: ads });
    expect(r.status).toBe("approval_required");
    const decisionId = (r as { decisionId: string }).decisionId;
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).dailyBudget).toBe(550000); // unchanged until approved

    const approved = await approveDecision(t.ownerCtx, decisionId, "Go for it");
    expect(approved.status).toBe("EXECUTED");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).dailyBudget).toBe(1_500_000);
    expect(await db.auditLog.findFirst({ where: { storeId: t.store.id, action: "approval.approve", resourceId: decisionId } })).toBeTruthy();
    await expect(approveDecision(t.ownerCtx, decisionId)).rejects.toThrow(/already been reviewed/);
  });

  it("refunds always require approval, and rejected actions never run", async () => {
    const { order } = await ingestOrder(t.store.id, sampleOrder(t.tag, { paymentMethod: "CARD", phone: "03215550000" }), { source: "demo" });
    const order2 = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    const r = await runTool(aiContext(t.store.id, "Support Agent"), "refundOrder", { orderId: order2.id, amountMajor: 1000, reason: "Damaged" });
    expect(r.status).toBe("approval_required");
    await rejectDecision(t.ownerCtx, (r as { decisionId: string }).decisionId, "Not eligible");
    expect((await db.order.findUniqueOrThrow({ where: { id: order2.id } })).paymentStatus).toBe(order2.paymentStatus);
  });

  it("AI never cancels orders without approval", async () => {
    const { order } = await ingestOrder(t.store.id, sampleOrder(t.tag, { phone: "03214440000" }), { source: "demo" });
    const orderAgent = await agent("ORDER");
    const r = await runTool(aiContext(t.store.id, orderAgent.name, orderAgent.id), "updateOrderStatus", { orderId: order.id, action: "cancel", reason: "Looks fake" }, { agent: orderAgent });
    expect(r.status).toBe("approval_required");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).not.toBe("CANCELLED");
  });

  it("enforces user role permissions", async () => {
    const { order } = await ingestOrder(t.store.id, sampleOrder(t.tag, { phone: "03213330000" }), { source: "demo" });
    const viewer = await runTool(userCtx(t.store.id, "VIEWER"), "updateOrderStatus", { orderId: order.id, action: "confirm" });
    expect(viewer).toMatchObject({ ok: false, status: "denied" });
    const marketing = await runTool(userCtx(t.store.id, "MARKETING_MANAGER"), "refundOrder", { orderId: order.id, amountMajor: 10, reason: "Damaged item" });
    expect(marketing.status).toBe("denied");
  });
});

describe("AI assistant (local provider)", () => {
  it("answers business questions with grounded data blocks", async () => {
    const res = await chat(t.ownerCtx, { message: "Which products are low in stock?" });
    expect(res.message.toolCalls).toContain("getLowStock");
    expect(res.message.blocks[0]).toMatchObject({ type: "table" });
    expect(res.message.content).toMatch(/Premium Black Shirt/);
  });
  it("routes write intents through the approval center", async () => {
    const res = await chat(t.ownerCtx, { message: "Show pending COD orders" });
    expect(res.message.toolCalls).toContain("listOrders");
  });
});

describe("Meta synchronization", () => {
  it("is a no-op in demo mode", async () => {
    expect(await syncMetaAds(t.store.id)).toMatchObject({ synced: false, reason: "demo" });
  });
  it("maps Graph API insights (purchases de-duplicated, minor units)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              ad_id: "1", adset_id: "2", campaign_id: "3", date_start: "2026-10-01", spend: "1500.50", impressions: "10000", reach: "8000", clicks: "150",
              actions: [{ action_type: "purchase", value: "4" }, { action_type: "omni_purchase", value: "4" }, { action_type: "lead", value: "2" }],
              action_values: [{ action_type: "purchase", value: "21000" }, { action_type: "omni_purchase", value: "21000" }],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const rows = await new MetaGraphAdsProvider("token").fetchInsights("act_1", "2026-10-01", "2026-10-01");
    expect(rows[0]).toMatchObject({ spend: 150050, purchases: 4, revenue: 2_100_000, leads: 2, clicks: 150 });
    fetchMock.mockRestore();
  });
});
