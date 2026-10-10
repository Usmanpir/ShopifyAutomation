import { z } from "zod";
import { runTool } from "@/lib/ai/tools/executor";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { formatMoney, toMinor } from "@/lib/money";
import type { ServiceContext } from "@/lib/service-context";
import { createPromotion } from "./marketing.service";
import { getStore } from "./store.service";

export const customerMessageSchema = z.object({ text: z.string().trim().min(1).max(1000) });

/** One WhatsApp message to one customer, through the guarded tool path (RBAC + audit). */
export async function messageCustomer(ctx: ServiceContext, customerId: string, text: string) {
  const c = await db.customer.findFirst({ where: { id: customerId, storeId: ctx.storeId, deletedAt: null } });
  if (!c) throw notFound("Customer");
  if (!c.phone) throw badRequest("This customer has no phone number");
  if (c.status === "BLOCKED") throw badRequest("This customer is blocked");
  const r = await runTool(ctx, "sendWhatsAppMessage", { customerId, text });
  if (!r.ok) throw badRequest(r.error);
  const conv = await db.conversation.findFirst({ where: { storeId: ctx.storeId, customerId }, orderBy: { lastMessageAt: "desc" }, select: { id: true } });
  return { sent: true, conversationId: conv?.id ?? null };
}

export const customerOfferSchema = z.object({
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]),
  /** Percent, or amount in major units. Ignored for free shipping. */
  value: z.number().min(0).max(1_000_000),
  validDays: z.number().int().min(1).max(60),
  send: z.boolean(),
  message: z.string().trim().max(1000).optional(),
});

/**
 * Personal, single-use offer for one customer: creates a promotion code and
 * (optionally) sends it on WhatsApp. One customer is never a mass action.
 */
export async function createCustomerOffer(ctx: ServiceContext, customerId: string, input: z.infer<typeof customerOfferSchema>) {
  const c = await db.customer.findFirst({ where: { id: customerId, storeId: ctx.storeId, deletedAt: null } });
  if (!c) throw notFound("Customer");
  if (input.type !== "FREE_SHIPPING" && input.value <= 0) throw badRequest("Enter a discount amount");
  const store = await getStore(ctx.storeId);
  const first = c.name.split(" ")[0]!.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 8) || "VIP";
  const code = `${first}${Math.floor(100 + Math.random() * 900)}`;
  const promo = await createPromotion(ctx, {
    name: `Personal offer — ${c.name}`,
    code,
    type: input.type,
    value: input.type === "FREE_SHIPPING" ? 0 : input.value,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + input.validDays * 86_400_000),
    usageLimit: 1,
  });
  let sent = false;
  if (input.send) {
    const offer =
      input.type === "PERCENTAGE"
        ? `${input.value}% off`
        : input.type === "FIXED_AMOUNT"
          ? `${formatMoney(toMinor(input.value), { currency: store.currency, locale: store.locale })} off`
          : "free delivery";
    const text = (input.message?.trim() || `Hi ${c.name.split(" ")[0]}! Here's a personal thank-you from ${store.name}: ${offer} on your next order.`) + `\nCode: ${promo.code} (valid ${input.validDays} days)`;
    await messageCustomer(ctx, customerId, text);
    sent = true;
  }
  return { code: promo.code, sent, endsAt: promo.endsAt };
}
