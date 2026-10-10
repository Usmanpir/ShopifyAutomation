import { z } from "zod";
import { getAIProvider } from "@/lib/ai/factory";
import { classifyIntentLocally, intentResultSchema, type IntentResult } from "@/lib/ai/intents";
import { db } from "@/lib/db";
import { publishEvent } from "@/lib/events/bus";
import { formatMoney } from "@/lib/money";
import { aiContext } from "@/lib/service-context";
import { recordAITask } from "../agent.service";
import { searchCatalog, searchKnowledge, type CatalogMatch } from "../catalog-search.service";
import { sendOnChannel } from "../conversation.service";
import { notify } from "../notification.service";
import { applyConfirmationReply } from "../order.service";
import { getStore } from "../store.service";
import { createTicket } from "../ticket.service";

type Facts = Record<string, unknown>;

export type Draft = {
  intent: IntentResult;
  facts: Facts;
  reply: string;
  alternatives: string[];
  confidence: number;
  handoff: { required: boolean; reason: string | null };
  tools: string[];
};

const STATUS_TEXT: Record<string, { en: string; ur: string }> = {
  NEW: { en: "received and being reviewed", ur: "receive ho gaya hai aur review ho raha hai" },
  PENDING_CONFIRMATION: { en: "waiting for your confirmation", ur: "aap ki confirmation ka intezar hai" },
  CONFIRMED: { en: "confirmed and will be packed soon", ur: "confirm ho gaya hai, jald pack ho jayega" },
  PROCESSING: { en: "being packed", ur: "pack ho raha hai" },
  SHIPPED: { en: "shipped", ur: "dispatch ho chuka hai" },
  DELIVERED: { en: "delivered", ur: "deliver ho chuka hai" },
  CANCELLED: { en: "cancelled", ur: "cancel ho chuka hai" },
  RETURNED: { en: "returned", ur: "return ho chuka hai" },
};

/** Gathers facts and drafts a reply without side effects (also powers suggested replies). */
export async function draftReply(storeId: string, conversationId: string, text: string): Promise<Draft> {
  const store = await getStore(storeId);
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, include: { customer: true } });
  const phone = conv?.channel === "WHATSAPP" ? conv.contactHandle : null;

  const pendingOrder = await db.order.findFirst({
    where: {
      storeId,
      confirmationStatus: "PENDING",
      OR: [...(conv?.customerId ? [{ customerId: conv.customerId }] : []), ...(phone ? [{ phone }] : [])],
    },
    orderBy: { placedAt: "desc" },
  });

  // 1) Intent — LLM classification with a deterministic safety net.
  const ai = await getAIProvider(storeId);
  const local = classifyIntentLocally(text, { hasPendingConfirmation: !!pendingOrder });
  const { data: intent } = await ai.generateObject({
    system:
      "Classify a WhatsApp message to a Pakistani fashion store. Customers write in English, Roman Urdu or Urdu. " +
      "CONFIRM_ORDER/DECLINE_ORDER only apply when an order confirmation is pending. Set requiresHuman for complaints, " +
      "special exception requests, or anything you are unsure about.",
    prompt: JSON.stringify({ message: text, hasPendingConfirmation: !!pendingOrder }),
    schema: intentResultSchema,
    schemaName: "intent",
    fallback: () => local,
  });
  const lang = intent.language === "english" ? "en" : "ur";
  const tools: string[] = ["classifyIntent"];
  const facts: Facts = { storeName: store.name, customerName: conv?.contactName?.split(" ")[0] ?? "" };
  const greet = facts.customerName ? (lang === "ur" ? `${facts.customerName} bhai` : facts.customerName) : "";

  let reply = "";
  let alternatives: string[] = [];
  let confidence = intent.confidence;
  let handoffReason: string | null = intent.requiresHuman ? (intent.reason ?? "Needs a human") : null;

  const stockLine = (m: CatalogMatch) => {
    const inStock = m.variants.filter((v) => v.stock > 0);
    const sizes = [...new Set(inStock.map((v) => v.size).filter(Boolean))];
    return { inStock, sizes };
  };

  switch (intent.intent) {
    case "CONFIRM_ORDER":
    case "DECLINE_ORDER": {
      if (!pendingOrder) {
        confidence = 0.5;
        handoffReason = "Customer replied yes/no but no order is awaiting confirmation.";
        reply = lang === "ur" ? "Shukriya! Aap kis order ki baat kar rahe hain? Order number share kar dein." : "Thanks! Which order is this about? Please share your order number.";
        break;
      }
      facts.order = { name: pendingOrder.name, total: money(pendingOrder.total) };
      tools.push("getOrder");
      reply =
        intent.intent === "CONFIRM_ORDER"
          ? lang === "ur"
            ? `Shukriya ${greet}! Aap ka order ${pendingOrder.name} confirm ho gaya hai ✅ Hum jald dispatch kar ke tracking share kar denge.`
            : `Thank you ${greet}! Your order ${pendingOrder.name} is confirmed ✅ We'll dispatch it soon and share tracking details.`
          : lang === "ur"
            ? `Theek hai ${greet}, aap ka order ${pendingOrder.name} cancel kar diya gaya hai. Kabhi bhi dobara order karna ho to hum yahan hain.`
            : `No problem ${greet}, your order ${pendingOrder.name} has been cancelled. We're here whenever you'd like to order again.`;
      break;
    }
    case "ORDER_STATUS": {
      const order = await db.order.findFirst({
        where: { storeId, OR: [...(conv?.customerId ? [{ customerId: conv.customerId }] : []), ...(phone ? [{ phone }] : [])] },
        orderBy: { placedAt: "desc" },
        include: { shipments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      tools.push("getOrderStatusByPhone");
      if (!order) {
        confidence = Math.min(confidence, 0.6);
        handoffReason = "Couldn't find an order for this number.";
        reply = lang === "ur" ? "Is number par koi order nahi mila. Order number share kar dein, hum check kar lete hain." : "I couldn't find an order for this number. Could you share your order number so we can check?";
        break;
      }
      const shipment = order.shipments[0];
      const s = STATUS_TEXT[order.status];
      facts.order = { name: order.name, status: order.status, tracking: shipment?.trackingNumber ?? null, courierStatus: shipment?.status ?? null };
      const tracking = shipment?.trackingNumber ? (lang === "ur" ? ` Tracking number: ${shipment.trackingNumber}.` : ` Tracking number: ${shipment.trackingNumber}.`) : "";
      reply = lang === "ur" ? `${greet ? greet + ", " : ""}aap ka order ${order.name} ${s.ur}.${tracking}` : `${greet ? `Hi ${greet}, ` : ""}your order ${order.name} is ${s.en}.${tracking}`;
      if (order.status === "SHIPPED") reply += lang === "ur" ? " Usually 2–4 working days mein deliver ho jata hai." : " Delivery usually takes 2–4 working days.";
      break;
    }
    case "PRODUCT_AVAILABILITY":
    case "PRICE": {
      const query = intent.productQuery ?? text;
      const matches = await searchCatalog(storeId, { query, size: intent.size, color: intent.color });
      tools.push("searchProducts", "getInventory");
      const top = matches[0];
      if (!top) {
        confidence = Math.min(confidence, 0.72);
        facts.products = [];
        reply = lang === "ur" ? "Yeh item humein catalog mein nahi mila. Product ka naam ya screenshot bhej dein, hum check kar lete hain." : "I couldn't find that exact item. Could you send the product name or a screenshot so we can check?";
        break;
      }
      const { inStock, sizes } = stockLine(top);
      facts.products = matches.map((m) => ({ title: m.title, price: money(m.price), variants: m.variants.map((v) => `${v.title}: ${v.stock}`) }));
      const priceText = money(top.price) + (top.compareAtPrice && top.compareAtPrice > top.price ? ` (was ${money(top.compareAtPrice)})` : "");
      if (intent.intent === "PRICE" && inStock.length) {
        reply = lang === "ur" ? `${top.title} ki price ${priceText} hai. Available sizes: ${sizes.join(", ") || "—"}.` : `${top.title} is ${priceText}. Available sizes: ${sizes.join(", ") || "—"}.`;
      } else if (intent.size) {
        const v = top.variants.find((x) => x.size?.toLowerCase() === intent.size!.toLowerCase());
        if (v && v.stock > 0) {
          reply = lang === "ur"
            ? `Ji haan! ${top.title} size ${intent.size} available hai (${v.stock <= 5 ? `sirf ${v.stock} pieces bache hain` : "stock mein hai"}). Price: ${priceText}. Order karna chahenge?`
            : `Yes! ${top.title} in size ${intent.size} is available${v.stock <= 5 ? ` — only ${v.stock} left` : ""}. Price: ${priceText}. Would you like to order?`;
        } else {
          reply = lang === "ur"
            ? `Maazrat, ${top.title} size ${intent.size} abhi out of stock hai. ${sizes.length ? `Available sizes: ${sizes.join(", ")}.` : ""}`
            : `Sorry, ${top.title} in size ${intent.size} is out of stock right now.${sizes.length ? ` Available sizes: ${sizes.join(", ")}.` : ""}`;
          alternatives = matches.slice(1).filter((m) => m.totalStock > 0).map((m) => (lang === "ur" ? `Aap ${m.title} bhi dekh sakte hain — ${money(m.price)}.` : `You might also like ${m.title} — ${money(m.price)}.`));
        }
      } else if (inStock.length) {
        reply = lang === "ur"
          ? `Ji haan, ${top.title} available hai! Sizes: ${sizes.join(", ")}. Price: ${priceText}. Kaunsa size chahiye?`
          : `Yes, ${top.title} is available! Sizes: ${sizes.join(", ")}. Price: ${priceText}. Which size would you like?`;
      } else {
        reply = lang === "ur" ? `Maazrat, ${top.title} abhi out of stock hai. Restock hote hi hum aap ko bata denge.` : `Sorry, ${top.title} is currently out of stock. We'll let you know as soon as it's back.`;
      }
      break;
    }
    case "DELIVERY":
    case "EXCHANGE":
    case "RETURN":
    case "FAQ": {
      const category = intent.intent === "DELIVERY" ? "SHIPPING" : intent.intent === "FAQ" ? undefined : ["POLICY", "RETURNS"];
      const articles = await searchKnowledge(storeId, `${text} ${intent.intent.toLowerCase()}`, category);
      tools.push("searchKnowledge");
      facts.policies = articles.map((a) => ({ title: a.title, content: a.content }));
      if (!articles.length) {
        confidence = Math.min(confidence, 0.55);
        handoffReason = handoffReason ?? "No matching policy in the knowledge base.";
        reply = lang === "ur" ? "Main is bare mein hamari team se confirm kar ke batata hoon." : "Let me check this with our team and get back to you.";
      } else {
        reply = articles[0].content;
        if (intent.intent === "EXCHANGE" || intent.intent === "RETURN") {
          reply += lang === "ur" ? " Apna order number share kar dein, hum process shuru kar dete hain." : " Please share your order number and we'll get started.";
        }
      }
      break;
    }
    case "GREETING":
      reply = lang === "ur" ? `Wa Alaikum Assalam${greet ? " " + greet : ""}! ${store.name} mein khush aamdeed. Main aap ki kya madad kar sakta hoon?` : `Hi${greet ? " " + greet : ""}! Welcome to ${store.name}. How can I help you today?`;
      break;
    case "THANKS":
      reply = lang === "ur" ? "Aap ka bohat shukriya! Kuch aur chahiye ho to zaroor batayein. 😊" : "You're welcome! Let us know if there's anything else. 😊";
      break;
    case "COMPLAINT":
    case "HUMAN_REQUEST":
    case "OTHER":
      reply = lang === "ur" ? "Main aap ko hamari team ke member se connect kar raha hoon, woh jald reply karenge." : "I'm connecting you with a member of our team — they'll reply shortly.";
      handoffReason = handoffReason ?? "Low confidence in understanding the request.";
      confidence = Math.min(confidence, intent.intent === "OTHER" ? 0.4 : confidence);
      break;
  }

  // 2) Optional LLM polish — constrained to the facts gathered above.
  if (ai.name !== "local" && !handoffReason) {
    const { data } = await ai.generateObject({
      system:
        `You are the WhatsApp assistant for ${store.name}. ${store.settings.ai.brandVoice} ` +
        "Rewrite the draft reply naturally in the customer's language. NEVER add prices, stock levels, dates or policies that are not in the facts. Keep it under 60 words.",
      prompt: JSON.stringify({ customerMessage: text, language: intent.language, facts, draft: reply }),
      schema: z.object({ reply: z.string().min(1).max(700), confidence: z.number().min(0).max(1) }),
      schemaName: "whatsapp_reply",
      fallback: () => ({ reply, confidence }),
    });
    reply = data.reply;
    confidence = Math.min(confidence, data.confidence);
  }

  const threshold = store.settings.ai.handoffConfidence;
  if (!handoffReason && !store.settings.ai.autoReplyIntents.includes(intent.intent))
    handoffReason = `“${intent.intent.toLowerCase().replace(/_/g, " ")}” isn't on the list of topics the AI may answer automatically.`;
  if (confidence < threshold && !handoffReason) handoffReason = `AI confidence ${Math.round(confidence * 100)}% is below the ${Math.round(threshold * 100)}% threshold.`;
  return { intent, facts, reply, alternatives, confidence, handoff: { required: !!handoffReason, reason: handoffReason }, tools };
}

/**
 * Handles an inbound customer message end-to-end: draft, act (confirm/cancel
 * order, open ticket), reply, or hand off to a human.
 */
export async function handleInboundMessage(messageId: string) {
  const started = Date.now();
  const message = await db.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!message || message.direction !== "INBOUND") return;
  const conv = message.conversation;
  if (conv.handler !== "AI") return;

  const agent = await db.aIAgent.findUnique({ where: { storeId_key: { storeId: message.storeId, key: "WHATSAPP" } } });
  if (!agent?.enabled) return;
  // Only answer the latest message (customers often send several in a row).
  const newer = await db.message.findFirst({ where: { conversationId: conv.id, direction: "INBOUND", createdAt: { gt: message.createdAt } } });
  if (newer) return;

  const ctx = aiContext(message.storeId, agent.name, agent.id);
  const draft = await draftReply(message.storeId, conv.id, message.body);

  if ((draft.intent.intent === "CONFIRM_ORDER" || draft.intent.intent === "DECLINE_ORDER") && !draft.handoff.required) {
    const pending = await db.order.findFirst({
      where: { storeId: message.storeId, confirmationStatus: "PENDING", OR: [{ customerId: conv.customerId ?? "__none__" }, { phone: conv.contactHandle }] },
      orderBy: { placedAt: "desc" },
    });
    if (pending) {
      await applyConfirmationReply(ctx, pending.id, draft.intent.intent === "CONFIRM_ORDER" ? "CONFIRM" : "DECLINE", message.body.slice(0, 120));
      draft.tools.push("updateOrderStatus");
    }
  }

  if (draft.handoff.required && (draft.intent.intent === "EXCHANGE" || draft.intent.intent === "RETURN" || draft.intent.intent === "COMPLAINT")) {
    await createTicket(ctx, {
      subject: `${draft.intent.intent === "COMPLAINT" ? "Complaint" : draft.intent.intent === "EXCHANGE" ? "Exchange request" : "Return request"} — ${conv.contactName}`,
      description: `Customer wrote: "${message.body}"\n\nAI note: ${draft.handoff.reason}`,
      category: draft.intent.intent === "COMPLAINT" ? "OTHER" : draft.intent.intent,
      priority: draft.intent.intent === "COMPLAINT" ? "HIGH" : "MEDIUM",
      customerId: conv.customerId ?? undefined,
      conversationId: conv.id,
    });
    draft.tools.push("createSupportTicket");
  }

  const aiMeta = { intent: draft.intent.intent, confidence: draft.confidence, language: draft.intent.language, tools: draft.tools, handoff: draft.handoff.required };
  await sendOnChannel(message.storeId, conv, draft.reply, { type: "AI", aiMeta });

  await db.conversation.update({
    where: { id: conv.id },
    data: {
      aiConfidence: draft.confidence,
      ...(draft.handoff.required ? { needsAttention: true, attentionReason: draft.handoff.reason } : {}),
    },
  });

  if (draft.handoff.required) {
    await publishEvent(message.storeId, "HUMAN_HANDOFF_REQUESTED", {
      title: `Human assistance required — ${conv.contactName}`,
      tone: "warning",
      href: `/conversations?c=${conv.id}`,
      payload: { conversationId: conv.id, reason: draft.handoff.reason },
    });
    const store = await getStore(message.storeId);
    if (store.settings.notifications.alerts.humanHandoff) {
      await notify(message.storeId, {
        type: "WHATSAPP",
        severity: "WARNING",
        title: `${conv.contactName} needs a human`,
        body: draft.handoff.reason ?? undefined,
        href: `/conversations?c=${conv.id}`,
        roles: ["OWNER", "ADMIN", "MANAGER", "SUPPORT_AGENT"],
      });
    }
  }

  const provider = await getAIProvider(message.storeId);
  await recordAITask(message.storeId, "WHATSAPP", {
    type: "whatsapp.reply",
    title: draft.handoff.required ? `Handed off ${conv.contactName} to a human` : `Answered ${conv.contactName} (${draft.intent.intent.toLowerCase().replace(/_/g, " ")})`,
    input: { message: message.body },
    output: { reply: draft.reply, ...aiMeta },
    provider: provider.name,
    model: provider.model,
    durationMs: Date.now() - started,
    relatedType: "conversation",
    relatedId: conv.id,
  });
}
