import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { DAY_MS, dayKey } from "@/lib/dates";
import { notFound } from "@/lib/errors";
import { publishEvent } from "@/lib/events/bus";
import { computeCoverage, suggestedReorder, type CoverageResult } from "@/lib/inventory/coverage";
import type { ServiceContext } from "@/lib/service-context";
import { getStore } from "./store.service";

/** Units sold per variant per day over `days`, from non-cancelled orders. */
export async function variantSalesByDay(storeId: string, days: number, variantIds?: string[]) {
  const store = await getStore(storeId);
  const since = new Date(Date.now() - days * DAY_MS);
  const items = await db.orderItem.findMany({
    where: {
      variantId: variantIds ? { in: variantIds } : { not: null },
      order: { storeId, placedAt: { gte: since }, status: { not: "CANCELLED" } },
    },
    select: { variantId: true, quantity: true, order: { select: { placedAt: true } } },
  });
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(new Date(Date.now() - i * DAY_MS), store.timezone));
  const map = new Map<string, Map<string, number>>();
  for (const it of items) {
    const byDay = map.get(it.variantId!) ?? new Map<string, number>();
    const k = dayKey(it.order.placedAt, store.timezone);
    byDay.set(k, (byDay.get(k) ?? 0) + it.quantity);
    map.set(it.variantId!, byDay);
  }
  return {
    keys,
    series: (variantId: string) => keys.map((k) => map.get(variantId)?.get(k) ?? 0),
  };
}

export type VariantInventoryRow = {
  id: string;
  title: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  stock: number;
  threshold: number;
  coverage: CoverageResult;
  reorder: number;
};

/** Inventory intelligence for the whole catalog: KPIs + per-product coverage. */
export async function inventoryOverview(storeId: string, filter: { q?: string; status?: string; category?: string } = {}) {
  const store = await getStore(storeId);
  const windowDays = store.settings.inventory.velocityWindowDays;
  const products = await db.product.findMany({
    where: {
      storeId,
      deletedAt: null,
      status: { not: "ARCHIVED" },
      ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" } } : {}),
      ...(filter.category ? { category: { slug: filter.category } } : {}),
    },
    include: { variants: { orderBy: { position: "asc" } }, category: true },
    orderBy: { title: "asc" },
  });
  const sales = await variantSalesByDay(storeId, 30);

  const rows = products.map((p) => {
    const variants: VariantInventoryRow[] = p.variants.map((v) => {
      const s30 = sales.series(v.id);
      const recent = s30.slice(-windowDays);
      const baseline = s30.reduce((a, b) => a + b, 0) / 30;
      const coverage = computeCoverage({ stock: v.inventoryQuantity, dailySales: recent, baselineDailyAverage: baseline }, store.settings.inventory.coverageWarningDays);
      return {
        id: v.id,
        title: v.title,
        sku: v.sku,
        size: v.size,
        color: v.color,
        stock: v.inventoryQuantity,
        threshold: v.lowStockThreshold,
        coverage,
        reorder: suggestedReorder(v.inventoryQuantity, coverage.averageDailySales),
      };
    });
    const stock = variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
    const productSales = Array.from({ length: windowDays }, (_, i) => variants.reduce((s, v) => s + sales.series(v.id).slice(-windowDays)[i], 0));
    const baselineTotal = variants.reduce((s, v) => s + sales.series(v.id).reduce((a, b) => a + b, 0), 0) / 30;
    const coverage = computeCoverage({ stock, dailySales: productSales, baselineDailyAverage: baselineTotal }, store.settings.inventory.coverageWarningDays);
    return {
      id: p.id,
      title: p.title,
      imageUrl: p.imageUrl,
      category: p.category?.name ?? "Other",
      stock,
      lowVariants: variants.filter((v) => v.stock > 0 && v.stock <= v.threshold).length,
      outVariants: variants.filter((v) => v.stock <= 0).length,
      coverage,
      variants,
      unitsSold30d: variants.reduce((s, v) => s + sales.series(v.id).reduce((a, b) => a + b, 0), 0),
    };
  });

  const allVariants = rows.flatMap((r) => r.variants);
  const sortedBySales = [...rows].sort((a, b) => b.unitsSold30d - a.unitsSold30d);
  const kpis = {
    totalProducts: rows.length,
    totalUnits: rows.reduce((s, r) => s + r.stock, 0),
    lowStock: allVariants.filter((v) => v.stock > 0 && v.stock <= v.threshold).length,
    outOfStock: allVariants.filter((v) => v.stock <= 0).length,
    fastSelling: rows.filter((r) => (r.coverage.velocityMultiplier ?? 0) >= 1.5 || r.unitsSold30d >= (sortedBySales[Math.floor(rows.length * 0.2)]?.unitsSold30d ?? Infinity)).length,
    slowSelling: rows.filter((r) => r.unitsSold30d <= 2 && r.stock > 20).length,
  };

  const filtered = filter.status && filter.status in INVENTORY_FILTERS ? rows.filter(INVENTORY_FILTERS[filter.status as InventoryFilter]) : rows;
  if (filter.status === "fast") filtered.sort((a, b) => b.unitsSold30d - a.unitsSold30d);

  return {
    kpis,
    rows: filtered.sort((a, b) => (a.coverage.coverageDays ?? 9999) - (b.coverage.coverageDays ?? 9999)),
    windowDays,
    /** Product counts per status tab (before the status filter). */
    tabCounts: {
      all: rows.length,
      ...(Object.fromEntries(Object.entries(INVENTORY_FILTERS).map(([k, fn]) => [k, rows.filter(fn).length])) as Record<InventoryFilter, number>),
    },
  };
}

type InventoryProductRow = { lowVariants: number; outVariants: number; stock: number; unitsSold30d: number; coverage: CoverageResult };
export type InventoryFilter = "low" | "out" | "critical" | "fast" | "slow";

/** Status-tab predicates for the inventory overview (single source for filtering and tab counts). */
export const INVENTORY_FILTERS: Record<InventoryFilter, (r: InventoryProductRow) => boolean> = {
  low: (r) => r.lowVariants > 0,
  out: (r) => r.outVariants > 0,
  critical: (r) => r.coverage.status === "CRITICAL" || r.coverage.status === "LOW",
  fast: (r) => (r.coverage.velocityMultiplier ?? 0) >= 1.3,
  slow: (r) => r.unitsSold30d <= 2 && r.stock > 20,
};

const URGENCY: Record<CoverageResult["status"], number> = { OUT_OF_STOCK: 0, CRITICAL: 1, LOW: 2, HEALTHY: 3, OVERSTOCKED: 4, NO_SALES: 5 };

/** Sort key for "most urgent first": status bucket, then shortest coverage, then fastest seller. */
export function urgencyRank(v: { coverage: CoverageResult }) {
  return URGENCY[v.coverage.status] * 100000 + Math.min(99999, v.coverage.coverageDays ?? 99999) - v.coverage.averageDailySales / 1000;
}

/** Per-variant inventory intelligence for one product (coverage, reorder, most urgent variant). */
export async function getProductInventory(storeId: string, productId: string) {
  const store = await getStore(storeId);
  const windowDays = store.settings.inventory.velocityWindowDays;
  const warningDays = store.settings.inventory.coverageWarningDays;
  const variants = await db.productVariant.findMany({ where: { storeId, productId }, orderBy: { position: "asc" } });
  const sales = await variantSalesByDay(storeId, 30, variants.map((v) => v.id));
  const rows: VariantInventoryRow[] = variants.map((v) => {
    const s30 = sales.series(v.id);
    const coverage = computeCoverage(
      { stock: v.inventoryQuantity, dailySales: s30.slice(-windowDays), baselineDailyAverage: s30.reduce((a, b) => a + b, 0) / 30 },
      warningDays,
    );
    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      size: v.size,
      color: v.color,
      stock: v.inventoryQuantity,
      threshold: v.lowStockThreshold,
      coverage,
      reorder: suggestedReorder(v.inventoryQuantity, coverage.averageDailySales),
    };
  });
  // The most urgent variant that is still selling (an out-of-stock variant with no demand isn't actionable).
  const ranked = [...rows].sort((a, b) => urgencyRank(a) - urgencyRank(b));
  const mostUrgent = ranked.find((v) => v.coverage.averageDailySales > 0 && ["OUT_OF_STOCK", "CRITICAL", "LOW"].includes(v.coverage.status)) ?? null;
  return { variants: rows, mostUrgent, windowDays, warningDays };
}

export async function getVariantInventory(storeId: string, variantId: string) {
  const store = await getStore(storeId);
  const v = await db.productVariant.findFirst({ where: { id: variantId, storeId }, include: { product: true } });
  if (!v) throw notFound("Variant");
  const sales = await variantSalesByDay(storeId, 30, [variantId]);
  const s30 = sales.series(variantId);
  const window = store.settings.inventory.velocityWindowDays;
  const coverage = computeCoverage(
    { stock: v.inventoryQuantity, dailySales: s30.slice(-window), baselineDailyAverage: s30.reduce((a, b) => a + b, 0) / 30 },
    store.settings.inventory.coverageWarningDays,
  );
  return {
    variant: v,
    displayName: `${v.product.title}${v.title && v.title !== "Default" ? ` ${v.title}` : ""}`,
    coverage,
    reorder: suggestedReorder(v.inventoryQuantity, coverage.averageDailySales),
    dailySales: s30,
  };
}

export const adjustSchema = z.object({
  mode: z.enum(["set", "adjust"]),
  quantity: z.number().int().min(-100000).max(100000),
  reason: z.string().trim().min(2).max(200),
});

export async function adjustInventory(ctx: ServiceContext, variantId: string, input: z.infer<typeof adjustSchema>) {
  const v = await db.productVariant.findFirst({ where: { id: variantId, storeId: ctx.storeId }, include: { product: true } });
  if (!v) throw notFound("Variant");
  const next = input.mode === "set" ? input.quantity : v.inventoryQuantity + input.quantity;
  const delta = next - v.inventoryQuantity;
  await db.$transaction([
    db.productVariant.update({ where: { id: variantId }, data: { inventoryQuantity: next } }),
    db.product.update({ where: { id: v.productId }, data: { totalInventory: { increment: delta } } }),
  ]);
  await audit(ctx, {
    action: "inventory.adjust",
    resourceType: "variant",
    resourceId: variantId,
    resourceLabel: `${v.product.title} · ${v.title}`,
    oldValue: { quantity: v.inventoryQuantity },
    newValue: { quantity: next },
    reason: input.reason,
  });
  await checkLowStockForVariants(ctx.storeId, [variantId]);
  return { quantity: next };
}

/** Publishes INVENTORY_LOW / INVENTORY_OUT once per variant per 24h when thresholds are crossed. */
export async function checkLowStockForVariants(storeId: string, variantIds: string[]) {
  if (!variantIds.length) return 0;
  const variants = await db.productVariant.findMany({ where: { id: { in: variantIds }, storeId }, include: { product: true } });
  let emitted = 0;
  for (const v of variants) {
    if (v.inventoryQuantity > v.lowStockThreshold) continue;
    const type = v.inventoryQuantity <= 0 ? "INVENTORY_OUT" : "INVENTORY_LOW";
    const recent = await db.domainEvent.findFirst({
      where: { storeId, type, createdAt: { gte: new Date(Date.now() - DAY_MS) }, payload: { path: ["variantId"], equals: v.id } },
    });
    if (recent) continue;
    const name = `${v.product.title} ${v.title}`;
    await publishEvent(storeId, type, {
      title: type === "INVENTORY_OUT" ? `${name} is out of stock` : `Low stock: ${name} (${v.inventoryQuantity} left)`,
      tone: type === "INVENTORY_OUT" ? "danger" : "warning",
      href: `/products/${v.productId}`,
      payload: { variantId: v.id, productId: v.productId, quantity: v.inventoryQuantity },
    });
    emitted++;
  }
  return emitted;
}

/** Inventory Agent analysis for a variant → AIInsight with evidence. */
export async function analyzeVariantInventory(storeId: string, variantId: string) {
  const info = await getVariantInventory(storeId, variantId);
  const { coverage, reorder, displayName, variant } = info;
  const agent = await db.aIAgent.findUnique({ where: { storeId_key: { storeId, key: "INVENTORY" } } });
  const accelerating = (coverage.velocityMultiplier ?? 0) >= 1.3;
  const insight = await db.aIInsight.create({
    data: {
      storeId,
      agentId: agent?.id ?? null,
      kind: "INVENTORY",
      severity: coverage.status === "OUT_OF_STOCK" || coverage.status === "CRITICAL" ? "CRITICAL" : coverage.status === "LOW" ? "WARNING" : "INFO",
      // Only call it an alert when coverage is actually short.
      title: ["OUT_OF_STOCK", "CRITICAL", "LOW"].includes(coverage.status) ? "Inventory Alert" : "Inventory Check",
      headline: displayName,
      whatHappened: accelerating
        ? `${displayName} is selling ${coverage.velocityMultiplier}× faster than its 30-day average.`
        : `${displayName} has ${variant.inventoryQuantity} units remaining.`,
      whyItMatters:
        coverage.coverageDays !== null
          ? `At the current pace stock runs out in about ${coverage.coverageDays} days.`
          : "No recent sales — current stock is sufficient.",
      evidence: [
        { label: "Current inventory", value: `${variant.inventoryQuantity} units` },
        { label: "Average daily sales", value: String(coverage.averageDailySales) },
        { label: "Estimated coverage", value: coverage.coverageDays === null ? "—" : `${coverage.coverageDays} days` },
        ...(coverage.velocityMultiplier ? [{ label: "Velocity vs 30-day avg", value: `${coverage.velocityMultiplier}×` }] : []),
      ] as Prisma.InputJsonValue,
      suggestedAction: reorder > 0 ? `Review replenishment — about ${reorder} units cover the next 30 days.` : "Review inventory replenishment.",
      actionLabel: "View Product",
      actionHref: `/products/${variant.productId}`,
      relatedType: "variant",
      relatedId: variantId,
    },
  });
  if (agent) await db.aIAgent.update({ where: { id: agent.id }, data: { lastActiveAt: new Date() } });
  return insight;
}

/** Daily snapshot used for historical stock charts. */
export async function snapshotInventory(storeId: string) {
  const store = await getStore(storeId);
  const date = new Date(dayKey(new Date(), store.timezone));
  const variants = await db.productVariant.findMany({ where: { storeId }, select: { id: true, inventoryQuantity: true } });
  for (const v of variants) {
    await db.inventorySnapshot.upsert({
      where: { variantId_date: { variantId: v.id, date } },
      create: { storeId, variantId: v.id, date, quantity: v.inventoryQuantity },
      update: { quantity: v.inventoryQuantity },
    });
  }
  return variants.length;
}
