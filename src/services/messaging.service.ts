import type { Channel, MessageSender } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { WhatsAppCloudProvider } from "@/lib/whatsapp/cloud-api";
import { DemoWhatsAppProvider } from "@/lib/whatsapp/demo";
import type { MessagingProvider } from "@/lib/whatsapp/types";

/** Resolves the WhatsApp provider for a store (Cloud API when connected, demo otherwise). */
export async function getMessagingProvider(storeId: string): Promise<MessagingProvider> {
  const [store, integration] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { demoMode: true } }),
    db.integration.findUnique({ where: { storeId_provider: { storeId, provider: "WHATSAPP" } } }),
  ]);
  if (!store?.demoMode && integration?.status === "CONNECTED" && integration.credentialsEnc) {
    const creds = decryptJson<{ accessToken: string }>(integration.credentialsEnc);
    const config = integration.config as { phoneNumberId?: string };
    if (creds?.accessToken && config.phoneNumberId) {
      return new WhatsAppCloudProvider({ accessToken: creds.accessToken, phoneNumberId: config.phoneNumberId });
    }
  }
  if (!store?.demoMode && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return new WhatsAppCloudProvider({ accessToken: process.env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID });
  }
  return new DemoWhatsAppProvider();
}

export function renderTemplate(body: string, variables: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, i) => variables[Number(i) - 1] ?? "");
}

/** Gets or creates the conversation thread for a contact on a channel. */
export async function upsertConversation(
  storeId: string,
  input: { channel: Channel; handle: string; name: string; customerId?: string | null; orderId?: string | null },
) {
  return db.conversation.upsert({
    where: { storeId_channel_externalThreadId: { storeId, channel: input.channel, externalThreadId: input.handle } },
    create: {
      storeId,
      channel: input.channel,
      externalThreadId: input.handle,
      contactHandle: input.handle,
      contactName: input.name,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
    },
    update: {
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.orderId ? { orderId: input.orderId } : {}),
    },
  });
}

export type OutboundInput = {
  storeId: string;
  phone: string | null | undefined;
  name: string;
  customerId?: string | null;
  orderId?: string | null;
  sender: MessageSender;
  senderUserId?: string | null;
  text?: string;
  template?: { name: string; variables: string[]; language?: string };
  aiMeta?: Record<string, unknown>;
};

/**
 * Sends a WhatsApp message and records it. Every outbound message — AI,
 * agent, automation — goes through here so history and delivery status are
 * always complete.
 */
export async function sendWhatsApp(input: OutboundInput) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw badRequest("Customer has no valid WhatsApp number");
  if (!input.text && !input.template) throw badRequest("Message is empty");

  let body = input.text ?? "";
  let template: { name: string; language: string; variables: string[] } | null = null;
  if (input.template) {
    const t = await db.messageTemplate.findFirst({
      where: { storeId: input.storeId, name: input.template.name, ...(input.template.language ? { language: input.template.language } : {}) },
    });
    if (!t) throw notFound(`WhatsApp template "${input.template.name}"`);
    body = renderTemplate(t.body, input.template.variables);
    template = { name: t.name, language: t.language, variables: input.template.variables };
  }

  const conversation = await upsertConversation(input.storeId, {
    channel: "WHATSAPP",
    handle: phone,
    name: input.name,
    customerId: input.customerId,
    orderId: input.orderId,
  });

  const message = await db.message.create({
    data: {
      storeId: input.storeId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sender: input.sender,
      senderUserId: input.senderUserId ?? null,
      body,
      templateName: template?.name ?? null,
      status: "QUEUED",
      aiMeta: (input.aiMeta ?? undefined) as never,
    },
  });

  const provider = await getMessagingProvider(input.storeId);
  try {
    const result = template ? await provider.sendTemplate(phone, template) : await provider.sendText(phone, body);
    await db.message.update({ where: { id: message.id }, data: { externalId: result.externalId, status: result.status } });
  } catch (err) {
    await db.message.update({ where: { id: message.id }, data: { status: "FAILED", error: (err as Error).message.slice(0, 500) } });
    throw err;
  } finally {
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 140), lastMessageDirection: "OUTBOUND" },
    });
  }
  return { message, conversation };
}

/** Applies a delivery/read status update from the provider webhook. Status never moves backwards. */
const STATUS_RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, RECEIVED: 0 } as const;
export async function applyStatusUpdate(externalId: string, status: "SENT" | "DELIVERED" | "READ" | "FAILED", error?: string) {
  const msg = await db.message.findFirst({ where: { externalId } });
  if (!msg) return false;
  if (status !== "FAILED" && STATUS_RANK[status] <= STATUS_RANK[msg.status]) return true;
  await db.message.update({ where: { id: msg.id }, data: { status, error: error ?? null } });
  return true;
}
