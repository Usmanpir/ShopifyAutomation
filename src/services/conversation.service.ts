import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Channel } from "@/generated/prisma/enums";
import { getAIProvider } from "@/lib/ai/factory";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { startOfDayTz } from "@/lib/dates";
import { badRequest, notFound } from "@/lib/errors";
import { publishEvent } from "@/lib/events/bus";
import { graphRequest } from "@/lib/meta/graph";
import { normalizePhone } from "@/lib/phone";
import { enqueue } from "@/lib/queue";
import type { ServiceContext } from "@/lib/service-context";
import { sendWhatsApp, upsertConversation } from "./messaging.service";

export const conversationListQuery = z.object({
  channel: z.enum(["WHATSAPP", "FACEBOOK", "INSTAGRAM"]).optional(),
  filter: z.enum(["all", "needs_reply", "waiting", "unread", "attention", "ai", "human", "mine", "resolved"]).catch("all").default("all"),
  q: z.string().trim().max(100).optional(),
  tag: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** A person has to answer: the AI asked for help, or a human-handled chat where the customer spoke last. */
const NEEDS_REPLY: Prisma.ConversationWhereInput = { OR: [{ needsAttention: true }, { handler: "HUMAN", lastMessageDirection: "INBOUND" }] };
/** We spoke last; the ball is in the customer's court. */
const WAITING: Prisma.ConversationWhereInput = { lastMessageDirection: "OUTBOUND", needsAttention: false };

/** Counts for the inbox status tabs (open conversations only, except Resolved). */
export async function inboxCounts(storeId: string, channel?: string) {
  const base: Prisma.ConversationWhereInput = { storeId, status: { in: ["OPEN", "PENDING"] }, ...(channel ? { channel: channel as Channel } : {}) };
  const [needsReply, waiting, ai, human, resolved] = await Promise.all([
    db.conversation.count({ where: { ...base, ...NEEDS_REPLY } }),
    db.conversation.count({ where: { ...base, ...WAITING } }),
    db.conversation.count({ where: { ...base, handler: "AI", needsAttention: false } }),
    db.conversation.count({ where: { ...base, handler: "HUMAN" } }),
    db.conversation.count({ where: { storeId, status: { in: ["RESOLVED", "CLOSED"] }, ...(channel ? { channel: channel as Channel } : {}) } }),
  ]);
  return { needs_reply: needsReply, waiting, ai, human, resolved };
}

export async function listConversations(storeId: string, userId: string, q: z.infer<typeof conversationListQuery>) {
  const where: Prisma.ConversationWhereInput = {
    storeId,
    ...(q.channel ? { channel: q.channel } : {}),
    ...(q.filter === "resolved" ? { status: { in: ["RESOLVED", "CLOSED"] } } : { status: { in: ["OPEN", "PENDING"] } }),
    ...(q.filter === "needs_reply" ? NEEDS_REPLY : {}),
    ...(q.filter === "waiting" ? WAITING : {}),
    ...(q.filter === "unread" ? { unreadCount: { gt: 0 } } : {}),
    ...(q.filter === "attention" ? { needsAttention: true } : {}),
    ...(q.filter === "ai" ? { handler: "AI", needsAttention: false } : {}),
    ...(q.filter === "human" ? { handler: "HUMAN" } : {}),
    ...(q.filter === "mine" ? { assignedToId: userId } : {}),
    ...(q.tag ? { tags: { some: { name: q.tag } } } : {}),
    ...(q.q
      ? {
          OR: [
            { contactName: { contains: q.q, mode: "insensitive" } },
            { contactHandle: { contains: q.q.replace(/\D/g, "") || q.q } },
            { messages: { some: { body: { contains: q.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [items, counts, statusCounts] = await Promise.all([
    db.conversation.findMany({
      where,
      orderBy: [{ needsAttention: "desc" }, { lastMessageAt: "desc" }],
      take: q.limit,
      include: {
        tags: true,
        assignedTo: { select: { id: true, name: true } },
        // Order number on every row: the linked order, else the customer's latest.
        customer: { select: { id: true, name: true, orders: { orderBy: { placedAt: "desc" }, take: 1, select: { id: true, name: true, status: true } } } },
        order: { select: { id: true, name: true, status: true } },
      },
    }),
    db.conversation.groupBy({
      by: ["channel"],
      where: { storeId, status: { in: ["OPEN", "PENDING"] } },
      _sum: { unreadCount: true },
      _count: { _all: true },
    }),
    inboxCounts(storeId, q.channel),
  ]);
  return {
    items,
    statusCounts,
    channelCounts: counts.map((c) => ({ channel: c.channel, open: c._count._all, unread: c._sum.unreadCount ?? 0 })),
  };
}

export async function getConversation(storeId: string, id: string) {
  const conversation = await db.conversation.findFirst({
    where: { id, storeId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
      tags: true,
      assignedTo: { select: { id: true, name: true } },
      customer: true,
      order: { include: { items: true, shipments: { orderBy: { createdAt: "desc" }, take: 1 } } },
      tickets: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!conversation) throw notFound("Conversation");
  const recentOrders = conversation.customerId
    ? await db.order.findMany({
        where: { customerId: conversation.customerId },
        orderBy: { placedAt: "desc" },
        take: 5,
        select: { id: true, name: true, total: true, status: true, placedAt: true, confirmationStatus: true },
      })
    : [];
  // Names of team members who sent messages, so agent bubbles can show who replied.
  const senderIds = [...new Set(conversation.messages.map((m) => m.senderUserId).filter(Boolean))] as string[];
  const senders = senderIds.length ? await db.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true } }) : [];
  const senderNames = Object.fromEntries(senders.map((u) => [u.id, u.name])) as Record<string, string>;
  return { ...conversation, recentOrders, senderNames };
}

export async function markConversationRead(storeId: string, id: string) {
  await db.conversation.updateMany({ where: { id, storeId }, data: { unreadCount: 0 } });
}

/** Sends a message on whatever channel the conversation lives on. */
async function sendOnChannel(
  storeId: string,
  conversation: { id: string; channel: Channel; contactHandle: string; contactName: string; customerId: string | null; orderId: string | null },
  text: string,
  sender: { type: "AI" | "AGENT" | "SYSTEM"; userId?: string | null; aiMeta?: Record<string, unknown> },
) {
  if (conversation.channel === "WHATSAPP") {
    return sendWhatsApp({
      storeId,
      phone: conversation.contactHandle,
      name: conversation.contactName,
      customerId: conversation.customerId,
      orderId: conversation.orderId,
      sender: sender.type,
      senderUserId: sender.userId,
      text,
      aiMeta: sender.aiMeta,
    });
  }
  // Facebook / Instagram via the Page Send API (or recorded locally in demo mode).
  const message = await db.message.create({
    data: {
      storeId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sender: sender.type,
      senderUserId: sender.userId ?? null,
      body: text,
      status: "QUEUED",
      aiMeta: (sender.aiMeta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  const [store, integration] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { demoMode: true } }),
    db.integration.findUnique({ where: { storeId_provider: { storeId, provider: conversation.channel === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM" } } }),
  ]);
  try {
    const creds = integration?.credentialsEnc ? decryptJson<{ pageAccessToken?: string }>(integration.credentialsEnc) : null;
    const pageId = (integration?.config as { pageId?: string } | undefined)?.pageId;
    if (!store?.demoMode && integration?.status === "CONNECTED" && creds?.pageAccessToken && pageId) {
      const res = await graphRequest<{ message_id: string }>(`${pageId}/messages`, creds.pageAccessToken, {
        method: "POST",
        body: { recipient: { id: conversation.contactHandle }, messaging_type: "RESPONSE", message: { text } },
      });
      await db.message.update({ where: { id: message.id }, data: { status: "SENT", externalId: res.message_id } });
    } else {
      await db.message.update({ where: { id: message.id }, data: { status: "DELIVERED" } });
    }
  } catch (err) {
    await db.message.update({ where: { id: message.id }, data: { status: "FAILED", error: (err as Error).message.slice(0, 500) } });
    throw err;
  } finally {
    await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 140), lastMessageDirection: "OUTBOUND" } });
  }
  return { message, conversation };
}

export { sendOnChannel };

export const agentReplySchema = z.object({ text: z.string().trim().min(1).max(4096) });

/** A human agent replies. Replying implicitly takes over from the AI. */
export async function sendAgentReply(ctx: ServiceContext, conversationId: string, text: string) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, storeId: ctx.storeId } });
  if (!conv) throw notFound("Conversation");
  const result = await sendOnChannel(ctx.storeId, conv, text, { type: "AGENT", userId: ctx.actor.id });
  await db.conversation.update({
    where: { id: conv.id },
    data: {
      handler: "HUMAN",
      aiMode: conv.aiMode === "AUTO" ? "SUGGEST" : conv.aiMode,
      assignedToId: conv.assignedToId ?? ctx.actor.id ?? null,
      needsAttention: false,
      attentionReason: null,
      unreadCount: 0,
    },
  });
  await audit(ctx, { action: "conversation.reply", resourceType: "conversation", resourceId: conv.id, resourceLabel: conv.contactName, newValue: { length: text.length } });
  return result.message;
}

export const conversationUpdateSchema = z.object({
  handler: z.enum(["AI", "HUMAN"]).optional(),
  /** MANUAL: AI stays silent · SUGGEST: AI drafts for a person · AUTO: AI replies (approved topics only). */
  aiMode: z.enum(["MANUAL", "SUGGEST", "AUTO"]).optional(),
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
  assignedToId: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  dismissAttention: z.boolean().optional(),
});

export async function updateConversation(ctx: ServiceContext, id: string, input: z.infer<typeof conversationUpdateSchema>) {
  const conv = await db.conversation.findFirst({ where: { id, storeId: ctx.storeId }, include: { tags: true } });
  if (!conv) throw notFound("Conversation");
  const data: Prisma.ConversationUpdateInput = {};
  // AI mode and handler move together: AUTO means the AI answers; anything else means a person does.
  if (input.aiMode && !input.handler) input.handler = input.aiMode === "AUTO" ? "AI" : "HUMAN";
  if (input.handler && !input.aiMode) input.aiMode = input.handler === "AI" ? "AUTO" : conv.aiMode === "AUTO" ? "SUGGEST" : conv.aiMode;
  if (input.aiMode) data.aiMode = input.aiMode;
  if (input.handler) {
    data.handler = input.handler;
    if (input.handler === "HUMAN") {
      data.assignedTo = { connect: { id: input.assignedToId ?? ctx.actor.id! } };
    } else {
      // Handing back to the AI means nobody needs to reply by hand. (Taking over keeps it in
      // "Needs reply" until a person actually answers — sendAgentReply clears it.)
      data.needsAttention = false;
      data.attentionReason = null;
    }
  }
  if (input.status === "RESOLVED" || input.status === "CLOSED") {
    data.needsAttention = false;
    data.attentionReason = null;
  }
  if (input.status) data.status = input.status;
  if (input.assignedToId !== undefined && !input.handler) {
    data.assignedTo = input.assignedToId ? { connect: { id: input.assignedToId } } : { disconnect: true };
  }
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.dismissAttention) {
    data.needsAttention = false;
    data.attentionReason = null;
  }
  if (input.tags) {
    const tags = await Promise.all(
      input.tags.map((name) =>
        db.conversationTag.upsert({ where: { storeId_name: { storeId: ctx.storeId, name } }, create: { storeId: ctx.storeId, name }, update: {} }),
      ),
    );
    data.tags = { set: tags.map((t) => ({ id: t.id })) };
  }
  const updated = await db.conversation.update({ where: { id }, data });
  await audit(ctx, {
    action: input.handler === "HUMAN" ? "conversation.takeover" : input.handler === "AI" ? "conversation.handback" : "conversation.update",
    resourceType: "conversation",
    resourceId: id,
    resourceLabel: conv.contactName,
    oldValue: { handler: conv.handler, status: conv.status, tags: conv.tags.map((t) => t.name) },
    newValue: input,
  });
  if (input.handler === "HUMAN" && conv.handler !== "HUMAN") {
    await db.message.create({
      data: { storeId: ctx.storeId, conversationId: id, direction: "OUTBOUND", sender: "SYSTEM", body: `${ctx.actor.name} took over the conversation`, status: "DELIVERED" },
    });
  }
  return updated;
}

export type InboundInput = {
  channel: Channel;
  handle: string;
  name: string | null;
  text: string;
  externalId?: string | null;
  timestamp?: Date;
  mediaType?: string;
};

/**
 * Records an inbound customer message (from webhooks or the demo simulator)
 * and hands it to the AI agent when the conversation is AI-handled.
 */
export async function receiveInbound(storeId: string, input: InboundInput) {
  if (input.externalId) {
    const dup = await db.message.findUnique({ where: { storeId_externalId: { storeId, externalId: input.externalId } } });
    if (dup) return dup;
  }
  const handle = input.channel === "WHATSAPP" ? (normalizePhone(input.handle) ?? input.handle) : input.handle;
  const customer =
    input.channel === "WHATSAPP" ? await db.customer.findFirst({ where: { storeId, phone: handle, deletedAt: null } }) : null;
  const conversation = await upsertConversation(storeId, {
    channel: input.channel,
    handle,
    name: customer?.name ?? input.name ?? handle,
    customerId: customer?.id ?? null,
  });
  const message = await db.message.create({
    data: {
      storeId,
      conversationId: conversation.id,
      direction: "INBOUND",
      sender: "CUSTOMER",
      body: input.text.slice(0, 4096),
      mediaType: input.mediaType ?? null,
      externalId: input.externalId ?? null,
      status: "RECEIVED",
      ...(input.timestamp ? { createdAt: input.timestamp } : {}),
    },
  });
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: input.text.slice(0, 140),
      lastMessageDirection: "INBOUND",
      unreadCount: { increment: 1 },
      // A resolved chat that comes back to life starts with the AI again — unless a person set it to manual.
      ...(conversation.status === "RESOLVED" || conversation.status === "CLOSED"
        ? conversation.aiMode === "MANUAL"
          ? { status: "OPEN" }
          : { status: "OPEN", handler: "AI", aiMode: "AUTO" }
        : {}),
    },
  });
  await publishEvent(storeId, "CUSTOMER_MESSAGE_RECEIVED", {
    title: `${conversation.contactName}: “${input.text.slice(0, 60)}”`,
    tone: "info",
    href: `/conversations?c=${conversation.id}`,
    payload: { conversationId: conversation.id, customerId: customer?.id ?? null, messageId: message.id, channel: input.channel },
  });
  const fresh = await db.conversation.findUnique({ where: { id: conversation.id }, select: { handler: true } });
  if (fresh?.handler === "AI") await enqueue("whatsapp.inbound", { messageId: message.id });
  return message;
}

const suggestionsSchema = z.object({ suggestions: z.array(z.string().max(500)).min(1).max(3) });

/** AI suggested replies for human agents, grounded in the WhatsApp agent's tool lookups. */
export async function suggestReplies(storeId: string, conversationId: string) {
  const conv = await getConversation(storeId, conversationId);
  const lastInbound = [...conv.messages].reverse().find((m) => m.direction === "INBOUND");
  if (!lastInbound) return [];
  const { draftReply } = await import("./agents/whatsapp-agent");
  const draft = await draftReply(storeId, conv.id, lastInbound.body);
  const ai = await getAIProvider(storeId);
  const history = conv.messages.slice(-8).map((m) => `${m.direction === "INBOUND" ? "Customer" : "Store"}: ${m.body}`).join("\n");
  const { data } = await ai.generateObject({
    system: "You write short, friendly WhatsApp replies for a fashion store's support agents. Use only facts provided. Match the customer's language.",
    prompt: `Conversation:\n${history}\n\nGrounded facts:\n${JSON.stringify(draft.facts)}\n\nWrite up to 3 alternative replies.`,
    schema: suggestionsSchema,
    schemaName: "reply_suggestions",
    // A hand-off line ("connecting you with the team") is useless to the person who is the team.
    fallback: () => ({
      suggestions: draft.handoff.required
        ? [
            `Thank you ${conv.contactName.split(" ")[0]}, we've received this. Let me check and get back to you shortly.`,
            ...draft.alternatives.filter((a) => !/connect|team member|member of our team/i.test(a)),
          ].slice(0, 3)
        : [draft.reply, ...draft.alternatives].slice(0, 3),
    }),
  });
  return data.suggestions;
}

/**
 * WhatsApp Center KPIs: open / needs-attention counts, share of last-7-day
 * conversations the AI handled without a human, outbound messages today and
 * average first response time (first customer message → first AI/agent reply).
 */
export async function whatsappStats(storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { timezone: true } });
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = startOfDayTz(now, store?.timezone ?? "UTC");
  const [open, attention, sentToday, recent] = await Promise.all([
    db.conversation.count({ where: { storeId, channel: "WHATSAPP", status: { in: ["OPEN", "PENDING"] } } }),
    db.conversation.count({ where: { storeId, channel: "WHATSAPP", status: { in: ["OPEN", "PENDING"] }, needsAttention: true } }),
    db.message.count({ where: { storeId, direction: "OUTBOUND", createdAt: { gte: todayStart }, conversation: { channel: "WHATSAPP" } } }),
    db.conversation.findMany({
      where: { storeId, channel: "WHATSAPP", lastMessageAt: { gte: since } },
      take: 500,
      select: {
        needsAttention: true,
        messages: { where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { direction: true, sender: true, createdAt: true } },
      },
    }),
  ]);
  let active = 0;
  let aiResolved = 0;
  const responseMs: number[] = [];
  for (const c of recent) {
    const firstIn = c.messages.find((m) => m.direction === "INBOUND");
    if (!firstIn) continue;
    active++;
    const hasAgent = c.messages.some((m) => m.sender === "AGENT");
    const hasAi = c.messages.some((m) => m.sender === "AI");
    if (hasAi && !hasAgent && !c.needsAttention) aiResolved++;
    const reply = c.messages.find((m) => m.createdAt > firstIn.createdAt && (m.sender === "AI" || m.sender === "AGENT"));
    if (reply) responseMs.push(reply.createdAt.getTime() - firstIn.createdAt.getTime());
  }
  return {
    open,
    attention,
    sentToday,
    activeLast7d: active,
    aiResolvedLast7d: aiResolved,
    aiResolvedShare: active ? aiResolved / active : null,
    avgFirstResponseSec: responseMs.length ? Math.round(responseMs.reduce((s, x) => s + x, 0) / responseMs.length / 1000) : null,
  };
}

/** Approved / pending WhatsApp Business message templates for the store. */
export async function listMessageTemplates(storeId: string) {
  return db.messageTemplate.findMany({ where: { storeId }, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

export async function simulateInbound(ctx: ServiceContext, input: { conversationId?: string; phone?: string; name?: string; text: string }) {
  let handle = input.phone ? normalizePhone(input.phone) : null;
  let name = input.name ?? null;
  if (input.conversationId) {
    const conv = await db.conversation.findFirst({ where: { id: input.conversationId, storeId: ctx.storeId } });
    if (!conv) throw notFound("Conversation");
    handle = conv.contactHandle;
    name = conv.contactName;
  }
  if (!handle) throw badRequest("Phone number required");
  return receiveInbound(ctx.storeId, { channel: "WHATSAPP", handle, name, text: input.text });
}
