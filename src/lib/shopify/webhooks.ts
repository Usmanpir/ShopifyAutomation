import { hmacSha256, safeEqual } from "@/lib/crypto";

/**
 * Shopify signs webhooks with HMAC-SHA256 over the raw request body using the
 * app's client secret (or a dedicated webhook secret), base64 encoded in
 * the X-Shopify-Hmac-Sha256 header. Always verify against the RAW body.
 */
export function verifyShopifyWebhook(rawBody: string | Buffer, hmacHeader: string | null, secret: string | undefined): boolean {
  if (!hmacHeader || !secret) return false;
  const digest = hmacSha256(secret, rawBody, "base64");
  return safeEqual(digest, hmacHeader);
}

/** Topics the app subscribes to, mapped to GraphQL WebhookSubscriptionTopic enum values. */
export const SHOPIFY_WEBHOOK_TOPICS = {
  "orders/create": "ORDERS_CREATE",
  "orders/updated": "ORDERS_UPDATED",
  "orders/cancelled": "ORDERS_CANCELLED",
  "orders/fulfilled": "ORDERS_FULFILLED",
  "orders/paid": "ORDERS_PAID",
  "refunds/create": "REFUNDS_CREATE",
  "fulfillments/create": "FULFILLMENTS_CREATE",
  "fulfillments/update": "FULFILLMENTS_UPDATE",
  "products/create": "PRODUCTS_CREATE",
  "products/update": "PRODUCTS_UPDATE",
  "products/delete": "PRODUCTS_DELETE",
  "inventory_levels/update": "INVENTORY_LEVELS_UPDATE",
  "customers/create": "CUSTOMERS_CREATE",
  "customers/update": "CUSTOMERS_UPDATE",
  "app/uninstalled": "APP_UNINSTALLED",
} as const;

export type ShopifyTopic = keyof typeof SHOPIFY_WEBHOOK_TOPICS;

/** Mandatory privacy (GDPR) topics — configured in the Partner dashboard / app TOML. */
export const SHOPIFY_COMPLIANCE_TOPICS = ["customers/data_request", "customers/redact", "shop/redact"] as const;

export function isKnownTopic(topic: string): topic is ShopifyTopic {
  return topic in SHOPIFY_WEBHOOK_TOPICS;
}
