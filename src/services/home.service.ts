import type { Role } from "@/generated/prisma/enums";
import { AI_TEAM } from "@/lib/ai/team";
import { db } from "@/lib/db";
import { DAY_MS, startOfDayTz } from "@/lib/dates";
import { formatMoney, percentChange } from "@/lib/money";
import type { PriorityItem } from "@/lib/priority";
import { can } from "@/lib/rbac";
import { revenueDrivers } from "./analytics.service";
import { adsOverview } from "./meta.service";
import { breakEvenRoas } from "./priority.service";
import { getStore } from "./store.service";

const HOUR = 3_600_000;

/** "Today so far" vs the same time yesterday (store timezone). */
export async function todaySummary(storeId: string) {
  const store = await getStore(storeId);
  const now = new Date();
  const todayStart = startOfDayTz(now, store.timezone);
  const yStart = new Date(todayStart.getTime() - DAY_MS);
  const ySameTime = new Date(now.getTime() - DAY_MS);
  const [today, yesterday] = await Promise.all([
    db.order.aggregate({ where: { storeId, placedAt: { gte: todayStart, lte: now }, status: { not: "CANCELLED" } }, _sum: { total: true }, _count: { _all: true } }),
    db.order.aggregate({ where: { storeId, placedAt: { gte: yStart, lte: ySameTime }, status: { not: "CANCELLED" } }, _sum: { total: true }, _count: { _all: true } }),
  ]);
  const revenue = today._sum.total ?? 0;
  const prevRevenue = yesterday._sum.total ?? 0;
  return {
    orders: today._count._all,
    revenue,
    previousOrders: yesterday._count._all,
    previousRevenue: prevRevenue,
    change: prevRevenue ? percentChange(revenue, prevRevenue) : null,
  };
}

export type BriefingPoint = { tone: "success" | "warning" | "danger" | "info" | "ai"; text: string; href?: string };

/**
 * Morning briefing written from store data (no free-form generation, so it
 * can't invent numbers): yesterday's result and its biggest driver, what the
 * AI team did overnight, the top priority and the ads position.
 */
export async function morningBriefing(storeId: string, priorities: PriorityItem[], role: Role) {
  const store = await getStore(storeId);
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const since = new Date(Date.now() - 12 * HOUR);
  const [d, replies, confirmed, report] = await Promise.all([
    revenueDrivers(storeId, 1),
    db.aITask.count({ where: { storeId, type: "whatsapp.reply", status: "SUCCEEDED", createdAt: { gte: since } } }),
    db.orderEvent.count({ where: { storeId, type: "customer_confirmed", createdAt: { gte: since } } }),
    db.report.findFirst({ where: { storeId, type: "DAILY" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
  ]);

  const dir = d.previousRevenue ? (d.revenue >= d.previousRevenue ? "up" : "down") : null;
  const headline =
    d.orders === 0
      ? "No orders came in yesterday."
      : `Yesterday you sold ${money(d.revenue)} from ${d.orders} order${d.orders === 1 ? "" : "s"}` +
        (dir ? ` — ${dir} ${Math.abs(d.change).toFixed(0)}% on the day before.` : ".");

  const points: BriefingPoint[] = [];
  if (dir === "down" && Math.abs(d.change) >= 5) {
    const p = d.biggestProductDrops[0];
    const c = d.biggestCityDrops[0];
    if (p && (!c || Math.abs(p.delta) >= Math.abs(c.delta)))
      points.push({ tone: "warning", text: `The biggest drop was ${p.title} (${money(p.revenue)} vs ${money(p.previous)}).`, href: "/analytics" });
    else if (c) points.push({ tone: "warning", text: `Orders from ${c.city} fell the most (${money(c.revenue)} vs ${money(c.previous)}).`, href: "/analytics" });
  } else if (dir === "up" && d.biggestProductGains[0]) {
    const g = d.biggestProductGains[0];
    points.push({ tone: "success", text: `${g.title} led the growth with ${money(g.revenue)} in sales.`, href: "/products?sort=revenue" });
  }
  if (replies || confirmed) {
    const parts = [confirmed ? `${confirmed} COD order${confirmed === 1 ? " was" : "s were"} confirmed on WhatsApp` : null, replies ? `${replies} customer message${replies === 1 ? " was" : "s were"} answered` : null].filter(Boolean);
    points.push({ tone: "ai", text: `Overnight your AI team worked for you: ${parts.join(" and ")}.`, href: "/ai" });
  }
  const top = priorities[0];
  if (top) points.push({ tone: top.tone === "danger" ? "danger" : "warning", text: `Most important now: ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}${top.impactLabel ? ` (${top.impactLabel})` : ""}.` });
  if (can(role, "ads.view") && d.adSpend > 0) {
    const be = await breakEvenRoas(storeId);
    const ads = await adsOverview(storeId, { range: "7d" });
    const roas = ads.totals.roas;
    if (be.breakEven) {
      points.push(
        roas >= be.breakEven
          ? { tone: "success", text: `Ads returned ${roas.toFixed(2)}× over 7 days — above your ${be.breakEven.toFixed(2)}× break-even.`, href: "/marketing" }
          : { tone: "warning", text: `Ads returned ${roas.toFixed(2)}× over 7 days — below your ${be.breakEven.toFixed(2)}× break-even.`, href: "/marketing" },
      );
    }
  }
  return { headline, points: points.slice(0, 4), reportId: report?.id ?? null, date: d.date ?? null };
}

export type HealthStatus = "good" | "watch" | "act";
export type HealthArea = { key: string; label: string; status: HealthStatus; headline: string; detail: string; href: string };

/** Store health by area. Each status is a rule over one measured number, shown with it. */
export async function storeHealth(storeId: string, priorities: PriorityItem[], role: Role): Promise<HealthArea[]> {
  const store = await getStore(storeId);
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const now = Date.now();
  const week = new Date(now - 7 * DAY_MS);
  const quarter = new Date(now - 90 * DAY_MS);
  const byKey = new Map(priorities.map((p) => [p.key, p]));
  const areas: HealthArea[] = [];

  if (can(role, "orders.view")) {
    const [w, wc, q, qc] = await Promise.all([
      db.order.count({ where: { storeId, placedAt: { gte: week } } }),
      db.order.count({ where: { storeId, placedAt: { gte: week }, status: "CANCELLED" } }),
      db.order.count({ where: { storeId, placedAt: { gte: quarter } } }),
      db.order.count({ where: { storeId, placedAt: { gte: quarter }, status: "CANCELLED" } }),
    ]);
    const rate = w ? (wc / w) * 100 : 0;
    const base = q ? (qc / q) * 100 : 0;
    const risk = byKey.get("high_risk");
    const status: HealthStatus = rate > base * 1.5 && rate - base > 2 ? "act" : risk || byKey.get("late_dispatch") ? "watch" : "good";
    areas.push({
      key: "orders",
      label: "Orders",
      status,
      headline: `${rate.toFixed(1)}% cancelled this week`,
      detail: `Your 90-day average is ${base.toFixed(1)}%.${risk ? ` ${risk.count} high-risk to review.` : ""}`,
      href: "/orders?tab=attention",
    });
  }

  if (can(role, "conversations.view")) {
    const h = byKey.get("handoffs");
    const [aiOut, allOut] = await Promise.all([
      db.message.count({ where: { storeId, direction: "OUTBOUND", sender: "AI", createdAt: { gte: week } } }),
      db.message.count({ where: { storeId, direction: "OUTBOUND", sender: { in: ["AI", "AGENT"] }, createdAt: { gte: week } } }),
    ]);
    const share = allOut ? Math.round((aiOut / allOut) * 100) : null;
    areas.push({
      key: "inbox",
      label: "Customer service",
      status: !h ? "good" : h.factors.urgency >= 0.65 ? "act" : "watch",
      headline: h ? `${h.count} waiting for a person` : "No one is waiting",
      detail: share !== null ? `AI wrote ${share}% of replies this week.` : "No replies sent this week.",
      href: "/conversations",
    });
  }

  if (can(role, "inventory.view")) {
    const s = byKey.get("stock");
    areas.push({
      key: "inventory",
      label: "Inventory",
      status: !s ? "good" : s.tone === "danger" ? "act" : "watch",
      headline: s ? s.title : "Best-sellers are in stock",
      detail: s?.impactLabel ?? `No selling product runs out within ${store.settings.inventory.coverageWarningDays} days.`,
      href: "/inventory?status=critical",
    });
  }

  if (can(role, "ads.view")) {
    const [ads, be] = await Promise.all([adsOverview(storeId, { range: "7d" }), breakEvenRoas(storeId)]);
    if (ads.totals.spend > 0) {
      const roas = ads.totals.roas;
      const target = be.breakEven ?? 1;
      areas.push({
        key: "marketing",
        label: "Marketing",
        status: roas >= target * 1.3 ? "good" : roas >= target ? "watch" : "act",
        headline: `${roas.toFixed(2)}× return on ad spend`,
        detail: `${money(ads.totals.spend)} spent in 7 days · break-even is ${target.toFixed(2)}×.`,
        href: "/marketing",
      });
    } else {
      areas.push({ key: "marketing", label: "Marketing", status: "watch", headline: "No ad spend in 7 days", detail: "Connect Meta Ads to track return on spend.", href: "/integrations" });
    }
  }

  if (can(role, "automations.view")) {
    const [active, failed] = await Promise.all([
      db.automation.count({ where: { storeId, deletedAt: null, status: "ACTIVE" } }),
      db.automationRun.count({ where: { storeId, status: "FAILED", startedAt: { gte: week } } }),
    ]);
    areas.push({
      key: "automations",
      label: "Automations",
      status: failed ? "watch" : active ? "good" : "watch",
      headline: `${active} running`,
      detail: failed ? `${failed} failed run${failed === 1 ? "" : "s"} this week.` : active ? "No failures this week." : "Turn on a popular automation to save time.",
      href: failed ? "/automations?tab=runs&status=FAILED" : "/automations",
    });
  }
  return areas;
}

/** "Your AI Team" status: enabled, work done in 24 h, last activity, waiting approvals. */
export async function aiTeamOverview(storeId: string) {
  const since = new Date(Date.now() - DAY_MS);
  const [agents, tasks, pending] = await Promise.all([
    db.aIAgent.findMany({ where: { storeId }, select: { id: true, key: true, enabled: true, autonomy: true, lastActiveAt: true } }),
    db.aITask.groupBy({ by: ["agentId", "status"], where: { storeId, createdAt: { gte: since } }, _count: { _all: true } }),
    db.aIDecision.groupBy({ by: ["agentId"], where: { storeId, status: "PENDING_APPROVAL" }, _count: { _all: true } }),
  ]);
  return AI_TEAM.map((m) => {
    const mine = agents.filter((a) => m.agents.includes(a.key));
    const ids = new Set(mine.map((a) => a.id));
    const t = tasks.filter((x) => x.agentId && ids.has(x.agentId));
    const last = mine.map((a) => a.lastActiveAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
    return {
      key: m.key,
      name: m.name,
      role: m.role,
      icon: m.icon,
      href: m.href,
      agentKeys: m.agents,
      active: mine.some((a) => a.enabled),
      autonomy: mine.map((a) => a.autonomy),
      tasks24h: t.filter((x) => x.status === "SUCCEEDED").reduce((s, x) => s + x._count._all, 0),
      failed24h: t.filter((x) => x.status === "FAILED").reduce((s, x) => s + x._count._all, 0),
      pendingApprovals: pending.filter((p) => p.agentId && ids.has(p.agentId)).reduce((s, p) => s + p._count._all, 0),
      lastActiveAt: last ? new Date(last).toISOString() : null,
    };
  });
}
export type TeamOverview = Awaited<ReturnType<typeof aiTeamOverview>>;
