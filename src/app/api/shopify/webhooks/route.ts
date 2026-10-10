import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyShopifyWebhook } from "@/lib/shopify/webhooks";
import { recordWebhook } from "@/services/webhook.service";

/** Irreversibly anonymizes a customer's PII (orders keep totals for accounting). */
async function redactCustomer(storeId: string, externalId: string) {
  const customer = await db.customer.findUnique({ where: { storeId_externalId: { storeId, externalId } } });
  if (!customer) return;
  await db.$transaction([
    db.customer.update({ where: { id: customer.id }, data: { name: "Redacted customer", email: null, phone: null, address: Prisma.DbNull, notes: null, aiSummary: Prisma.DbNull, tags: [], deletedAt: new Date() } }),
    db.order.updateMany({ where: { customerId: customer.id }, data: { customerName: "Redacted customer", email: null, phone: null, shippingAddress: Prisma.DbNull } }),
    db.message.deleteMany({ where: { conversation: { customerId: customer.id } } }),
    db.conversation.deleteMany({ where: { customerId: customer.id } }),
  ]);
}

/**
 * Shopify → webhook → validate signature → queue → worker → DB → automations.
 * Must respond within 5s, so this only verifies and enqueues.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const e = env();
  const secret = e.SHOPIFY_WEBHOOK_SECRET ?? e.SHOPIFY_CLIENT_SECRET;
  if (!verifyShopifyWebhook(raw, req.headers.get("x-shopify-hmac-sha256"), secret)) {
    return NextResponse.json({ error: { message: "Invalid HMAC" } }, { status: 401 });
  }
  const topic = req.headers.get("x-shopify-topic") ?? "unknown";
  const shop = req.headers.get("x-shopify-shop-domain") ?? "";
  const webhookId = req.headers.get("x-shopify-webhook-id") ?? req.headers.get("x-shopify-event-id") ?? `${topic}:${Date.now()}`;

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON" } }, { status: 400 });
  }
  const connection = await db.shopifyConnection.findUnique({ where: { shopDomain: shop } });

  // Mandatory privacy (GDPR) webhooks.
  if (topic === "customers/redact" && connection) {
    const c = (payload as { customer?: { id?: number | string } }).customer;
    if (c?.id) await redactCustomer(connection.storeId, String(c.id));
    return NextResponse.json({ data: { received: true } });
  }
  if (topic === "shop/redact" && connection) {
    // 48h after uninstall: remove all customer PII for this shop.
    const customers = await db.customer.findMany({ where: { storeId: connection.storeId }, select: { externalId: true } });
    for (const c of customers) if (c.externalId) await redactCustomer(connection.storeId, c.externalId);
    return NextResponse.json({ data: { received: true } });
  }
  if (topic === "customers/data_request") {
    // Data is exportable from the customer profile; the request is logged for the store owner.
    if (connection) await db.auditLog.create({ data: { storeId: connection.storeId, actorType: "WEBHOOK", actorName: "Shopify", action: "privacy.data_request", resourceType: "customer", metadata: payload as object } });
    return NextResponse.json({ data: { received: true } });
  }
  const result = await recordWebhook({ provider: "SHOPIFY", topic, externalId: webhookId, payload, storeId: connection?.storeId ?? null });
  return NextResponse.json({ data: { received: true, duplicate: result.duplicate } });
}
