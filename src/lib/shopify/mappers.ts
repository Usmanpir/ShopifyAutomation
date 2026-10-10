import { z } from "zod";
import type { PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";
import { toMinor } from "@/lib/money";

/**
 * Shopify webhook payloads (REST JSON shape) → normalized internal inputs.
 * Schemas are permissive (passthrough) since Shopify adds fields over time.
 */
const money = z.union([z.string(), z.number()]).transform((v) => toMinor(Number(v) || 0));

const addressSchema = z
  .object({
    name: z.string().nullish(),
    address1: z.string().nullish(),
    address2: z.string().nullish(),
    city: z.string().nullish(),
    province: z.string().nullish(),
    zip: z.string().nullish(),
    country: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .passthrough();

export const shopifyOrderSchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform(String),
    name: z.string(),
    order_number: z.number(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    currency: z.string(),
    subtotal_price: money,
    total_price: money,
    total_discounts: money.optional(),
    total_shipping_price_set: z.object({ shop_money: z.object({ amount: money }) }).partial().nullish(),
    financial_status: z.string().nullish(),
    fulfillment_status: z.string().nullish(),
    payment_gateway_names: z.array(z.string()).default([]),
    tags: z.string().default(""),
    note: z.string().nullish(),
    source_name: z.string().nullish(),
    created_at: z.string(),
    cancelled_at: z.string().nullish(),
    cancel_reason: z.string().nullish(),
    customer: z
      .object({
        id: z.union([z.number(), z.string()]).transform(String),
        first_name: z.string().nullish(),
        last_name: z.string().nullish(),
        email: z.string().nullish(),
        phone: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    shipping_address: addressSchema.nullish(),
    line_items: z.array(
      z
        .object({
          id: z.union([z.number(), z.string()]).transform(String),
          product_id: z.union([z.number(), z.string()]).nullish().transform((v) => (v == null ? null : String(v))),
          variant_id: z.union([z.number(), z.string()]).nullish().transform((v) => (v == null ? null : String(v))),
          title: z.string(),
          variant_title: z.string().nullish(),
          sku: z.string().nullish(),
          quantity: z.number(),
          price: money,
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type ShopifyOrderPayload = z.infer<typeof shopifyOrderSchema>;

export type NormalizedOrder = {
  externalId: string;
  orderNumber: number;
  name: string;
  currency: string;
  email: string | null;
  phone: string | null;
  customerName: string;
  customerExternalId: string | null;
  city: string | null;
  shippingAddress: Record<string, unknown> | null;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  tags: string[];
  note: string | null;
  source: string | null;
  placedAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  items: {
    externalProductId: string | null;
    externalVariantId: string | null;
    title: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    unitPrice: number;
  }[];
};

export function detectPaymentMethod(gateways: string[]): PaymentMethod {
  const g = gateways.join(" ").toLowerCase();
  if (/cash on delivery|cod|manual/.test(g)) return "COD";
  if (/bank|transfer|deposit/.test(g)) return "BANK_TRANSFER";
  if (/easypaisa|jazzcash|wallet|sadapay|nayapay/.test(g)) return "WALLET";
  return "CARD";
}

export function mapFinancialStatus(s: string | null | undefined): PaymentStatus {
  switch (s) {
    case "paid":
      return "PAID";
    case "partially_refunded":
      return "PARTIALLY_REFUNDED";
    case "refunded":
      return "REFUNDED";
    case "voided":
      return "VOIDED";
    default:
      return "PENDING";
  }
}

export function normalizeShopifyOrder(raw: unknown): NormalizedOrder {
  const o = shopifyOrderSchema.parse(raw);
  const addr = o.shipping_address;
  const customerName =
    [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || addr?.name || o.email || "Guest";
  return {
    externalId: o.id,
    orderNumber: o.order_number,
    name: o.name,
    currency: o.currency,
    email: o.email ?? o.customer?.email ?? null,
    phone: o.phone ?? addr?.phone ?? o.customer?.phone ?? null,
    customerName,
    customerExternalId: o.customer?.id ?? null,
    city: addr?.city ?? null,
    shippingAddress: addr ? { ...addr } : null,
    subtotal: o.subtotal_price,
    shippingTotal: o.total_shipping_price_set?.shop_money?.amount ?? 0,
    discountTotal: o.total_discounts ?? 0,
    total: o.total_price,
    paymentMethod: detectPaymentMethod(o.payment_gateway_names),
    paymentStatus: mapFinancialStatus(o.financial_status),
    tags: o.tags.split(",").map((t) => t.trim()).filter(Boolean),
    note: o.note ?? null,
    source: o.source_name ?? null,
    placedAt: new Date(o.created_at),
    cancelledAt: o.cancelled_at ? new Date(o.cancelled_at) : null,
    cancelReason: o.cancel_reason ?? null,
    items: o.line_items.map((li) => ({
      externalProductId: li.product_id,
      externalVariantId: li.variant_id,
      title: li.title,
      variantTitle: li.variant_title ?? null,
      sku: li.sku ?? null,
      quantity: li.quantity,
      unitPrice: li.price,
    })),
  };
}

export const shopifyInventoryLevelSchema = z
  .object({
    inventory_item_id: z.union([z.number(), z.string()]).transform(String),
    available: z.number().nullable(),
  })
  .passthrough();
