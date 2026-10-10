import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dayKey, resolveRange, startOfDayTz, type RangeQuery } from "@/lib/dates";
import { formatMoney, percentChange } from "@/lib/money";
import { dailySeries, serializeRange, topProductsWithGrowth, type DailyPoint } from "./analytics.service";
import { inventoryOverview } from "./inventory.service";
import { adsOverview } from "./meta.service";
import { notify } from "./notification.service";
import { getStore } from "./store.service";

export const REPORT_TYPES = [
  { key: "daily_sales", name: "Daily sales", description: "Revenue, orders and profit per day", category: "Sales" },
  { key: "weekly_sales", name: "Weekly sales", description: "Week-over-week performance", category: "Sales" },
  { key: "monthly_sales", name: "Monthly sales", description: "Month-over-month performance", category: "Sales" },
  { key: "product_performance", name: "Product performance", description: "Units, revenue and returns per product", category: "Catalog" },
  { key: "customer_performance", name: "Customer performance", description: "Top customers by revenue", category: "Customers" },
  { key: "marketing_performance", name: "Marketing performance", description: "WhatsApp campaigns and promotions", category: "Marketing" },
  { key: "ad_performance", name: "Ad performance", description: "Meta campaigns: spend, ROAS, CPA", category: "Marketing" },
  { key: "inventory", name: "Inventory report", description: "Stock, velocity and coverage per variant", category: "Catalog" },
  { key: "returns", name: "Returns report", description: "Returned orders and reasons", category: "Operations" },
  { key: "cod", name: "COD report", description: "Cash-on-delivery confirmation and collection", category: "Operations" },
] as const;

export type ReportKey = (typeof REPORT_TYPES)[number]["key"];
export const reportQuerySchema = z.object({
  type: z.enum(REPORT_TYPES.map((r) => r.key) as [ReportKey, ...ReportKey[]]),
  range: z.enum(["today", "7d", "30d", "90d", "custom"]).default("30d"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type ReportTable = {
  key: ReportKey;
  title: string;
  period: string;
  generatedAt: string;
  summary: { label: string; value: string }[];
  columns: string[];
  rows: (string | number)[][];
};

function groupSeries(points: DailyPoint[], keyFn: (date: string) => string) {
  const map = new Map<string, DailyPoint>();
  for (const p of points) {
    const k = keyFn(p.date);
    const cur = map.get(k);
    if (!cur) map.set(k, { ...p, date: k });
    else for (const f of Object.keys(p) as (keyof DailyPoint)[]) if (f !== "date") (cur[f] as number) += p[f] as number;
  }
  return [...map.values()];
}

function isoWeek(date: string) {
  const d = new Date(date + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function buildReport(storeId: string, q: z.infer<typeof reportQuerySchema>): Promise<ReportTable> {
  const store = await getStore(storeId);
  const m = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const range = resolveRange(q as Partial<RangeQuery>, store.timezone);
  const meta = REPORT_TYPES.find((r) => r.key === q.type)!;
  const base = { key: q.type, title: meta.name, period: `${dayKey(range.from, store.timezone)} → ${dayKey(range.to, store.timezone)}`, generatedAt: new Date().toISOString() };

  switch (q.type) {
    case "daily_sales":
    case "weekly_sales":
    case "monthly_sales": {
      const series = await dailySeries(storeId, range.from, range.to, store.timezone);
      const rows = q.type === "daily_sales" ? series : groupSeries(series, q.type === "weekly_sales" ? isoWeek : (d) => d.slice(0, 7));
      const tot = (k: keyof DailyPoint) => series.reduce((s, p) => s + (p[k] as number), 0);
      return {
        ...base,
        summary: [
          { label: "Revenue", value: m(tot("revenue")) },
          { label: "Orders", value: String(tot("orders")) },
          { label: "Confirmed", value: String(tot("confirmed")) },
          { label: "Cancelled", value: String(tot("cancelled")) },
          { label: "Ad spend", value: m(tot("adSpend")) },
          { label: "Profit", value: m(tot("profit")) },
        ],
        columns: [q.type === "daily_sales" ? "Date" : q.type === "weekly_sales" ? "Week" : "Month", "Orders", "Revenue", "Confirmed", "Cancelled", "Returns", "AOV", "Ad spend", "Profit"],
        rows: [...rows].reverse().map((p) => [p.date, p.orders, m(p.revenue), p.confirmed, p.cancelled, p.returns, m(p.orders - p.cancelled > 0 ? Math.round(p.revenue / (p.orders - p.cancelled)) : 0), m(p.adSpend), m(p.profit)]),
      };
    }
    case "product_performance": {
      const items = await db.orderItem.groupBy({
        by: ["productId"],
        where: { productId: { not: null }, order: { storeId, placedAt: { gte: range.from, lte: range.to }, status: { not: "CANCELLED" } } },
        _sum: { quantity: true, total: true },
      });
      const returned = await db.orderItem.groupBy({
        by: ["productId"],
        where: { productId: { not: null }, order: { storeId, placedAt: { gte: range.from, lte: range.to }, status: "RETURNED" } },
        _sum: { quantity: true },
      });
      const products = await db.product.findMany({ where: { id: { in: items.map((i) => i.productId!) } }, include: { category: true } });
      const rows = items
        .map((i) => {
          const p = products.find((x) => x.id === i.productId);
          const units = i._sum.quantity ?? 0;
          const ret = returned.find((r) => r.productId === i.productId)?._sum.quantity ?? 0;
          return { title: p?.title ?? "—", category: p?.category?.name ?? "—", units, revenue: i._sum.total ?? 0, returns: ret, stock: p?.totalInventory ?? 0 };
        })
        .sort((a, b) => b.revenue - a.revenue);
      return {
        ...base,
        summary: [
          { label: "Products sold", value: String(rows.length) },
          { label: "Units", value: String(rows.reduce((s, r) => s + r.units, 0)) },
          { label: "Revenue", value: m(rows.reduce((s, r) => s + r.revenue, 0)) },
        ],
        columns: ["Product", "Category", "Units", "Revenue", "Returns", "Return rate", "Stock"],
        rows: rows.map((r) => [r.title, r.category, r.units, m(r.revenue), r.returns, `${r.units ? ((r.returns / r.units) * 100).toFixed(1) : "0.0"}%`, r.stock]),
      };
    }
    case "customer_performance": {
      const grouped = await db.order.groupBy({
        by: ["customerId"],
        where: { storeId, customerId: { not: null }, placedAt: { gte: range.from, lte: range.to }, status: { not: "CANCELLED" } },
        _sum: { total: true },
        _count: { _all: true },
        _max: { placedAt: true },
        orderBy: { _sum: { total: "desc" } },
        take: 100,
      });
      const customers = await db.customer.findMany({ where: { id: { in: grouped.map((g) => g.customerId!) } } });
      return {
        ...base,
        summary: [
          { label: "Active customers", value: String(grouped.length) },
          { label: "Revenue", value: m(grouped.reduce((s, g) => s + (g._sum.total ?? 0), 0)) },
        ],
        columns: ["Customer", "City", "Orders", "Revenue", "AOV", "Last order", "Lifetime orders"],
        rows: grouped.map((g) => {
          const c = customers.find((x) => x.id === g.customerId);
          const rev = g._sum.total ?? 0;
          return [c?.name ?? "—", c?.city ?? "—", g._count._all, m(rev), m(Math.round(rev / g._count._all)), g._max.placedAt ? dayKey(g._max.placedAt, store.timezone) : "—", c?.totalOrders ?? 0];
        }),
      };
    }
    case "marketing_performance": {
      const campaigns = await db.marketingCampaign.findMany({ where: { storeId, createdAt: { gte: range.from, lte: range.to } }, include: { segment: true }, orderBy: { createdAt: "desc" } });
      return {
        ...base,
        summary: [
          { label: "Campaigns", value: String(campaigns.length) },
          { label: "Messages sent", value: String(campaigns.reduce((s, c) => s + c.sentCount, 0)) },
          { label: "Attributed revenue", value: m(campaigns.reduce((s, c) => s + c.revenue, 0)) },
        ],
        columns: ["Campaign", "Segment", "Status", "Audience", "Sent", "Delivered", "Read", "Conversions", "Revenue"],
        rows: campaigns.map((c) => [c.name, c.segment?.name ?? "—", c.status, c.audienceSize, c.sentCount, c.deliveredCount, c.readCount, c.conversions, m(c.revenue)]),
      };
    }
    case "ad_performance": {
      const ov = await adsOverview(storeId, q as Partial<RangeQuery>);
      return {
        ...base,
        summary: [
          { label: "Spend", value: m(ov.totals.spend) },
          { label: "Revenue", value: m(ov.totals.revenue) },
          { label: "ROAS", value: `${ov.totals.roas.toFixed(2)}×` },
          { label: "Purchases", value: String(ov.totals.purchases) },
          { label: "CPA", value: m(ov.totals.cpa) },
        ],
        columns: ["Campaign", "Status", "Spend", "Revenue", "ROAS", "Purchases", "CPA", "CTR", "CPC", "CPM"],
        rows: ov.campaigns.map((c) => [c.name, c.status, m(c.metrics.spend), m(c.metrics.revenue), `${c.metrics.roas.toFixed(2)}×`, c.metrics.purchases, m(c.metrics.cpa), `${c.metrics.ctr.toFixed(2)}%`, m(c.metrics.cpc), m(c.metrics.cpm)]),
      };
    }
    case "inventory": {
      const inv = await inventoryOverview(storeId);
      return {
        ...base,
        period: `As of ${dayKey(new Date(), store.timezone)}`,
        summary: [
          { label: "Products", value: String(inv.kpis.totalProducts) },
          { label: "Units in stock", value: String(inv.kpis.totalUnits) },
          { label: "Low stock variants", value: String(inv.kpis.lowStock) },
          { label: "Out of stock", value: String(inv.kpis.outOfStock) },
        ],
        columns: ["Product", "Variant", "SKU", "Stock", "Avg daily sales", "Coverage (days)", "Status", "Suggested reorder"],
        rows: inv.rows.flatMap((r) => r.variants.map((v) => [r.title, v.title, v.sku ?? "—", v.stock, v.coverage.averageDailySales, v.coverage.coverageDays ?? "—", v.coverage.status.replace(/_/g, " ").toLowerCase(), v.reorder])),
      };
    }
    case "returns": {
      const orders = await db.order.findMany({ where: { storeId, status: "RETURNED", placedAt: { gte: range.from, lte: range.to } }, include: { items: true, events: { where: { type: "returned" } } }, orderBy: { returnedAt: "desc" } });
      const totalOrders = await db.order.count({ where: { storeId, placedAt: { gte: range.from, lte: range.to } } });
      return {
        ...base,
        summary: [
          { label: "Returned orders", value: String(orders.length) },
          { label: "Return rate", value: `${totalOrders ? ((orders.length / totalOrders) * 100).toFixed(1) : "0.0"}%` },
          { label: "Returned value", value: m(orders.reduce((s, o) => s + o.total, 0)) },
        ],
        columns: ["Order", "Customer", "City", "Items", "Value", "Returned", "Reason"],
        rows: orders.map((o) => [o.name, o.customerName, o.city ?? "—", o.items.map((i) => `${i.title} ${i.variantTitle ?? ""}`.trim()).join("; "), m(o.total), o.returnedAt ? dayKey(o.returnedAt, store.timezone) : "—", o.events[0]?.description ?? "—"]),
      };
    }
    case "cod": {
      const cod = await db.order.groupBy({ by: ["city", "status"], where: { storeId, paymentMethod: "COD", placedAt: { gte: range.from, lte: range.to } }, _count: { _all: true }, _sum: { total: true } });
      const cities = [...new Set(cod.map((c) => c.city ?? "Unknown"))];
      const agg = (rows: typeof cod) => {
        const total = rows.reduce((s, r) => s + r._count._all, 0);
        const by = (s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count._all, 0);
        const collected = rows.filter((r) => r.status === "DELIVERED").reduce((n, r) => n + (r._sum.total ?? 0), 0);
        return { total, confirmed: by(["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "RETURNED"]), cancelled: by(["CANCELLED"]), delivered: by(["DELIVERED"]), returned: by(["RETURNED"]), collected };
      };
      const all = agg(cod);
      const pct = (a: number, b: number) => `${b ? ((a / b) * 100).toFixed(1) : "0.0"}%`;
      return {
        ...base,
        summary: [
          { label: "COD orders", value: String(all.total) },
          { label: "Confirmation rate", value: pct(all.confirmed, all.total) },
          { label: "Cancellation rate", value: pct(all.cancelled, all.total) },
          { label: "Cash collected", value: m(all.collected) },
        ],
        columns: ["City", "COD orders", "Confirmed", "Cancelled", "Delivered", "Returned", "Confirmation rate", "Cash collected"],
        rows: cities
          .map((city) => ({ city, ...agg(cod.filter((c) => (c.city ?? "Unknown") === city)) }))
          .sort((a, b) => b.total - a.total)
          .map((r) => [r.city, r.total, r.confirmed, r.cancelled, r.delivered, r.returned, pct(r.confirmed, r.total), m(r.collected)]),
      };
    }
  }
}

export function reportToCsv(r: ReportTable): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [r.columns.map(esc).join(","), ...r.rows.map((row) => row.map(esc).join(","))].join("\n");
}

/** Renders a clean A4-landscape PDF table with pdf-lib (no headless browser needed). */
export async function reportToPdf(r: ReportTable, storeName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36;
  // pdf-lib standard fonts are WinAnsi — strip characters they can't encode.
  const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, (c) => (c === "×" ? "x" : c === "→" ? "->" : c === "—" ? "-" : ""));
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const indigo = rgb(0.31, 0.27, 0.9);

  page.drawText(clean(`${storeName} · ${r.title}`), { x: M, y: y - 6, size: 16, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 26;
  page.drawText(clean(`${r.period}   ·   Generated ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC`), { x: M, y, size: 9, font, color: rgb(0.4, 0.45, 0.55) });
  y -= 24;
  let x = M;
  for (const s of r.summary) {
    page.drawText(clean(s.label.toUpperCase()), { x, y, size: 7, font, color: rgb(0.4, 0.45, 0.55) });
    page.drawText(clean(s.value), { x, y: y - 14, size: 11, font: bold, color: indigo });
    x += 128;
  }
  y -= 40;

  const colW = (W - 2 * M) / r.columns.length;
  const header = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 18, color: rgb(0.95, 0.95, 0.98) });
    r.columns.forEach((c, i) => page.drawText(clean(c).slice(0, 22), { x: M + i * colW + 4, y: y + 1, size: 8, font: bold, color: rgb(0.2, 0.23, 0.3) }));
    y -= 20;
  };
  header();
  for (const row of r.rows) {
    if (y < M + 20) {
      page = pdf.addPage([W, H]);
      y = H - M;
      header();
    }
    row.forEach((v, i) => {
      const text = clean(String(v));
      const maxChars = Math.floor(colW / 4.6);
      page.drawText(text.length > maxChars ? text.slice(0, maxChars - 1) + "…".replace("…", ".") : text, { x: M + i * colW + 4, y, size: 8, font, color: rgb(0.15, 0.17, 0.22) });
    });
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.93) });
    y -= 15;
  }
  return pdf.save();
}

// ───────────────────────── Daily AI report ─────────────────────────

export type DailyReportMetrics = {
  revenue: number;
  orders: number;
  confirmed: number;
  cancelled: number;
  delivered: number;
  adSpend: number;
  roas: number;
  profit: number;
  previous: { revenue: number; orders: number };
};

export async function generateDailyReport(storeId: string, date?: string) {
  const store = await getStore(storeId);
  const m = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const todayStart = startOfDayTz(new Date(), store.timezone);
  const dayStart = date ? startOfDayTz(new Date(date), store.timezone) : new Date(todayStart.getTime() - 86_400_000);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
  const prevStart = new Date(dayStart.getTime() - 86_400_000);

  const [[cur], [prev], delivered, top, inv] = await Promise.all([
    dailySeries(storeId, dayStart, dayEnd, store.timezone),
    dailySeries(storeId, prevStart, new Date(dayStart.getTime() - 1), store.timezone),
    db.order.count({ where: { storeId, deliveredAt: { gte: dayStart, lte: dayEnd } } }),
    topProductsWithGrowth(storeId, { range: "custom", from: dayKey(dayStart, store.timezone), to: dayKey(dayStart, store.timezone) }, 3),
    inventoryOverview(storeId),
  ]);
  const metrics: DailyReportMetrics = {
    revenue: cur?.revenue ?? 0,
    orders: cur?.orders ?? 0,
    confirmed: cur?.confirmed ?? 0,
    cancelled: cur?.cancelled ?? 0,
    delivered,
    adSpend: cur?.adSpend ?? 0,
    roas: cur?.adSpend ? cur.adRevenue / cur.adSpend : 0,
    profit: cur?.profit ?? 0,
    previous: { revenue: prev?.revenue ?? 0, orders: prev?.orders ?? 0 },
  };

  const insights: { icon: string; label: string; text: string; href?: string }[] = [];
  if (top[0]) insights.push({ icon: "🔥", label: "Best product", text: `${top[0].title} — ${top[0].units} units, ${m(top[0].revenue)}`, href: `/products/${top[0].id}` });
  const urgent = inv.rows.flatMap((r) => r.variants.map((v) => ({ r, v }))).filter((x) => x.v.stock > 0 && x.v.stock <= x.v.threshold).sort((a, b) => a.v.stock - b.v.stock)[0];
  if (urgent) insights.push({ icon: "⚠️", label: "Low stock", text: `${urgent.r.title} ${urgent.v.title} — ${urgent.v.stock} left`, href: `/products/${urgent.r.id}` });
  const cancelRate = metrics.orders ? (metrics.cancelled / metrics.orders) * 100 : 0;
  const prevCancelRate = prev?.orders ? (prev.cancelled / prev.orders) * 100 : 0;
  if (cancelRate > prevCancelRate + 2) insights.push({ icon: "🚨", label: "Issue", text: `Cancellation rate rose to ${cancelRate.toFixed(1)}% (from ${prevCancelRate.toFixed(1)}%).`, href: "/orders?tab=cancelled" });
  const repeat = await db.order.findMany({ where: { storeId, placedAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } }, select: { total: true, customer: { select: { firstOrderAt: true } } } });
  const repeatRev = repeat.filter((o) => o.customer?.firstOrderAt && o.customer.firstOrderAt < dayStart).reduce((s, o) => s + o.total, 0);
  if (metrics.revenue > 0) insights.push({ icon: "📈", label: "Opportunity", text: `Repeat customers contributed ${((repeatRev / metrics.revenue) * 100).toFixed(0)}% of revenue.`, href: "/customers?segment=returning" });
  const change = percentChange(metrics.revenue, metrics.previous.revenue);
  insights.unshift({ icon: change >= 0 ? "✅" : "📉", label: "Revenue", text: `${m(metrics.revenue)} (${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs previous day)` });

  const report = await db.report.upsert({
    where: { storeId_type_periodStart: { storeId, type: "DAILY", periodStart: dayStart } },
    create: { storeId, type: "DAILY", periodStart: dayStart, periodEnd: dayEnd, metrics: metrics as unknown as Prisma.InputJsonValue, insights: insights as unknown as Prisma.InputJsonValue },
    update: { metrics: metrics as unknown as Prisma.InputJsonValue, insights: insights as unknown as Prisma.InputJsonValue },
  });
  if (store.settings.notifications.alerts.dailyReport && !date) {
    await notify(storeId, { type: "AI", severity: "INFO", title: `Daily report · ${dayKey(dayStart, store.timezone)}`, body: `${m(metrics.revenue)} revenue from ${metrics.orders} orders.`, href: "/reports/daily", roles: ["OWNER", "ADMIN", "MANAGER"] });
  }
  return report;
}

export async function listDailyReports(storeId: string, limit = 14) {
  return db.report.findMany({ where: { storeId, type: "DAILY" }, orderBy: { periodStart: "desc" }, take: limit });
}

export { serializeRange };
