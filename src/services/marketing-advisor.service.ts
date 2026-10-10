import { db } from "@/lib/db";
import { DAY_MS, dayKey } from "@/lib/dates";
import { adviseCampaign, type Advice, type CampaignWindow } from "@/lib/marketing-advice";
import { formatMoney } from "@/lib/money";
import { breakEvenRoas } from "./priority.service";
import { getStore } from "./store.service";

const empty = (): CampaignWindow => ({ spend: 0, revenue: 0, purchases: 0, clicks: 0, impressions: 0 });

/**
 * One-screen marketing answer: what ads earned, what they cost, the best
 * campaign, and evidence-based advice per campaign (this week vs last week).
 */
export async function marketingSnapshot(storeId: string) {
  const store = await getStore(storeId);
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const tz = store.timezone;
  const now = Date.now();
  const d = (daysAgo: number) => new Date(dayKey(new Date(now - daysAgo * DAY_MS), tz));
  const [rows, campaigns, be, waCampaigns] = await Promise.all([
    db.adInsight.findMany({
      where: { storeId, level: "CAMPAIGN", date: { gte: d(13), lte: d(0) } },
      select: { entityId: true, date: true, spend: true, revenue: true, purchases: true, clicks: true, impressions: true },
    }),
    db.campaign.findMany({ where: { storeId, status: { not: "ARCHIVED" } }, select: { id: true, name: true, objective: true, status: true, dailyBudget: true } }),
    breakEvenRoas(storeId),
    db.marketingCampaign.findMany({ where: { storeId, status: "SENT", sentAt: { gte: new Date(now - 30 * DAY_MS) } }, select: { revenue: true, sentCount: true } }),
  ]);
  const split = d(6).getTime();
  const windows = new Map<string, { cur: CampaignWindow; prev: CampaignWindow }>();
  for (const r of rows) {
    const w = windows.get(r.entityId) ?? { cur: empty(), prev: empty() };
    const t = r.date.getTime() >= split ? w.cur : w.prev;
    t.spend += r.spend;
    t.revenue += r.revenue;
    t.purchases += r.purchases;
    t.clicks += r.clicks;
    t.impressions += r.impressions;
    windows.set(r.entityId, w);
  }
  const total = (k: "cur" | "prev") =>
    [...windows.values()].reduce(
      (a, w) => ({ spend: a.spend + w[k].spend, revenue: a.revenue + w[k].revenue, purchases: a.purchases + w[k].purchases }),
      { spend: 0, revenue: 0, purchases: 0 },
    );
  const cur = total("cur");
  const prev = total("prev");
  const breakEven = be.breakEven ?? 1;

  const advice = campaigns
    .map((c) => adviseCampaign({ ...c, ...(windows.get(c.id) ?? { cur: empty(), prev: empty() }) }, breakEven, money))
    .filter((a): a is Advice => !!a);
  const ORDER = { stop_loss: 0, fix_conversion: 1, fix_creative: 2, scale: 3, hold: 4, wait: 5, not_sales: 6 } as const;
  advice.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.spend - a.spend);

  const best = advice
    .filter((a) => a.kind === "scale" || a.kind === "hold")
    .sort((a, b) => b.roas - a.roas)[0] ?? null;

  return {
    breakEven,
    margin: be.margin,
    hasMarginData: be.breakEven !== null,
    week: { ...cur, roas: cur.spend ? cur.revenue / cur.spend : 0 },
    lastWeek: { ...prev, roas: prev.spend ? prev.revenue / prev.spend : 0 },
    whatsappRevenue30d: waCampaigns.reduce((s, c) => s + c.revenue, 0),
    best,
    needsAttention: advice.filter((a) => a.kind === "stop_loss" || a.kind === "fix_creative" || a.kind === "fix_conversion"),
    advice,
  };
}
export type MarketingSnapshot = Awaited<ReturnType<typeof marketingSnapshot>>;
