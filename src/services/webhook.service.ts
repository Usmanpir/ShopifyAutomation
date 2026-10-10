import type { Prisma } from "@/generated/prisma/client";
import type { WebhookProvider } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { publishEvent } from "@/lib/events/bus";
import { enqueue } from "@/lib/queue";
import { parseWhatsAppWebhook } from "@/lib/whatsapp/webhook";
import { receiveInbound } from "./conversation.service";
import { applyStatusUpdate } from "./messaging.service";
import { processShopifyWebhook } from "./shopify.service";

/**
 * Webhook pipeline: endpoint verifies the signature → recordWebhook stores
 * the raw event (idempotent on provider delivery id) → queue → worker runs
 * processWebhook → domain services → automation engine.
 */
export async function recordWebhook(input: { provider: WebhookProvider; topic: string; externalId: string; payload: unknown; storeId: string | null }) {
  try {
    const event = await db.webhookEvent.create({
      data: {
        provider: input.provider,
        topic: input.topic,
        externalId: input.externalId,
        payload: input.payload as Prisma.InputJsonValue,
        storeId: input.storeId,
        status: input.storeId ? "QUEUED" : "IGNORED",
        error: input.storeId ? null : "No store matches this webhook",
      },
    });
    if (input.storeId) await enqueue("webhook.process", { webhookEventId: event.id }, { jobId: `wh:${event.id}` });
    return { id: event.id, duplicate: false };
  } catch (err) {
    if (/Unique constraint/i.test((err as Error).message)) return { id: null, duplicate: true };
    throw err;
  }
}

export async function processWebhook(webhookEventId: string) {
  const event = await db.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!event || !event.storeId || event.status === "PROCESSED") return;
  await db.webhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
  try {
    switch (event.provider) {
      case "SHOPIFY":
        await processShopifyWebhook(event.storeId, event.topic, event.payload);
        break;
      case "WHATSAPP":
        await processWhatsApp(event.storeId, event.payload);
        break;
      case "META":
        await processMeta(event.storeId, event.payload);
        break;
      default:
        break;
    }
    await db.webhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), error: null } });
  } catch (err) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { status: "FAILED", error: (err as Error).message.slice(0, 1000) } });
    throw err; // let the queue retry with backoff
  }
}

async function processWhatsApp(storeId: string, payload: unknown) {
  const parsed = parseWhatsAppWebhook(payload);
  for (const m of parsed.messages) {
    await receiveInbound(storeId, { channel: "WHATSAPP", handle: m.from, name: m.profileName, text: m.text, externalId: m.externalId, timestamp: m.timestamp, mediaType: m.mediaType });
  }
  for (const s of parsed.statuses) await applyStatusUpdate(s.externalId, s.status, s.error);
}

type MetaEntry = {
  id: string;
  messaging?: { sender: { id: string }; message?: { mid: string; text?: string; is_echo?: boolean }; timestamp: number }[];
  changes?: { field: string; value: Record<string, unknown> }[];
};

async function processMeta(storeId: string, payload: unknown) {
  const p = payload as { object: string; entry: MetaEntry[] };
  const channel = p.object === "instagram" ? "INSTAGRAM" : "FACEBOOK";
  for (const entry of p.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      if (!m.message?.text || m.message.is_echo) continue;
      await receiveInbound(storeId, { channel, handle: m.sender.id, name: null, text: m.message.text, externalId: m.message.mid, timestamp: new Date(m.timestamp) });
    }
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field === "leadgen") {
        const leadId = String(v.leadgen_id);
        const lead = await db.metaLead.upsert({
          where: { storeId_externalId: { storeId, externalId: leadId } },
          create: { storeId, externalId: leadId, platform: channel, formName: String(v.form_id ?? "Lead form"), name: "New lead", data: v as Prisma.InputJsonValue },
          update: {},
        });
        await publishEvent(storeId, "META_LEAD_RECEIVED", { title: `New ${channel === "INSTAGRAM" ? "Instagram" : "Facebook"} lead`, tone: "info", href: "/ads?tab=social", payload: { leadId: lead.id } });
      }
      if ((change.field === "feed" && v.item === "comment" && v.verb === "add") || change.field === "comments") {
        const id = String(v.comment_id ?? v.id);
        await db.socialComment.upsert({
          where: { storeId_externalId: { storeId, externalId: id } },
          create: {
            storeId,
            externalId: id,
            platform: channel,
            postId: String(v.post_id ?? (v.media as { id?: string } | undefined)?.id ?? ""),
            authorName: String((v.from as { name?: string; username?: string } | undefined)?.name ?? (v.from as { username?: string } | undefined)?.username ?? "Someone"),
            body: String(v.message ?? v.text ?? ""),
          },
          update: {},
        });
      }
    }
  }
}

/** Resolve the store for a WhatsApp webhook by phone_number_id. */
export async function storeForWhatsAppPhone(phoneNumberId: string | null) {
  if (!phoneNumberId) return null;
  const integration = await db.integration.findFirst({ where: { provider: "WHATSAPP", config: { path: ["phoneNumberId"], equals: phoneNumberId } } });
  if (integration) return integration.storeId;
  if (process.env.WHATSAPP_PHONE_NUMBER_ID === phoneNumberId) {
    const first = await db.store.findFirst({ orderBy: { createdAt: "asc" } });
    return first?.id ?? null;
  }
  return null;
}

export async function storeForMetaPage(pageId: string | null) {
  if (!pageId) return null;
  const integration = await db.integration.findFirst({ where: { provider: { in: ["FACEBOOK", "INSTAGRAM"] }, config: { path: ["pageId"], equals: pageId } } });
  if (integration) return integration.storeId;
  const account = await db.metaAccount.findFirst({ where: { OR: [{ pageId }, { instagramId: pageId }] } });
  return account?.storeId ?? null;
}
