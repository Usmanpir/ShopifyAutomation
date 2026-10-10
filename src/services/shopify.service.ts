import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { notFound } from "@/lib/errors";
import { toMinor } from "@/lib/money";
import { PRODUCTS_PAGE, fromGid, registerShopifyWebhooks, shopifyGraphql } from "@/lib/shopify/client";
import { normalizeShopifyOrder, shopifyInventoryLevelSchema } from "@/lib/shopify/mappers";
import { systemContext } from "@/lib/service-context";
import { checkLowStockForVariants } from "./inventory.service";
import { addOrderEvent, ingestOrder, transitionOrder } from "./order.service";
import { findOrCreateCustomer } from "./customer.service";

// ───────────────────────── Install ─────────────────────────

export async function completeShopifyInstall(storeId: string, shop: string, accessToken: string, scope: string) {
  await db.shopifyConnection.upsert({
    where: { storeId },
    create: { storeId, shopDomain: shop, accessTokenEnc: encrypt(accessToken), scopes: scope, apiVersion: env().SHOPIFY_API_VERSION },
    update: { shopDomain: shop, accessTokenEnc: encrypt(accessToken), scopes: scope, apiVersion: env().SHOPIFY_API_VERSION, uninstalledAt: null, installedAt: new Date() },
  });
  await db.integration.upsert({
    where: { storeId_provider: { storeId, provider: "SHOPIFY" } },
    create: { storeId, provider: "SHOPIFY", status: "CONNECTED", config: { shop }, connectedAt: new Date() },
    update: { status: "CONNECTED", config: { shop }, connectedAt: new Date(), lastError: null },
  });
  const { failures } = await registerShopifyWebhooks(shop, accessToken);
  await db.shopifyConnection.update({ where: { storeId }, data: { webhooksRegistered: failures.length === 0, lastSyncError: failures.join("; ") || null } });
}

async function connection(storeId: string) {
  const conn = await db.shopifyConnection.findUnique({ where: { storeId } });
  if (!conn || conn.uninstalledAt) throw notFound("Shopify connection");
  return { shop: conn.shopDomain, token: decrypt(conn.accessTokenEnc) };
}

// ───────────────────────── Products ─────────────────────────

const restProductSchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform(String),
    title: z.string(),
    handle: z.string(),
    body_html: z.string().nullish(),
    product_type: z.string().nullish(),
    vendor: z.string().nullish(),
    status: z.string().default("active"),
    tags: z.string().default(""),
    image: z.object({ src: z.string() }).nullish(),
    options: z.array(z.object({ name: z.string(), position: z.number() })).default([]),
    variants: z.array(
      z
        .object({
          id: z.union([z.number(), z.string()]).transform(String),
          title: z.string(),
          sku: z.string().nullish(),
          price: z.union([z.string(), z.number()]),
          compare_at_price: z.union([z.string(), z.number()]).nullish(),
          inventory_quantity: z.number().default(0),
          inventory_item_id: z.union([z.number(), z.string()]).nullish(),
          option1: z.string().nullish(),
          option2: z.string().nullish(),
          option3: z.string().nullish(),
          position: z.number().default(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type NormalizedProduct = {
  externalId: string;
  title: string;
  handle: string;
  description: string | null;
  productType: string | null;
  vendor: string | null;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  tags: string[];
  imageUrl: string | null;
  variants: { externalId: string; inventoryItemId: string | null; title: string; sku: string | null; size: string | null; color: string | null; price: number; compareAtPrice: number | null; costPrice: number | null; inventoryQuantity: number; position: number }[];
};

export function normalizeRestProduct(raw: unknown): NormalizedProduct {
  const p = restProductSchema.parse(raw);
  const optionIndex = (name: RegExp) => p.options.find((o) => name.test(o.name))?.position ?? null;
  const sizeIdx = optionIndex(/size/i);
  const colorIdx = optionIndex(/colou?r/i);
  const opt = (v: { option1?: string | null; option2?: string | null; option3?: string | null }, i: number | null) =>
    i === 1 ? (v.option1 ?? null) : i === 2 ? (v.option2 ?? null) : i === 3 ? (v.option3 ?? null) : null;
  return {
    externalId: p.id,
    title: p.title,
    handle: p.handle,
    description: p.body_html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null,
    productType: p.product_type ?? null,
    vendor: p.vendor ?? null,
    status: p.status === "active" ? "ACTIVE" : p.status === "archived" ? "ARCHIVED" : "DRAFT",
    tags: p.tags.split(",").map((t) => t.trim()).filter(Boolean),
    imageUrl: p.image?.src ?? null,
    variants: p.variants.map((v) => ({
      externalId: v.id,
      inventoryItemId: v.inventory_item_id != null ? String(v.inventory_item_id) : null,
      title: v.title,
      sku: v.sku ?? null,
      size: opt(v, sizeIdx),
      color: opt(v, colorIdx),
      price: toMinor(Number(v.price)),
      compareAtPrice: v.compare_at_price ? toMinor(Number(v.compare_at_price)) : null,
      costPrice: null,
      inventoryQuantity: v.inventory_quantity,
      position: v.position,
    })),
  };
}

export async function upsertProduct(storeId: string, p: NormalizedProduct) {
  const categories = await db.productCategory.findMany({ where: { storeId } });
  const category =
    categories.find((c) => p.productType && c.name.toLowerCase() === p.productType.toLowerCase()) ??
    categories.find((c) => p.title.toLowerCase().includes(c.name.toLowerCase().replace(/s$/, ""))) ??
    categories.find((c) => c.slug === "other");
  const data = {
    title: p.title,
    description: p.description,
    vendor: p.vendor,
    imageUrl: p.imageUrl,
    status: p.status,
    tags: p.tags,
    categoryId: category?.id ?? null,
    price: Math.min(...p.variants.map((v) => v.price), Number.MAX_SAFE_INTEGER),
    compareAtPrice: p.variants.find((v) => v.compareAtPrice)?.compareAtPrice ?? null,
    totalInventory: p.variants.reduce((s, v) => s + v.inventoryQuantity, 0),
  };
  const product = await db.product.upsert({
    where: { storeId_externalId: { storeId, externalId: p.externalId } },
    create: { storeId, externalId: p.externalId, handle: p.handle, ...data },
    update: { ...data, deletedAt: null },
  });
  for (const v of p.variants) {
    await db.productVariant.upsert({
      where: { storeId_externalId: { storeId, externalId: v.externalId } },
      create: { storeId, productId: product.id, ...v },
      update: { title: v.title, sku: v.sku, size: v.size, color: v.color, price: v.price, compareAtPrice: v.compareAtPrice, inventoryQuantity: v.inventoryQuantity, inventoryItemId: v.inventoryItemId, position: v.position, ...(v.costPrice ? { costPrice: v.costPrice } : {}) },
    });
  }
  return product;
}

/** Full catalog backfill via GraphQL (used after install and by "Sync now"). */
export async function syncShopifyProducts(storeId: string) {
  const { shop, token } = await connection(storeId);
  let cursor: string | null = null;
  let count = 0;
  type Page = {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: {
        id: string; title: string; handle: string; descriptionHtml: string; productType: string; vendor: string; status: string; tags: string[];
        featuredMedia: { preview?: { image?: { url: string } } } | null;
        variants: { nodes: { id: string; title: string; sku: string | null; price: string; compareAtPrice: string | null; inventoryQuantity: number | null; inventoryItem: { id: string; unitCost: { amount: string } | null }; selectedOptions: { name: string; value: string }[] }[] };
      }[];
    };
  };
  do {
    const data: Page = await shopifyGraphql<Page>(shop, token, PRODUCTS_PAGE, { cursor });
    for (const n of data.products.nodes) {
      await upsertProduct(storeId, {
        externalId: fromGid(n.id),
        title: n.title,
        handle: n.handle,
        description: n.descriptionHtml?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null,
        productType: n.productType || null,
        vendor: n.vendor || null,
        status: n.status === "ACTIVE" ? "ACTIVE" : n.status === "ARCHIVED" ? "ARCHIVED" : "DRAFT",
        tags: n.tags,
        imageUrl: n.featuredMedia?.preview?.image?.url ?? null,
        variants: n.variants.nodes.map((v, i) => ({
          externalId: fromGid(v.id),
          inventoryItemId: fromGid(v.inventoryItem.id),
          title: v.title,
          sku: v.sku,
          size: v.selectedOptions.find((o) => /size/i.test(o.name))?.value ?? null,
          color: v.selectedOptions.find((o) => /colou?r/i.test(o.name))?.value ?? null,
          price: toMinor(Number(v.price)),
          compareAtPrice: v.compareAtPrice ? toMinor(Number(v.compareAtPrice)) : null,
          costPrice: v.inventoryItem.unitCost ? toMinor(Number(v.inventoryItem.unitCost.amount)) : null,
          inventoryQuantity: v.inventoryQuantity ?? 0,
          position: i,
        })),
      });
      count++;
    }
    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);
  await db.shopifyConnection.update({ where: { storeId }, data: { lastSyncAt: new Date(), lastSyncError: null } });
  return { products: count };
}

// ───────────────────────── Webhook processing ─────────────────────────

/** Applies one verified Shopify webhook. Must be idempotent (Shopify retries). */
export async function processShopifyWebhook(storeId: string, topic: string, payload: unknown) {
  const sys = systemContext(storeId, "Shopify");
  switch (topic) {
    case "orders/create": {
      await ingestOrder(storeId, normalizeShopifyOrder(payload), { source: "shopify" });
      return;
    }
    case "orders/updated":
    case "orders/paid": {
      const n = normalizeShopifyOrder(payload);
      const existing = await db.order.findUnique({ where: { storeId_externalId: { storeId, externalId: n.externalId } } });
      if (!existing) {
        await ingestOrder(storeId, n, { source: "shopify" });
        return;
      }
      await db.order.update({ where: { id: existing.id }, data: { paymentStatus: n.paymentStatus, tags: n.tags, note: n.note } });
      if (n.cancelledAt && existing.status !== "CANCELLED") await transitionOrder(sys, existing.id, "cancel", n.cancelReason ?? "Cancelled in Shopify").catch(() => undefined);
      return;
    }
    case "orders/cancelled": {
      const n = normalizeShopifyOrder(payload);
      const existing = await db.order.findUnique({ where: { storeId_externalId: { storeId, externalId: n.externalId } } });
      if (existing && existing.status !== "CANCELLED") await transitionOrder(sys, existing.id, "cancel", n.cancelReason ?? "Cancelled in Shopify").catch(() => undefined);
      return;
    }
    case "orders/fulfilled":
    case "fulfillments/create":
    case "fulfillments/update": {
      const p = payload as { order_id?: number | string; id?: number | string; tracking_number?: string; tracking_company?: string; tracking_url?: string; shipment_status?: string };
      const orderExternalId = String(topic === "orders/fulfilled" ? p.id : p.order_id);
      const order = await db.order.findUnique({ where: { storeId_externalId: { storeId, externalId: orderExternalId } } });
      if (!order) return;
      if (p.tracking_number && !(await db.shipment.findFirst({ where: { orderId: order.id, trackingNumber: p.tracking_number } }))) {
        await db.shipment.create({
          data: { storeId, orderId: order.id, courier: p.tracking_company ?? "manual", trackingNumber: p.tracking_number, trackingUrl: p.tracking_url ?? null, status: "BOOKED", codAmount: order.paymentMethod === "COD" ? order.total : 0 },
        });
        await addOrderEvent(storeId, order.id, "shipment_created", "Shipment created in Shopify", { description: `${p.tracking_company ?? "Courier"} · ${p.tracking_number}`, actorType: "WEBHOOK", actorName: "Shopify" });
      }
      if (["CONFIRMED", "PROCESSING", "NEW", "PENDING_CONFIRMATION"].includes(order.status)) {
        if (order.status === "NEW" || order.status === "PENDING_CONFIRMATION") await transitionOrder(sys, order.id, "confirm", "Fulfilled in Shopify").catch(() => undefined);
        await transitionOrder(sys, order.id, "ship").catch(() => undefined);
      }
      if (p.shipment_status === "delivered") await transitionOrder(sys, order.id, "deliver").catch(() => undefined);
      return;
    }
    case "refunds/create": {
      const p = payload as { order_id: number | string; transactions?: { amount: string }[] };
      const order = await db.order.findUnique({ where: { storeId_externalId: { storeId, externalId: String(p.order_id) } } });
      if (!order) return;
      const amount = (p.transactions ?? []).reduce((s, t) => s + toMinor(Number(t.amount)), 0);
      await db.order.update({ where: { id: order.id }, data: { paymentStatus: amount >= order.total ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      await addOrderEvent(storeId, order.id, "refunded", "Refund recorded in Shopify", { actorType: "WEBHOOK", actorName: "Shopify" });
      return;
    }
    case "products/create":
    case "products/update": {
      await upsertProduct(storeId, normalizeRestProduct(payload));
      return;
    }
    case "products/delete": {
      const id = String((payload as { id: number | string }).id);
      await db.product.updateMany({ where: { storeId, externalId: id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
      return;
    }
    case "inventory_levels/update": {
      const lvl = shopifyInventoryLevelSchema.parse(payload);
      const variant = await db.productVariant.findFirst({ where: { storeId, inventoryItemId: lvl.inventory_item_id } });
      if (!variant || lvl.available === null) return;
      const delta = lvl.available - variant.inventoryQuantity;
      await db.$transaction([
        db.productVariant.update({ where: { id: variant.id }, data: { inventoryQuantity: lvl.available } }),
        db.product.update({ where: { id: variant.productId }, data: { totalInventory: { increment: delta } } }),
      ]);
      await checkLowStockForVariants(storeId, [variant.id]);
      return;
    }
    case "customers/create":
    case "customers/update": {
      const c = payload as { id: number | string; first_name?: string; last_name?: string; email?: string; phone?: string; default_address?: { city?: string } };
      await findOrCreateCustomer(storeId, {
        externalId: String(c.id),
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Customer",
        email: c.email,
        phone: c.phone,
        city: c.default_address?.city,
      });
      return;
    }
    case "app/uninstalled": {
      await db.shopifyConnection.updateMany({ where: { storeId }, data: { uninstalledAt: new Date() } });
      await db.integration.updateMany({ where: { storeId, provider: "SHOPIFY" }, data: { status: "DISCONNECTED" } });
      return;
    }
    default:
      return;
  }
}

export type { Prisma };
