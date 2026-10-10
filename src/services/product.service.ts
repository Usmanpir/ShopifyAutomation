import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { ServiceContext } from "@/lib/service-context";
import { paginate, paginationSchema, sortDir } from "@/schemas/common";
import { variantSalesByDay } from "./inventory.service";

export const productListQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(60).optional(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional(),
  stock: z.enum(["low", "out", "in"]).optional(),
  sort: z.enum(["title", "price", "totalInventory", "unitsSold", "revenue", "returnRate", "createdAt"]).default("revenue"),
  dir: sortDir,
});
export type ProductListQuery = z.infer<typeof productListQuery>;

export async function listProducts(storeId: string, q: ProductListQuery) {
  const where: Prisma.ProductWhereInput = {
    storeId,
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.category ? { category: { slug: q.category } } : {}),
    ...(q.stock === "out" ? { totalInventory: { lte: 0 } } : {}),
    ...(q.stock === "in" ? { totalInventory: { gt: 0 } } : {}),
    ...(q.stock === "low" ? { variants: { some: { inventoryQuantity: { gt: 0, lte: 10 } } } } : {}),
    ...(q.q
      ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q.q, mode: "insensitive" } } } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { [q.sort]: q.dir },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { category: { select: { name: true, slug: true } }, _count: { select: { variants: true } } },
    }),
    db.product.count({ where }),
  ]);
  const items = rows.map((p) => ({
    ...p,
    conversionRate: p.sessions > 0 ? (p.unitsSold / p.sessions) * 100 : 0,
  }));
  return paginate(items, total, q.page, q.pageSize);
}

export async function listCategories(storeId: string) {
  const cats = await db.productCategory.findMany({
    where: { storeId },
    orderBy: { position: "asc" },
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, productCount: c._count.products }));
}

export async function getProductDetail(storeId: string, id: string) {
  const product = await db.product.findFirst({
    where: { id, storeId, deletedAt: null },
    include: { category: true, variants: { orderBy: { position: "asc" } } },
  });
  if (!product) throw notFound("Product");
  const sales = await variantSalesByDay(storeId, 30, product.variants.map((v) => v.id));
  const daily = sales.keys.map((date, i) => ({ date, units: product.variants.reduce((s, v) => s + sales.series(v.id)[i], 0) }));
  const recentOrders = await db.order.findMany({
    where: { storeId, items: { some: { productId: id } } },
    orderBy: { placedAt: "desc" },
    take: 8,
    select: { id: true, name: true, customerName: true, total: true, status: true, placedAt: true },
  });
  const sizes = [...new Set(product.variants.map((v) => v.size).filter(Boolean))] as string[];
  const colors = [...new Set(product.variants.map((v) => v.color).filter(Boolean))] as string[];
  return {
    ...product,
    conversionRate: product.sessions > 0 ? (product.unitsSold / product.sessions) * 100 : 0,
    salesDaily: daily,
    recentOrders,
    matrix: { sizes, colors },
  };
}

/**
 * Product intelligence from real orders: 14-day sales trend and what is
 * bought together with it (only shown when enough orders support it).
 */
export async function productIntelligence(storeId: string, productId: string) {
  const since28 = new Date(Date.now() - 28 * 86_400_000);
  const since14 = new Date(Date.now() - 14 * 86_400_000);
  const since90 = new Date(Date.now() - 90 * 86_400_000);
  const [recent, previous, pairs, base] = await Promise.all([
    db.orderItem.aggregate({ where: { productId, order: { storeId, placedAt: { gte: since14 }, status: { not: "CANCELLED" } } }, _sum: { quantity: true } }),
    db.orderItem.aggregate({ where: { productId, order: { storeId, placedAt: { gte: since28, lt: since14 }, status: { not: "CANCELLED" } } }, _sum: { quantity: true } }),
    db.$queryRaw<{ id: string; title: string; image: string | null; orders: bigint }[]>`
      SELECT other."productId" AS id, MAX(other.title) AS title, MAX(other."imageUrl") AS image, COUNT(DISTINCT o.id) AS orders
      FROM "OrderItem" mine
      JOIN "Order" o ON o.id = mine."orderId"
      JOIN "OrderItem" other ON other."orderId" = o.id AND other."productId" IS NOT NULL AND other."productId" <> mine."productId"
      WHERE mine."productId" = ${productId} AND o."storeId" = ${storeId} AND o."placedAt" >= ${since90} AND o.status <> 'CANCELLED'
      GROUP BY other."productId" ORDER BY orders DESC LIMIT 3`,
    db.order.count({ where: { storeId, placedAt: { gte: since90 }, status: { not: "CANCELLED" }, items: { some: { productId } } } }),
  ]);
  const r = recent._sum.quantity ?? 0;
  const p = previous._sum.quantity ?? 0;
  const MIN_ORDERS = 5;
  return {
    trend: { recent: r, previous: p, change: p ? Math.round(((r - p) / p) * 100) : null },
    ordersWithProduct: base,
    crossSell:
      base >= MIN_ORDERS
        ? pairs
            .map((x) => ({ id: x.id, title: x.title, imageUrl: x.image, orders: Number(x.orders), share: Math.round((Number(x.orders) / base) * 100) }))
            // Below 10% of orders it's coincidence, not a pattern worth acting on.
            .filter((x) => x.orders >= 2 && x.share >= 10)
        : [],
    minOrders: MIN_ORDERS,
  };
}

/** Per-product count of low (1..threshold) and out-of-stock variants, for list indicators. */
export async function variantStockFlags(storeId: string, productIds: string[]) {
  if (!productIds.length) return {} as Record<string, { low: number; out: number; variants: number }>;
  const variants = await db.productVariant.findMany({
    where: { storeId, productId: { in: productIds } },
    select: { productId: true, inventoryQuantity: true, lowStockThreshold: true },
  });
  const out: Record<string, { low: number; out: number; variants: number }> = {};
  for (const v of variants) {
    const e = (out[v.productId] ??= { low: 0, out: 0, variants: 0 });
    e.variants++;
    if (v.inventoryQuantity <= 0) e.out++;
    else if (v.inventoryQuantity <= v.lowStockThreshold) e.low++;
  }
  return out;
}

/** Active AI insights about a product or any of its variants, newest first. */
export async function listProductInsights(storeId: string, productId: string, limit = 4) {
  const variants = await db.productVariant.findMany({ where: { storeId, productId }, select: { id: true } });
  return db.aIInsight.findMany({
    where: { storeId, dismissedAt: null, relatedId: { in: [productId, ...variants.map((v) => v.id)] } },
    orderBy: { generatedAt: "desc" },
    take: limit,
    include: { agent: { select: { name: true } } },
  });
}

export const productUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional(),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
});

export async function updateProduct(ctx: ServiceContext, id: string, input: z.infer<typeof productUpdateSchema>) {
  const before = await db.product.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!before) throw notFound("Product");
  const after = await db.product.update({ where: { id }, data: input });
  await audit(ctx, {
    action: "product.update",
    resourceType: "product",
    resourceId: id,
    resourceLabel: after.title,
    oldValue: Object.fromEntries(Object.keys(input).map((k) => [k, before[k as keyof typeof before]])),
    newValue: input,
  });
  return after;
}

/** Price changes are always audited; AI-initiated ones go through approval (see tools). */
export async function changeVariantPrice(ctx: ServiceContext, variantId: string, price: number) {
  const v = await db.productVariant.findFirst({ where: { id: variantId, storeId: ctx.storeId }, include: { product: true } });
  if (!v) throw notFound("Variant");
  await db.productVariant.update({ where: { id: variantId }, data: { price } });
  const min = await db.productVariant.aggregate({ where: { productId: v.productId }, _min: { price: true } });
  await db.product.update({ where: { id: v.productId }, data: { price: min._min.price ?? price } });
  await audit(ctx, {
    action: "product.price_change",
    resourceType: "variant",
    resourceId: variantId,
    resourceLabel: `${v.product.title} · ${v.title}`,
    oldValue: { price: v.price },
    newValue: { price },
  });
  return { previous: v.price, price };
}
