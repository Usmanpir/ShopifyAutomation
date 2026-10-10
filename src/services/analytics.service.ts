import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dayKey, eachDayKey, resolveRange, type RangeQuery, type ResolvedRange } from "@/lib/dates";
import { percentChange } from "@/lib/money";
import { getStore } from "./store.service";

export type DailyPoint = {
  date: string;
  revenue: number;
  orders: number;
  confirmed: number;
  cancelled: number;
  returns: number;
  returnValue: number;
  cogs: number;
  adSpend: number;
  adRevenue: number;
  purchases: number;
  sessions: number;
  profit: number;
};

type Row = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "bigint" ? Number(v) : Number(v ?? 0));

/** One row per day in the store timezone with sales, cost, ads and traffic. */
export async function dailySeries(storeId: string, from: Date, to: Date, timeZone: string): Promise<DailyPoint[]> {
  const [orders, cogs, ads, traffic] = await Promise.all([
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT to_char(("placedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
        COUNT(*) AS orders,
        COALESCE(SUM(total) FILTER (WHERE status <> 'CANCELLED'), 0) AS revenue,
        COUNT(*) FILTER (WHERE "confirmedAt" IS NOT NULL) AS confirmed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
        COUNT(*) FILTER (WHERE status = 'RETURNED') AS returns,
        COALESCE(SUM(total) FILTER (WHERE status = 'RETURNED'), 0) AS return_value
      FROM "Order"
      WHERE "storeId" = ${storeId} AND "placedAt" BETWEEN ${from} AND ${to}
      GROUP BY 1`),
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT to_char((o."placedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(COALESCE(i."unitCost", i."unitPrice" * 45 / 100) * i.quantity), 0) AS cogs
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      WHERE o."storeId" = ${storeId} AND o."placedAt" BETWEEN ${from} AND ${to} AND o.status NOT IN ('CANCELLED', 'RETURNED')
      GROUP BY 1`),
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT to_char(date, 'YYYY-MM-DD') AS day, SUM(spend) AS spend, SUM(revenue) AS revenue, SUM(purchases) AS purchases
      FROM "AdInsight"
      WHERE "storeId" = ${storeId} AND level = 'CAMPAIGN' AND date BETWEEN ${dayKey(from, timeZone)}::date AND ${dayKey(to, timeZone)}::date
      GROUP BY 1`),
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT to_char(date, 'YYYY-MM-DD') AS day, SUM(sessions) AS sessions
      FROM "StoreDailyMetric"
      WHERE "storeId" = ${storeId} AND date BETWEEN ${dayKey(from, timeZone)}::date AND ${dayKey(to, timeZone)}::date
      GROUP BY 1`),
  ]);

  const byDay = (rows: Row[]) => new Map(rows.map((r) => [String(r.day), r]));
  const o = byDay(orders), c = byDay(cogs), a = byDay(ads), t = byDay(traffic);
  return eachDayKey(from, to, timeZone).map((date) => {
    const orow = o.get(date) ?? {};
    const revenue = n(orow.revenue);
    const cost = n(c.get(date)?.cogs);
    const spend = n(a.get(date)?.spend);
    return {
      date,
      revenue,
      orders: n(orow.orders),
      confirmed: n(orow.confirmed),
      cancelled: n(orow.cancelled),
      returns: n(orow.returns),
      returnValue: n(orow.return_value),
      cogs: cost,
      adSpend: spend,
      adRevenue: n(a.get(date)?.revenue),
      purchases: n(a.get(date)?.purchases),
      sessions: n(t.get(date)?.sessions),
      profit: revenue - n(orow.return_value) - cost - spend,
    };
  });
}

function sum(points: DailyPoint[], key: keyof Omit<DailyPoint, "date">) {
  return points.reduce((s, p) => s + p[key], 0);
}

export type Kpi = {
  key: string;
  label: string;
  value: number;
  previous: number;
  change: number;
  format: "money" | "number" | "percent" | "ratio";
  /** For KPIs where lower is better (returns, cancellations) the UI flips colours. */
  invert?: boolean;
  spark: number[];
};

export async function dashboardKpis(storeId: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const range = resolveRange(q, store.timezone);
  const [cur, prev] = await Promise.all([
    dailySeries(storeId, range.from, range.to, store.timezone),
    dailySeries(storeId, range.prevFrom, range.prevTo, store.timezone),
  ]);
  const conv = (pts: DailyPoint[]) => {
    const s = sum(pts, "sessions");
    return s ? (sum(pts, "orders") / s) * 100 : 0;
  };
  const roas = (pts: DailyPoint[]) => {
    const s = sum(pts, "adSpend");
    return s ? sum(pts, "adRevenue") / s : 0;
  };
  const make = (key: string, label: string, format: Kpi["format"], f: (p: DailyPoint[]) => number, spark: (p: DailyPoint) => number, invert = false): Kpi => {
    const value = f(cur);
    const previous = f(prev);
    return { key, label, value, previous, change: percentChange(value, previous), format, invert, spark: cur.map(spark) };
  };
  const kpis: Kpi[] = [
    make("revenue", "Revenue", "money", (p) => sum(p, "revenue"), (p) => p.revenue),
    make("orders", "Orders", "number", (p) => sum(p, "orders"), (p) => p.orders),
    make("confirmed", "Confirmed Orders", "number", (p) => sum(p, "confirmed"), (p) => p.confirmed),
    make("conversion", "Conversion Rate", "percent", conv, (p) => (p.sessions ? (p.orders / p.sessions) * 100 : 0)),
    make("adSpend", "Ad Spend", "money", (p) => sum(p, "adSpend"), (p) => p.adSpend, true),
    make("roas", "ROAS", "ratio", roas, (p) => (p.adSpend ? p.adRevenue / p.adSpend : 0)),
    make("profit", "Profit", "money", (p) => sum(p, "profit"), (p) => p.profit),
    make("returns", "Returns", "number", (p) => sum(p, "returns"), (p) => p.returns, true),
  ];
  return { range: serializeRange(range), kpis, series: cur };
}

export function serializeRange(r: ResolvedRange) {
  return { ...r, from: r.from.toISOString(), to: r.to.toISOString(), prevFrom: r.prevFrom.toISOString(), prevTo: r.prevTo.toISOString() };
}

export async function revenueSeries(storeId: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const range = resolveRange(q, store.timezone);
  return { range: serializeRange(range), series: await dailySeries(storeId, range.from, range.to, store.timezone) };
}

export async function topProducts(storeId: string, from: Date, to: Date, limit = 5) {
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT i."productId" AS id, MAX(i.title) AS title, MAX(i."imageUrl") AS image,
      SUM(i.quantity) AS units, SUM(i.total) AS revenue
    FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    WHERE o."storeId" = ${storeId} AND o."placedAt" BETWEEN ${from} AND ${to} AND o.status <> 'CANCELLED' AND i."productId" IS NOT NULL
    GROUP BY i."productId" ORDER BY revenue DESC LIMIT ${limit}`);
  return rows.map((r) => ({ id: String(r.id), title: String(r.title), imageUrl: (r.image as string) ?? null, units: n(r.units), revenue: n(r.revenue) }));
}

/** Top products with growth vs the previous equal period. */
export async function topProductsWithGrowth(storeId: string, q: Partial<RangeQuery>, limit = 5) {
  const store = await getStore(storeId);
  const range = resolveRange(q, store.timezone);
  const [cur, prev] = await Promise.all([
    topProducts(storeId, range.from, range.to, 50),
    topProducts(storeId, range.prevFrom, range.prevTo, 200),
  ]);
  return cur.slice(0, limit).map((p) => {
    const before = prev.find((x) => x.id === p.id);
    return { ...p, previousRevenue: before?.revenue ?? 0, previousUnits: before?.units ?? 0, growth: percentChange(p.revenue, before?.revenue ?? 0) };
  });
}

export async function salesBreakdowns(storeId: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const range = resolveRange(q, store.timezone);
  const where = { storeId, placedAt: { gte: range.from, lte: range.to } };
  const [cities, payments, statuses, categories] = await Promise.all([
    db.order.groupBy({ by: ["city"], where: { ...where, status: { not: "CANCELLED" } }, _sum: { total: true }, _count: { _all: true }, orderBy: { _sum: { total: "desc" } }, take: 8 }),
    db.order.groupBy({ by: ["paymentMethod"], where, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT COALESCE(c.name, 'Other') AS name, SUM(i.total) AS revenue, SUM(i.quantity) AS units
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      LEFT JOIN "Product" p ON p.id = i."productId" LEFT JOIN "ProductCategory" c ON c.id = p."categoryId"
      WHERE o."storeId" = ${storeId} AND o."placedAt" BETWEEN ${range.from} AND ${range.to} AND o.status <> 'CANCELLED'
      GROUP BY 1 ORDER BY revenue DESC`),
  ]);
  return {
    range: serializeRange(range),
    cities: cities.map((c) => ({ city: c.city ?? "Unknown", revenue: c._sum.total ?? 0, orders: c._count._all })),
    payments: payments.map((p) => ({ method: p.paymentMethod, revenue: p._sum.total ?? 0, orders: p._count._all })),
    statuses: statuses.map((s) => ({ status: s.status, orders: s._count._all })),
    categories: categories.map((c) => ({ name: String(c.name), revenue: n(c.revenue), units: n(c.units) })),
  };
}

/**
 * Explains a day's revenue vs the previous day: decomposes the change by
 * product, city and ads so the assistant can answer "why did revenue drop?".
 */
export async function revenueDrivers(storeId: string, daysAgo = 1) {
  const store = await getStore(storeId);
  const tz = store.timezone;
  const { startOfDayTz } = await import("@/lib/dates");
  const todayStart = startOfDayTz(new Date(), tz);
  const dayStart = new Date(todayStart.getTime() - daysAgo * 86_400_000);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
  const prevStart = new Date(dayStart.getTime() - 86_400_000);
  const prevEnd = new Date(dayStart.getTime() - 1);
  const weekAgoStart = new Date(dayStart.getTime() - 7 * 86_400_000);
  const weekAgoEnd = new Date(weekAgoStart.getTime() + 86_400_000 - 1);

  const [day, prev, weekAgo, dayProducts, prevProducts, dayCities, prevCities] = await Promise.all([
    dailySeries(storeId, dayStart, dayEnd, tz),
    dailySeries(storeId, prevStart, prevEnd, tz),
    dailySeries(storeId, weekAgoStart, weekAgoEnd, tz),
    topProducts(storeId, dayStart, dayEnd, 100),
    topProducts(storeId, prevStart, prevEnd, 100),
    db.order.groupBy({ by: ["city"], where: { storeId, placedAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } }, _sum: { total: true } }),
    db.order.groupBy({ by: ["city"], where: { storeId, placedAt: { gte: prevStart, lte: prevEnd }, status: { not: "CANCELLED" } }, _sum: { total: true } }),
  ]);
  const d = day[0], p = prev[0], w = weekAgo[0];
  const productDeltas = [...new Set([...dayProducts, ...prevProducts].map((x) => x.id))]
    .map((id) => {
      const a = dayProducts.find((x) => x.id === id);
      const b = prevProducts.find((x) => x.id === id);
      return { title: a?.title ?? b?.title ?? "", revenue: a?.revenue ?? 0, previous: b?.revenue ?? 0, delta: (a?.revenue ?? 0) - (b?.revenue ?? 0) };
    })
    .sort((x, y) => x.delta - y.delta);
  const cityDeltas = [...new Set([...dayCities, ...prevCities].map((c) => c.city ?? "Unknown"))]
    .map((city) => {
      const a = dayCities.find((c) => (c.city ?? "Unknown") === city)?._sum.total ?? 0;
      const b = prevCities.find((c) => (c.city ?? "Unknown") === city)?._sum.total ?? 0;
      return { city, revenue: a, previous: b, delta: a - b };
    })
    .sort((x, y) => x.delta - y.delta);
  return {
    date: d?.date,
    revenue: d?.revenue ?? 0,
    previousRevenue: p?.revenue ?? 0,
    sameDayLastWeek: w?.revenue ?? 0,
    change: percentChange(d?.revenue ?? 0, p?.revenue ?? 0),
    orders: d?.orders ?? 0,
    previousOrders: p?.orders ?? 0,
    cancelled: d?.cancelled ?? 0,
    previousCancelled: p?.cancelled ?? 0,
    aov: d?.orders ? Math.round(d.revenue / Math.max(1, d.orders - d.cancelled)) : 0,
    previousAov: p?.orders ? Math.round(p.revenue / Math.max(1, p.orders - p.cancelled)) : 0,
    adSpend: d?.adSpend ?? 0,
    previousAdSpend: p?.adSpend ?? 0,
    sessions: d?.sessions ?? 0,
    previousSessions: p?.sessions ?? 0,
    biggestProductDrops: productDeltas.filter((x) => x.delta < 0).slice(0, 3),
    biggestProductGains: productDeltas.filter((x) => x.delta > 0).reverse().slice(0, 3),
    biggestCityDrops: cityDeltas.filter((x) => x.delta < 0).slice(0, 3),
  };
}

/** "What needs attention?" — counts that drive the dashboard's action list. */
export async function attentionItems(storeId: string) {
  const [pendingConfirmation, highRisk, pendingApprovals, handoffs, failedRuns, lowStock, openTickets] = await Promise.all([
    db.order.count({ where: { storeId, status: "PENDING_CONFIRMATION" } }),
    db.order.count({ where: { storeId, riskLevel: "HIGH", status: { in: ["NEW", "PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING"] } } }),
    db.aIDecision.count({ where: { storeId, status: "PENDING_APPROVAL" } }),
    db.conversation.count({ where: { storeId, needsAttention: true, status: { in: ["OPEN", "PENDING"] } } }),
    db.automationRun.count({ where: { storeId, status: "FAILED", startedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    db.productVariant.count({ where: { storeId, inventoryQuantity: { lte: 10 }, product: { status: "ACTIVE", deletedAt: null } } }),
    db.supportTicket.count({ where: { storeId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);
  return [
    { key: "approvals", label: "AI actions awaiting approval", count: pendingApprovals, href: "/approvals", tone: "ai" },
    { key: "handoffs", label: "Conversations need a human", count: handoffs, href: "/conversations?filter=attention", tone: "warning" },
    { key: "pending", label: "COD orders awaiting confirmation", count: pendingConfirmation, href: "/orders?tab=pending_confirmation", tone: "info" },
    { key: "risk", label: "High-risk orders to review", count: highRisk, href: "/orders?tab=high_risk", tone: "danger" },
    { key: "stock", label: "Variants low or out of stock", count: lowStock, href: "/inventory?status=low", tone: "warning" },
    { key: "tickets", label: "Open support tickets", count: openTickets, href: "/conversations?view=tickets", tone: "info" },
    { key: "automations", label: "Failed automation runs (7d)", count: failedRuns, href: "/automations?tab=runs", tone: "danger" },
  ] as const;
}

// ───────────────────────── Analytics page ─────────────────────────

export type FunnelStep = { key: "sessions" | "addToCarts" | "checkouts" | "orders"; label: string; value: number; previous: number; stepRate: number | null; overallRate: number };

/** Sessions → add to carts → checkouts → orders, with step conversion vs the previous step. */
export async function conversionFunnel(storeId: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const tz = store.timezone;
  const range = resolveRange(q, tz);
  const traffic = (from: Date, to: Date) =>
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT COALESCE(SUM(sessions), 0) AS sessions, COALESCE(SUM("addToCarts"), 0) AS carts, COALESCE(SUM(checkouts), 0) AS checkouts
      FROM "StoreDailyMetric"
      WHERE "storeId" = ${storeId} AND date BETWEEN ${dayKey(from, tz)}::date AND ${dayKey(to, tz)}::date`);
  const [[cur], [prev], orders, prevOrders] = await Promise.all([
    traffic(range.from, range.to),
    traffic(range.prevFrom, range.prevTo),
    db.order.count({ where: { storeId, placedAt: { gte: range.from, lte: range.to } } }),
    db.order.count({ where: { storeId, placedAt: { gte: range.prevFrom, lte: range.prevTo } } }),
  ]);
  const raw = [
    { key: "sessions" as const, label: "Sessions", value: n(cur?.sessions), previous: n(prev?.sessions) },
    { key: "addToCarts" as const, label: "Added to cart", value: n(cur?.carts), previous: n(prev?.carts) },
    { key: "checkouts" as const, label: "Reached checkout", value: n(cur?.checkouts), previous: n(prev?.checkouts) },
    { key: "orders" as const, label: "Placed order", value: orders, previous: prevOrders },
  ];
  const top = raw[0].value;
  const steps: FunnelStep[] = raw.map((s, i) => ({
    ...s,
    stepRate: i === 0 ? null : raw[i - 1].value ? (s.value / raw[i - 1].value) * 100 : 0,
    overallRate: top ? (s.value / top) * 100 : 0,
  }));
  const conversion = top ? (orders / top) * 100 : 0;
  const prevConversion = raw[0].previous ? (prevOrders / raw[0].previous) * 100 : 0;
  return { range: serializeRange(range), steps, conversion, prevConversion };
}

/**
 * New vs returning customers. An order is "returning" when the customer had
 * already ordered before it (customer.firstOrderAt earlier than this order).
 */
export async function customerMix(storeId: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const range = resolveRange(q, store.timezone);
  const query = (from: Date, to: Date) =>
    db.$queryRaw<Row[]>(Prisma.sql`
      SELECT CASE WHEN c."firstOrderAt" IS NOT NULL AND c."firstOrderAt" < o."placedAt" - interval '1 minute' THEN 'returning' ELSE 'new' END AS kind,
        COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS revenue, COUNT(DISTINCT COALESCE(o."customerId", o.id)) AS customers
      FROM "Order" o LEFT JOIN "Customer" c ON c.id = o."customerId"
      WHERE o."storeId" = ${storeId} AND o."placedAt" BETWEEN ${from} AND ${to} AND o.status <> 'CANCELLED'
      GROUP BY 1`);
  const [cur, prev] = await Promise.all([query(range.from, range.to), query(range.prevFrom, range.prevTo)]);
  const pick = (rows: Row[], kind: string) => {
    const r = rows.find((x) => x.kind === kind);
    return { orders: n(r?.orders), revenue: n(r?.revenue), customers: n(r?.customers) };
  };
  const make = (kind: "new" | "returning") => {
    const c = pick(cur, kind);
    const p = pick(prev, kind);
    return { ...c, aov: c.orders ? Math.round(c.revenue / c.orders) : 0, previousRevenue: p.revenue, change: percentChange(c.revenue, p.revenue) };
  };
  return { range: serializeRange(range), new: make("new"), returning: make("returning") };
}

/** Orders by weekday (Mon=0) × hour of day in the store timezone. */
export async function orderHeatmap(storeId: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const tz = store.timezone;
  const range = resolveRange(q, tz);
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT EXTRACT(ISODOW FROM (("placedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS dow,
      EXTRACT(HOUR FROM (("placedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS hour,
      COUNT(*) AS orders
    FROM "Order"
    WHERE "storeId" = ${storeId} AND "placedAt" BETWEEN ${range.from} AND ${range.to}
    GROUP BY 1, 2`);
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const r of rows) grid[n(r.dow) - 1]![n(r.hour)] = n(r.orders);
  return { range: serializeRange(range), grid };
}
