/** Typed job catalogue for the background queue. */
export type JobPayloads = {
  "webhook.process": { webhookEventId: string };
  "automation.dispatch": { eventId: string };
  "automation.resume": { runId: string; handle?: string };
  "whatsapp.inbound": { messageId: string };
  "whatsapp.send": { messageId: string };
  "order.analyze": { orderId: string };
  "scheduler.tick": { at?: string };
  "report.daily": { storeId: string; date?: string };
  "inventory.analyze": { storeId: string };
  "customers.segment": { storeId: string };
  "analytics.sync": { storeId: string };
  "courier.track": { storeId: string };
  "ai.insights": { storeId: string };
  "followup.abandoned": { storeId: string };
  "creative.analyze": { creativeId: string };
  "demo.simulate": { storeId: string };
};

export type JobName = keyof JobPayloads;
