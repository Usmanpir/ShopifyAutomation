import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatMoney, percentChange } from "@/lib/money";
import { topProductsWithGrowth } from "./analytics.service";
import { inventoryOverview } from "./inventory.service";
import { runAdsAnalysis } from "./meta.service";
import { getStore } from "./store.service";

type InsightInput = Omit<Prisma.AIInsightUncheckedCreateInput, "storeId" | "evidence"> & { evidence: { label: string; value: string }[] };

/** Purchase-affinity between categories: P(B | bought A) vs P(B). */
export async function categoryAffinity(storeId: string) {
  const rows = await db.$queryRaw<{ customer: string; category: string }[]>`
    SELECT DISTINCT o."customerId" AS customer, c.slug AS category
    FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    JOIN "Product" p ON p.id = i."productId" JOIN "ProductCategory" c ON c.id = p."categoryId"
    WHERE o."storeId" = ${storeId} AND o.status <> 'CANCELLED' AND o."customerId" IS NOT NULL`;
  const byCustomer = new Map<string, Set<string>>();
  for (const r of rows) byCustomer.set(r.customer, (byCustomer.get(r.customer) ?? new Set()).add(r.category));
  const total = byCustomer.size;
  if (total < 20) return null;
  // "Other" (accessories) is too generic to make a useful recommendation.
  const cats = [...new Set(rows.map((r) => r.category))].filter((c) => c !== "other");
  let best: { a: string; b: string; lift: number; pBgivenA: number; pB: number; support: number } | null = null;
  for (const a of cats) {
    const withA = [...byCustomer.values()].filter((s) => s.has(a));
    if (withA.length < 10) continue;
    for (const b of cats) {
      if (a === b) continue;
      const pB = [...byCustomer.values()].filter((s) => s.has(b)).length / total;
      const pBgivenA = withA.filter((s) => s.has(b)).length / withA.length;
      if (pB === 0) continue;
      const lift = pBgivenA / pB - 1;
      if (lift > 0.1 && (!best || lift > best.lift)) best = { a, b, lift, pBgivenA, pB, support: withA.length };
    }
  }
  if (!best) return null;
  const names = await db.productCategory.findMany({ where: { storeId, slug: { in: [best.a, best.b] } } });
  return { ...best, aName: names.find((n) => n.slug === best!.a)?.name ?? best.a, bName: names.find((n) => n.slug === best!.b)?.name ?? best.b };
}

/** Regenerates dashboard insights from live data. Each insight explains what/why/evidence/action. */
export async function generateInsights(storeId: string) {
  const store = await getStore(storeId);
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const agents = await db.aIAgent.findMany({ where: { storeId } });
  const agentId = (key: string) => agents.find((a) => a.key === key)?.id ?? null;
  const out: InsightInput[] = [];

  // 🔥 Top product by growth
  // Rank by growth weighted by volume so a jump from 1 → 4 units doesn't beat a real best-seller.
  const top = (await topProductsWithGrowth(storeId, { range: "7d" }, 10))
    .filter((p) => p.previousUnits >= 4 && p.units >= 6)
    .sort((a, b) => b.growth * Math.sqrt(b.units) - a.growth * Math.sqrt(a.units))[0];
  if (top && top.growth > 5) {
    out.push({
      agentId: agentId("BUSINESS"),
      kind: "TOP_PRODUCT",
      severity: "SUCCESS",
      title: "Top Product",
      headline: top.title,
      whatHappened: `Sales increased ${top.growth.toFixed(0)}% compared with last week.`,
      whyItMatters: `It brought in ${money(top.revenue)} from ${top.units} units in the last 7 days.`,
      evidence: [
        { label: "Revenue (7d)", value: money(top.revenue) },
        { label: "Revenue (prev 7d)", value: money(top.previousRevenue) },
        { label: "Units (7d)", value: String(top.units) },
      ],
      suggestedAction: "Feature it in ads and keep stock healthy.",
      actionLabel: "View Product",
      actionHref: `/products/${top.id}`,
      relatedType: "product",
      relatedId: top.id,
    });
  }

  // ⚠ Inventory alert — most urgent selling variant
  const inv = await inventoryOverview(storeId);
  const urgent = inv.rows
    .flatMap((r) => r.variants.map((v) => ({ product: r, v })))
    .filter((x) => x.v.stock > 0 && x.v.coverage.coverageDays !== null && x.v.coverage.averageDailySales > 0)
    .sort((a, b) => (a.v.coverage.coverageDays ?? 0) - (b.v.coverage.coverageDays ?? 0))[0];
  if (urgent && (urgent.v.coverage.coverageDays ?? 99) < store.settings.inventory.coverageWarningDays * 2) {
    out.push({
      agentId: agentId("INVENTORY"),
      kind: "INVENTORY",
      severity: (urgent.v.coverage.coverageDays ?? 99) < 3 ? "CRITICAL" : "WARNING",
      title: "Inventory Alert",
      headline: `${urgent.product.title} ${urgent.v.title}`,
      whatHappened: `Only ${urgent.v.stock} units remaining.`,
      whyItMatters: `Selling ${urgent.v.coverage.averageDailySales}/day — about ${urgent.v.coverage.coverageDays} days of stock left.`,
      evidence: [
        { label: "Stock remaining", value: String(urgent.v.stock) },
        { label: "Average daily sales", value: String(urgent.v.coverage.averageDailySales) },
        { label: "Estimated coverage", value: `${urgent.v.coverage.coverageDays} days` },
        ...(urgent.v.coverage.velocityMultiplier ? [{ label: "Velocity vs 30-day avg", value: `${urgent.v.coverage.velocityMultiplier}×` }] : []),
      ],
      suggestedAction: urgent.v.reorder > 0 ? `Review replenishment (~${urgent.v.reorder} units for 30 days).` : "Review inventory replenishment.",
      actionLabel: "View Product",
      actionHref: `/products/${urgent.product.id}`,
      relatedType: "variant",
      relatedId: urgent.v.id,
    });
  }

  // 📈 Growth opportunity — cross-sell affinity
  const aff = await categoryAffinity(storeId);
  if (aff) {
    out.push({
      agentId: agentId("MARKETING"),
      kind: "OPPORTUNITY",
      severity: "INFO",
      title: "Growth Opportunity",
      headline: `${aff.aName} → ${aff.bName}`,
      whatHappened: `Customers who purchased ${aff.aName.toLowerCase()} have a ${Math.round(aff.lift * 100)}% higher probability of purchasing ${aff.bName.toLowerCase()}.`,
      whyItMatters: "Bundles and post-purchase recommendations can lift average order value.",
      evidence: [
        { label: `P(${aff.bName} | ${aff.aName})`, value: `${(aff.pBgivenA * 100).toFixed(0)}%` },
        { label: `P(${aff.bName}) overall`, value: `${(aff.pB * 100).toFixed(0)}%` },
        { label: "Customers analyzed", value: String(aff.support) },
      ],
      suggestedAction: `Recommend ${aff.bName.toLowerCase()} to recent ${aff.aName.toLowerCase()} buyers.`,
      actionLabel: "Open Marketing",
      actionHref: "/marketing",
    });
  }

  // 🚨 COD cancellation trend
  const now = Date.now();
  const window = (from: number, to: number) => ({ storeId, paymentMethod: "COD" as const, placedAt: { gte: new Date(from), lt: new Date(to) } });
  const [codNow, codCancelledNow, codPrev, codCancelledPrev] = await Promise.all([
    db.order.count({ where: window(now - 7 * 86_400_000, now) }),
    db.order.count({ where: { ...window(now - 7 * 86_400_000, now), status: "CANCELLED" } }),
    db.order.count({ where: window(now - 14 * 86_400_000, now - 7 * 86_400_000) }),
    db.order.count({ where: { ...window(now - 14 * 86_400_000, now - 7 * 86_400_000), status: "CANCELLED" } }),
  ]);
  const rateNow = codNow ? (codCancelledNow / codNow) * 100 : 0;
  const ratePrev = codPrev ? (codCancelledPrev / codPrev) * 100 : 0;
  if (codNow >= 10 && rateNow > ratePrev + 2) {
    out.push({
      agentId: agentId("ORDER"),
      kind: "ISSUE",
      severity: "WARNING",
      title: "Issue",
      headline: "COD cancellation rate increased",
      whatHappened: `${rateNow.toFixed(1)}% of COD orders were cancelled this week vs ${ratePrev.toFixed(1)}% last week.`,
      whyItMatters: "Each refused COD parcel costs two-way shipping and ties up stock.",
      evidence: [
        { label: "COD orders (7d)", value: String(codNow) },
        { label: "Cancelled (7d)", value: String(codCancelledNow) },
        { label: "Rate change", value: `${(rateNow - ratePrev).toFixed(1)} pts` },
      ],
      suggestedAction: "Make sure the COD confirmation automation is active and review high-risk orders.",
      actionLabel: "Review orders",
      actionHref: "/orders?tab=high_risk",
    });
  }

  // 💙 Repeat customer share
  const since = new Date(now - 7 * 86_400_000);
  const recent = await db.order.findMany({ where: { storeId, placedAt: { gte: since }, status: { not: "CANCELLED" } }, select: { total: true, customer: { select: { firstOrderAt: true } } } });
  const totalRev = recent.reduce((s, o) => s + o.total, 0);
  const repeatRev = recent.filter((o) => o.customer?.firstOrderAt && o.customer.firstOrderAt < since).reduce((s, o) => s + o.total, 0);
  if (totalRev > 0) {
    const share = (repeatRev / totalRev) * 100;
    out.push({
      agentId: agentId("BUSINESS"),
      kind: "CUSTOMER",
      severity: "SUCCESS",
      title: "Customer Loyalty",
      headline: "Repeat customers",
      whatHappened: `Repeat customers contributed ${share.toFixed(0)}% of revenue this week.`,
      whyItMatters: "Returning buyers cost nothing to acquire — they're your most profitable revenue.",
      evidence: [
        { label: "Repeat revenue (7d)", value: money(repeatRev) },
        { label: "Total revenue (7d)", value: money(totalRev) },
      ],
      suggestedAction: "Reward VIPs with early access to new collections.",
      actionLabel: "View VIP customers",
      actionHref: "/customers?segment=vip",
    });
  }

  await db.$transaction([
    db.aIInsight.deleteMany({ where: { storeId, kind: { in: ["TOP_PRODUCT", "OPPORTUNITY", "ISSUE", "CUSTOMER"] }, dismissedAt: null } }),
    db.aIInsight.deleteMany({ where: { storeId, kind: "INVENTORY", relatedId: urgent?.v.id ?? "__none__", dismissedAt: null } }),
    db.aIInsight.createMany({ data: out.map((i) => ({ ...i, storeId, evidence: i.evidence as Prisma.InputJsonValue })) }),
  ]);

  const ads = await runAdsAnalysis(storeId).catch(() => ({ insights: 0, decisions: 0 }));
  return { insights: out.length + ads.insights, decisions: ads.decisions };
}

/**
 * Latest insights, mixed across kinds (at most 2 of a kind) and without
 * repeats for the same subject, so one noisy analysis can't fill the feed.
 */
export async function listInsights(storeId: string, limit = 8) {
  const recent = await db.aIInsight.findMany({
    where: { storeId, dismissedAt: null },
    orderBy: [{ generatedAt: "desc" }],
    take: Math.max(40, limit * 5),
    include: { agent: { select: { name: true } } },
  });
  const seen = new Set<string>();
  const perKind = new Map<string, number>();
  const picked: typeof recent = [];
  for (const i of recent) {
    const key = `${i.kind}:${i.relatedId ?? i.headline}`;
    if (seen.has(key) || (perKind.get(i.kind) ?? 0) >= 2) continue;
    seen.add(key);
    perKind.set(i.kind, (perKind.get(i.kind) ?? 0) + 1);
    picked.push(i);
    if (picked.length >= limit) break;
  }
  return picked;
}

export async function dismissInsight(storeId: string, id: string) {
  await db.aIInsight.updateMany({ where: { id, storeId }, data: { dismissedAt: new Date() } });
}

export { percentChange };
