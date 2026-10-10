import type { JobName, JobPayloads } from "./jobs";

/**
 * Job name → handler. Imports are lazy so the queue module stays light and
 * free of import cycles with the services that enqueue jobs.
 */
export const jobHandlers: { [N in JobName]: (data: JobPayloads[N]) => Promise<unknown> } = {
  "webhook.process": async ({ webhookEventId }) => (await import("@/services/webhook.service")).processWebhook(webhookEventId),
  "automation.dispatch": async ({ eventId }) => (await import("@/services/automation.service")).dispatchEvent(eventId),
  "automation.resume": async ({ runId, handle }) => (await import("@/services/automation.service")).resumeRun(runId, handle),
  "whatsapp.inbound": async ({ messageId }) => (await import("@/services/agents/whatsapp-agent")).handleInboundMessage(messageId),
  "whatsapp.send": async () => undefined, // sends are synchronous today; reserved for rate-limited batch sending
  "order.analyze": async ({ orderId }) => (await import("@/services/order.service")).analyzeOrderRisk(orderId),
  "scheduler.tick": async ({ at }) => (await import("@/services/scheduler.service")).schedulerTick(at ? new Date(at) : new Date()),
  "report.daily": async ({ storeId, date }) => (await import("@/services/report.service")).generateDailyReport(storeId, date),
  "inventory.analyze": async ({ storeId }) => {
    const inv = await import("@/services/inventory.service");
    await inv.snapshotInventory(storeId);
    const { db } = await import("@/lib/db");
    const low = await db.productVariant.findMany({ where: { storeId, inventoryQuantity: { lte: 10 } }, select: { id: true } });
    return inv.checkLowStockForVariants(storeId, low.map((v) => v.id));
  },
  "customers.segment": async ({ storeId }) => {
    const { recomputeAllSegments } = await import("@/services/segment.service");
    const { detectInactiveCustomers } = await import("@/services/customer.service");
    await detectInactiveCustomers(storeId);
    return recomputeAllSegments(storeId);
  },
  "analytics.sync": async ({ storeId }) => (await import("@/services/meta.service")).syncMetaAds(storeId),
  "courier.track": async ({ storeId }) => (await import("@/services/shipment.service")).refreshTracking(storeId),
  "ai.insights": async ({ storeId }) => (await import("@/services/insight.service")).generateInsights(storeId),
  "followup.abandoned": async ({ storeId }) => (await import("@/services/followup.service")).followUpStaleConfirmations(storeId),
  "creative.analyze": async ({ creativeId }) => (await import("@/services/creative.service")).analyzeCreative(creativeId),
  "demo.simulate": async ({ storeId }) => (await import("@/services/demo.service")).simulateDemoActivity(storeId),
};
