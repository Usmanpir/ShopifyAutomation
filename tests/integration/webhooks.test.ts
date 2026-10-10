import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as shopifyWebhook } from "@/app/api/shopify/webhooks/route";
import { POST as whatsappWebhook } from "@/app/api/whatsapp/webhook/route";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { createTestStore, destroyTestStore } from "./helpers";

let t: Awaited<ReturnType<typeof createTestStore>>;
const shop = () => `shop-${t.tag}.myshopify.com`;

beforeAll(async () => {
  t = await createTestStore();
  await db.shopifyConnection.create({ data: { storeId: t.store.id, shopDomain: shop(), accessTokenEnc: encrypt("shpat_test"), scopes: "read_orders", apiVersion: "2026-07" } });
  await db.integration.update({ where: { storeId_provider: { storeId: t.store.id, provider: "WHATSAPP" } }, data: { status: "CONNECTED", config: { phoneNumberId: `pn-${t.tag}` } } });
});
afterAll(async () => {
  await destroyTestStore(t.store.id);
});

function shopifyRequest(topic: string, body: object, id: string, secret = process.env.SHOPIFY_WEBHOOK_SECRET!) {
  const raw = JSON.stringify(body);
  return new NextRequest("http://localhost/api/shopify/webhooks", {
    method: "POST",
    body: raw,
    headers: {
      "x-shopify-hmac-sha256": createHmac("sha256", secret).update(raw).digest("base64"),
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": shop(),
      "x-shopify-webhook-id": id,
    },
  });
}

describe("Shopify webhook pipeline", () => {
  it("rejects invalid signatures", async () => {
    const res = await shopifyWebhook(shopifyRequest("orders/create", { id: 1 }, `bad-${t.tag}`, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("orders/create → validated → queued → processed into an order", async () => {
    const payload = {
      id: 900000001,
      name: "#20001",
      order_number: 20001,
      email: "buyer@test.dev",
      currency: "PKR",
      subtotal_price: "3990.00",
      total_price: "4190.00",
      total_discounts: "0.00",
      total_shipping_price_set: { shop_money: { amount: "200.00" } },
      financial_status: "pending",
      payment_gateway_names: ["Cash on Delivery (COD)"],
      tags: "",
      created_at: new Date().toISOString(),
      customer: { id: 42, first_name: "Ahmed", last_name: "Khan", phone: "+923217654321" },
      shipping_address: { address1: "House 9, Street 3, Gulberg III", city: "Lahore", phone: "+923217654321" },
      line_items: [{ id: 1, product_id: 1, variant_id: 1, title: "Premium Black Shirt", variant_title: "M", sku: `SKU-M-${t.tag}`, quantity: 1, price: "3990.00" }],
    };
    const res = await shopifyWebhook(shopifyRequest("orders/create", payload, `wh-${t.tag}-1`));
    expect(res.status).toBe(200);
    const event = await db.webhookEvent.findFirstOrThrow({ where: { externalId: `wh-${t.tag}-1` } });
    expect(event.status).toBe("PROCESSED");
    const order = await db.order.findFirstOrThrow({ where: { storeId: t.store.id, orderNumber: 20001 }, include: { items: true } });
    expect(order.total).toBe(419000);
    expect(order.items[0].variantId).toBeTruthy(); // matched by SKU
    expect(order.customerName).toBe("Ahmed Khan");
  });

  it("deduplicates retried deliveries by webhook id", async () => {
    const res = await shopifyWebhook(shopifyRequest("orders/create", { id: 900000001 }, `wh-${t.tag}-1`));
    const json = await res.json();
    expect(json.data.duplicate).toBe(true);
  });

  it("inventory_levels/update updates stock and triggers the low-inventory automation", async () => {
    const res = await shopifyWebhook(shopifyRequest("inventory_levels/update", { inventory_item_id: `ii-m-${t.tag}`, available: 3 }, `wh-${t.tag}-2`));
    expect(res.status).toBe(200);
    const v = await db.productVariant.findFirstOrThrow({ where: { inventoryItemId: `ii-m-${t.tag}` } });
    expect(v.inventoryQuantity).toBe(3);
    const ev = await db.domainEvent.findFirst({ where: { storeId: t.store.id, type: "INVENTORY_LOW" } });
    expect(ev).toBeTruthy();
    const insight = await db.aIInsight.findFirst({ where: { storeId: t.store.id, kind: "INVENTORY", relatedId: v.id } });
    expect(JSON.stringify(insight?.evidence)).toContain("3 units");
    const notif = await db.notification.findFirst({ where: { storeId: t.store.id, type: "AUTOMATION", title: { contains: "Low stock" } } });
    expect(notif).toBeTruthy();
  });
});

describe("WhatsApp webhook", () => {
  it("verifies the signature, stores the inbound message and the AI replies", async () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: `pn-${t.tag}` }, contacts: [{ wa_id: "923339998877", profile: { name: "Bilal" } }], messages: [{ from: "923339998877", id: `wamid.${t.tag}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "What's the price of the black shirt?" } }] } }] }],
    };
    const raw = JSON.stringify(body);
    const sig = `sha256=${createHmac("sha256", process.env.META_APP_SECRET!).update(raw).digest("hex")}`;
    const bad = await whatsappWebhook(new NextRequest("http://localhost/api/whatsapp/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=00" } }));
    expect(bad.status).toBe(401);
    const res = await whatsappWebhook(new NextRequest("http://localhost/api/whatsapp/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig } }));
    expect(res.status).toBe(200);
    const conv = await db.conversation.findFirstOrThrow({ where: { storeId: t.store.id, externalThreadId: "923339998877" }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    expect(conv.messages[0].body).toContain("price");
    expect(conv.messages.at(-1)?.sender).toBe("AI");
    expect(conv.messages.at(-1)?.body).toMatch(/3,990/);
  });
});
