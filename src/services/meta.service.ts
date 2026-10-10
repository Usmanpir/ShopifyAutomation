import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { decryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { dayKey, eachDayKey, resolveRange, type RangeQuery } from "@/lib/dates";
import { badRequest, notFound } from "@/lib/errors";
import { publishEvent } from "@/lib/events/bus";
import { DemoAdsProvider, MetaGraphAdsProvider, type AdsProvider } from "@/lib/meta/ads";
import { formatMoney, percentChange } from "@/lib/money";
import type { ServiceContext } from "@/lib/service-context";
import { serializeRange } from "./analytics.service";
import { createDecision } from "./decision.service";
import { getStore } from "./store.service";

export type AdMetrics = {
  spend: number;
  revenue: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  leads: number;
  roas: number;
  cpa: number;
  cpc: number;
  ctr: number;
  cpm: number;
  conversionRate: number;
};

type InsightLike = { spend: number; revenue: number; impressions: number; reach: number; clicks: number; purchases: number; leads: number };

export function aggregate(rows: InsightLike[]): AdMetrics {
  const s = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      revenue: a.revenue + r.revenue,
      impressions: a.impressions + r.impressions,
      reach: a.reach + r.reach,
      clicks: a.clicks + r.clicks,
      purchases: a.purchases + r.purchases,
      leads: a.leads + r.leads,
    }),
    { spend: 0, revenue: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, leads: 0 },
  );
  return {
    ...s,
    roas: s.spend ? s.revenue / s.spend : 0,
    cpa: s.purchases ? Math.round(s.spend / s.purchases) : 0,
    cpc: s.clicks ? Math.round(s.spend / s.clicks) : 0,
    ctr: s.impressions ? (s.clicks / s.impressions) * 100 : 0,
    cpm: s.impressions ? Math.round((s.spend / s.impressions) * 1000) : 0,
    conversionRate: s.clicks ? (s.purchases / s.clicks) * 100 : 0,
  };
}

const dateOnly = (d: Date, tz: string) => new Date(dayKey(d, tz));

async function insights(storeId: string, level: "CAMPAIGN" | "ADSET" | "AD", from: Date, to: Date, tz: string, extra: Prisma.AdInsightWhereInput = {}) {
  return db.adInsight.findMany({
    where: { storeId, level, date: { gte: dateOnly(from, tz), lte: dateOnly(to, tz) }, ...extra },
  });
}

export async function adsOverview(storeId: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const range = resolveRange(q, store.timezone);
  const [cur, prev, campaigns, account] = await Promise.all([
    insights(storeId, "CAMPAIGN", range.from, range.to, store.timezone),
    insights(storeId, "CAMPAIGN", range.prevFrom, range.prevTo, store.timezone),
    db.campaign.findMany({ where: { storeId }, orderBy: { name: "asc" } }),
    db.metaAccount.findFirst({ where: { storeId } }),
  ]);
  const totals = aggregate(cur);
  const previous = aggregate(prev);
  const changes = Object.fromEntries((Object.keys(totals) as (keyof AdMetrics)[]).map((k) => [k, percentChange(totals[k], previous[k])])) as Record<keyof AdMetrics, number>;

  const days = eachDayKey(range.from, range.to, store.timezone);
  const byDay = new Map<string, InsightLike[]>();
  for (const r of cur) {
    const k = r.date.toISOString().slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  const series = days.map((date) => {
    const m = aggregate(byDay.get(date) ?? []);
    return { date, spend: m.spend, revenue: m.revenue, purchases: m.purchases, roas: Math.round(m.roas * 100) / 100, cpa: m.cpa, ctr: Math.round(m.ctr * 100) / 100 };
  });

  const campaignRows = campaigns
    .map((c) => ({ ...c, metrics: aggregate(cur.filter((r) => r.entityId === c.id)) }))
    .sort((a, b) => b.metrics.spend - a.metrics.spend);

  return { range: serializeRange(range), totals, previous, changes, series, campaigns: campaignRows, account };
}

export async function campaignDetail(storeId: string, id: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const range = resolveRange(q, store.timezone);
  const campaign = await db.campaign.findFirst({
    where: { id, storeId },
    include: { adSets: { orderBy: { name: "asc" } }, ads: { orderBy: { name: "asc" }, include: { adSet: { select: { name: true } } } } },
  });
  if (!campaign) throw notFound("Campaign");
  const [camp, prevCamp, adsets, ads] = await Promise.all([
    insights(storeId, "CAMPAIGN", range.from, range.to, store.timezone, { entityId: id }),
    insights(storeId, "CAMPAIGN", range.prevFrom, range.prevTo, store.timezone, { entityId: id }),
    insights(storeId, "ADSET", range.from, range.to, store.timezone, { campaignId: id }),
    insights(storeId, "AD", range.from, range.to, store.timezone, { campaignId: id }),
  ]);
  const totals = aggregate(camp);
  const previous = aggregate(prevCamp);
  const days = eachDayKey(range.from, range.to, store.timezone);
  const series = days.map((date) => {
    const m = aggregate(camp.filter((r) => r.date.toISOString().slice(0, 10) === date));
    return { date, spend: m.spend, revenue: m.revenue, purchases: m.purchases, roas: Math.round(m.roas * 100) / 100, ctr: Math.round(m.ctr * 100) / 100 };
  });
  return {
    range: serializeRange(range),
    campaign,
    totals,
    previous,
    changes: Object.fromEntries((Object.keys(totals) as (keyof AdMetrics)[]).map((k) => [k, percentChange(totals[k], previous[k])])),
    series,
    adSets: campaign.adSets.map((s) => ({ ...s, metrics: aggregate(adsets.filter((r) => r.entityId === s.id)) })),
    ads: campaign.ads.map((a) => ({ ...a, metrics: aggregate(ads.filter((r) => r.entityId === a.id)) })),
  };
}

export async function creativePerformance(storeId: string, q: Partial<RangeQuery>) {
  const store = await getStore(storeId);
  const range = resolveRange(q, store.timezone);
  const [ads, rows, uploads] = await Promise.all([
    db.ad.findMany({ where: { storeId }, include: { campaign: { select: { name: true } } } }),
    insights(storeId, "AD", range.from, range.to, store.timezone),
    db.creativeAsset.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const creatives = ads.map((a) => ({ ...a, metrics: aggregate(rows.filter((r) => r.entityId === a.id)) })).filter((a) => a.metrics.impressions > 0);
  const byType = (["IMAGE", "VIDEO", "CAROUSEL"] as const).map((type) => ({ type, metrics: aggregate(creatives.filter((c) => c.creativeType === type).map((c) => c.metrics)) }));
  return { range: serializeRange(range), creatives: creatives.sort((a, b) => b.metrics.revenue - a.metrics.revenue), byType, uploads };
}

// ───────────────────────── Mutations ─────────────────────────

export async function getAdsProvider(storeId: string): Promise<AdsProvider> {
  const [store, integration] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { demoMode: true } }),
    db.integration.findUnique({ where: { storeId_provider: { storeId, provider: "META_ADS" } } }),
  ]);
  if (store?.demoMode || integration?.status !== "CONNECTED" || !integration.credentialsEnc) return new DemoAdsProvider();
  const creds = decryptJson<{ accessToken: string }>(integration.credentialsEnc);
  return creds?.accessToken ? new MetaGraphAdsProvider(creds.accessToken) : new DemoAdsProvider();
}

export async function setCampaignStatus(ctx: ServiceContext, id: string, status: "ACTIVE" | "PAUSED") {
  const c = await db.campaign.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!c) throw notFound("Campaign");
  await (await getAdsProvider(ctx.storeId)).setCampaignStatus(c.externalId, status);
  const updated = await db.campaign.update({ where: { id }, data: { status } });
  await audit(ctx, { action: status === "PAUSED" ? "campaign.pause" : "campaign.activate", resourceType: "campaign", resourceId: id, resourceLabel: c.name, oldValue: { status: c.status }, newValue: { status } });
  await publishEvent(ctx.storeId, "CAMPAIGN_UPDATED", { title: `Campaign “${c.name}” ${status === "PAUSED" ? "paused" : "activated"}`, tone: "info", href: `/ads/campaigns/${id}`, payload: { campaignId: id } });
  return updated;
}

export async function changeCampaignBudget(ctx: ServiceContext, id: string, dailyBudget: number) {
  if (dailyBudget < 10000) throw badRequest("Daily budget must be at least 100 in major units");
  const c = await db.campaign.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!c) throw notFound("Campaign");
  await (await getAdsProvider(ctx.storeId)).setCampaignDailyBudget(c.externalId, dailyBudget);
  const updated = await db.campaign.update({ where: { id }, data: { dailyBudget } });
  await audit(ctx, { action: "campaign.budget_change", resourceType: "campaign", resourceId: id, resourceLabel: c.name, oldValue: { dailyBudget: c.dailyBudget }, newValue: { dailyBudget } });
  await publishEvent(ctx.storeId, "CAMPAIGN_UPDATED", { title: `Budget changed for “${c.name}”`, tone: "info", href: `/ads/campaigns/${id}`, payload: { campaignId: id } });
  return updated;
}

// ───────────────────────── Ads Analyst ─────────────────────────

/**
 * Evidence-based ad analysis. Every insight carries the numbers behind it,
 * and budget recommendations go to the Approval Center.
 */
export async function runAdsAnalysis(storeId: string) {
  const store = await getStore(storeId);
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const overview = await adsOverview(storeId, { range: "7d" });
  const active = overview.campaigns.filter((c) => c.metrics.spend > 0);
  if (!active.length) return { insights: 0, decisions: 0 };
  const agent = await db.aIAgent.findUnique({ where: { storeId_key: { storeId, key: "ADS" } } });
  let created = 0;
  let decisions = 0;

  // Share of purchases
  const totalPurchases = overview.totals.purchases || 1;
  const leader = [...active].sort((a, b) => b.metrics.purchases - a.metrics.purchases)[0];
  const share = Math.round((leader.metrics.purchases / totalPurchases) * 100);

  // Video vs static
  const creatives = await creativePerformance(storeId, { range: "7d" });
  const video = creatives.byType.find((t) => t.type === "VIDEO")!.metrics;
  const image = creatives.byType.find((t) => t.type === "IMAGE")!.metrics;
  const videoBetter = video.clicks > 0 && image.clicks > 0 && video.conversionRate > image.conversionRate * 1.1;

  await db.aIInsight.create({
    data: {
      storeId,
      agentId: agent?.id,
      kind: "CAMPAIGN",
      severity: "INFO",
      title: "AI Campaign Insight",
      headline: leader.name,
      whatHappened: `Your ${leader.name} campaign generated ${share}% of total purchases in the last 7 days.`,
      whyItMatters: videoBetter
        ? `Video creatives convert at ${video.conversionRate.toFixed(1)}% vs ${image.conversionRate.toFixed(1)}% for static images.`
        : `It returns ${leader.metrics.roas.toFixed(2)}× on ad spend versus ${overview.totals.roas.toFixed(2)}× account average.`,
      evidence: [
        { label: "Purchases", value: `${leader.metrics.purchases} of ${overview.totals.purchases}` },
        { label: "Spend", value: money(leader.metrics.spend) },
        { label: "Revenue", value: money(leader.metrics.revenue) },
        { label: "ROAS", value: `${leader.metrics.roas.toFixed(2)}×` },
        ...(videoBetter ? [{ label: "Video CVR vs Image CVR", value: `${video.conversionRate.toFixed(1)}% vs ${image.conversionRate.toFixed(1)}%` }] : []),
      ],
      suggestedAction: "Review budget allocation.",
      actionLabel: "Review Recommendation",
      actionHref: `/ads/campaigns/${leader.id}`,
      relatedType: "campaign",
      relatedId: leader.id,
    },
  });
  created++;

  // Budget reallocation: strong ROAS → +20%; weak ROAS with meaningful spend → pause suggestion.
  const avgRoas = overview.totals.roas;
  for (const c of active) {
    if (!c.dailyBudget || c.status !== "ACTIVE") continue;
    if (c.metrics.roas >= Math.max(3.5, avgRoas * 1.25) && c.metrics.purchases >= 5) {
      const newBudget = Math.round((c.dailyBudget * 1.2) / 10000) * 10000;
      await createDecision(storeId, {
        agentKey: "ADS",
        title: `Increase “${c.name}” budget by 20%`,
        summary: `${c.name} returned ${c.metrics.roas.toFixed(2)}× ROAS over 7 days, above the ${avgRoas.toFixed(2)}× account average.`,
        reasoning: "Scaling efficient campaigns gradually (≤20%) usually preserves performance while capturing more demand.",
        evidence: [
          { label: "7-day spend", value: money(c.metrics.spend) },
          { label: "7-day revenue", value: money(c.metrics.revenue) },
          { label: "ROAS", value: `${c.metrics.roas.toFixed(2)}×` },
          { label: "CPA", value: money(c.metrics.cpa) },
          { label: "Daily budget", value: `${money(c.dailyBudget)} → ${money(newBudget)}` },
        ],
        action: "changeCampaignBudget",
        actionInput: { campaignId: c.id, dailyBudget: newBudget },
        expectedImpact: `≈ ${money(Math.round(((newBudget - c.dailyBudget) * 7 * c.metrics.roas)))} extra weekly revenue if ROAS holds.`,
        riskLevel: "MEDIUM",
        requiresApproval: true,
        relatedType: "campaign",
        relatedId: c.id,
      });
      decisions++;
    } else if (c.objective === "OUTCOME_SALES" && c.metrics.spend > 1_000_000 && c.metrics.roas < 1.2) {
      await createDecision(storeId, {
        agentKey: "ADS",
        title: `Pause underperforming campaign “${c.name}”`,
        summary: `${c.name} spent ${money(c.metrics.spend)} in 7 days at ${c.metrics.roas.toFixed(2)}× ROAS.`,
        reasoning: "Below 1.2× ROAS the campaign likely loses money after product and delivery costs.",
        evidence: [
          { label: "7-day spend", value: money(c.metrics.spend) },
          { label: "7-day revenue", value: money(c.metrics.revenue) },
          { label: "ROAS", value: `${c.metrics.roas.toFixed(2)}×` },
          { label: "CTR", value: `${c.metrics.ctr.toFixed(2)}%` },
        ],
        action: "pauseCampaign",
        actionInput: { campaignId: c.id },
        expectedImpact: `Saves about ${money(Math.round(c.metrics.spend / 7))} per day.`,
        riskLevel: "MEDIUM",
        requiresApproval: true,
        relatedType: "campaign",
        relatedId: c.id,
      });
      decisions++;
    }
  }
  return { insights: created, decisions };
}

// ───────────────────────── Sync ─────────────────────────

/** Pulls campaign structure + daily insights from Meta (no-op in demo mode). */
export async function syncMetaAds(storeId: string, days = 7) {
  const provider = await getAdsProvider(storeId);
  if (provider.isDemo) return { synced: false, reason: "demo" };
  const account = await db.metaAccount.findFirst({ where: { storeId } });
  if (!account) return { synced: false, reason: "no_account" };
  const store = await getStore(storeId);
  const { campaigns, adSets, ads } = await provider.fetchStructure(account.adAccountId);

  const campaignIds = new Map<string, string>();
  for (const c of campaigns) {
    const row = await db.campaign.upsert({
      where: { storeId_externalId: { storeId, externalId: c.externalId } },
      create: { storeId, metaAccountId: account.id, ...c },
      update: { name: c.name, status: c.status, dailyBudget: c.dailyBudget, lifetimeBudget: c.lifetimeBudget, objective: c.objective },
    });
    campaignIds.set(c.externalId, row.id);
  }
  const adSetIds = new Map<string, string>();
  for (const s of adSets) {
    const campaignId = campaignIds.get(s.campaignExternalId);
    if (!campaignId) continue;
    const row = await db.adSet.upsert({
      where: { storeId_externalId: { storeId, externalId: s.externalId } },
      create: { storeId, campaignId, externalId: s.externalId, name: s.name, status: s.status, dailyBudget: s.dailyBudget, optimizationGoal: s.optimizationGoal, targeting: (s.targeting ?? undefined) as Prisma.InputJsonValue | undefined },
      update: { name: s.name, status: s.status, dailyBudget: s.dailyBudget },
    });
    adSetIds.set(s.externalId, row.id);
  }
  const adIds = new Map<string, string>();
  for (const a of ads) {
    const campaignId = campaignIds.get(a.campaignExternalId);
    const adSetId = adSetIds.get(a.adSetExternalId);
    if (!campaignId || !adSetId) continue;
    const { adSetExternalId: _s, campaignExternalId: _c, ...rest } = a;
    void _s;
    void _c;
    const row = await db.ad.upsert({
      where: { storeId_externalId: { storeId, externalId: a.externalId } },
      create: { storeId, campaignId, adSetId, ...rest },
      update: { name: a.name, status: a.status, thumbnailUrl: a.thumbnailUrl, headline: a.headline, primaryText: a.primaryText },
    });
    adIds.set(a.externalId, row.id);
  }

  const since = dayKey(new Date(Date.now() - days * 86_400_000), store.timezone);
  const until = dayKey(new Date(), store.timezone);
  const rows = await provider.fetchInsights(account.adAccountId, since, until);
  const roll = new Map<string, InsightLike & { level: "CAMPAIGN" | "ADSET" | "AD"; entityId: string; campaignId: string; date: string }>();
  const add = (level: "CAMPAIGN" | "ADSET" | "AD", entityId: string | undefined, campaignId: string | undefined, r: (typeof rows)[number]) => {
    if (!entityId || !campaignId) return;
    const key = `${level}:${entityId}:${r.date}`;
    const cur = roll.get(key) ?? { level, entityId, campaignId, date: r.date, spend: 0, revenue: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, leads: 0 };
    cur.spend += r.spend;
    cur.revenue += r.revenue;
    cur.impressions += r.impressions;
    cur.reach += r.reach;
    cur.clicks += r.clicks;
    cur.purchases += r.purchases;
    cur.leads += r.leads;
    roll.set(key, cur);
  };
  for (const r of rows) {
    const cid = campaignIds.get(r.campaignExternalId);
    add("AD", adIds.get(r.adExternalId), cid, r);
    add("ADSET", adSetIds.get(r.adSetExternalId), cid, r);
    add("CAMPAIGN", cid, cid, r);
  }
  for (const v of roll.values()) {
    const { level, entityId, campaignId, date, ...m } = v;
    await db.adInsight.upsert({
      where: { storeId_level_entityId_date: { storeId, level, entityId, date: new Date(date) } },
      create: { storeId, level, entityId, campaignId, date: new Date(date), ...m },
      update: m,
    });
  }
  await db.metaAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date() } });
  await db.integration.updateMany({ where: { storeId, provider: "META_ADS" }, data: { lastSyncAt: new Date(), lastError: null } });
  return { synced: true, campaigns: campaigns.length, insights: roll.size };
}

// ───────────────────────── Social ─────────────────────────

export async function socialOverview(storeId: string) {
  const [account, leads, comments, conversations, leadCount, unanswered] = await Promise.all([
    db.metaAccount.findFirst({ where: { storeId } }),
    db.metaLead.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.socialComment.findMany({ where: { storeId, hidden: false }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.conversation.groupBy({ by: ["channel"], where: { storeId, channel: { in: ["FACEBOOK", "INSTAGRAM"] } }, _count: { _all: true }, _sum: { unreadCount: true } }),
    db.metaLead.count({ where: { storeId, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    db.socialComment.count({ where: { storeId, replied: false, hidden: false } }),
  ]);
  return { account, leads, comments, conversations, leadCount7d: leadCount, unansweredComments: unanswered };
}

export const commentReplySchema = z.object({ text: z.string().trim().min(1).max(1000) });

export async function replyToComment(ctx: ServiceContext, id: string, text: string) {
  const c = await db.socialComment.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!c) throw notFound("Comment");
  // In connected mode this would POST /{comment-id}/comments (FB) or /{ig-comment-id}/replies (IG).
  const updated = await db.socialComment.update({ where: { id }, data: { replied: true, replyBody: text } });
  await audit(ctx, { action: "social.comment_reply", resourceType: "social_comment", resourceId: id, resourceLabel: c.authorName, newValue: { text } });
  return updated;
}

export const leadUpdateSchema = z.object({ status: z.enum(["NEW", "CONTACTED", "CONVERTED", "LOST"]) });

export async function updateLead(ctx: ServiceContext, id: string, status: string) {
  const lead = await db.metaLead.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!lead) throw notFound("Lead");
  const updated = await db.metaLead.update({ where: { id }, data: { status } });
  await audit(ctx, { action: "lead.update", resourceType: "lead", resourceId: id, resourceLabel: lead.name, oldValue: { status: lead.status }, newValue: { status } });
  return updated;
}

// ───────────────────────── AI Ad Analyst feed (UI) ─────────────────────────

/** Latest campaign insight + ADS-agent recommendations for the Ads page. */
export async function adsAnalystFeed(storeId: string) {
  const [insight, pending, recent] = await Promise.all([
    db.aIInsight.findFirst({ where: { storeId, kind: "CAMPAIGN", dismissedAt: null }, orderBy: { generatedAt: "desc" }, include: { agent: { select: { name: true } } } }),
    db.aIDecision.findMany({
      where: { storeId, status: "PENDING_APPROVAL", agent: { key: "ADS" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { agent: { select: { name: true } } },
    }),
    db.aIDecision.findMany({
      where: { storeId, status: { not: "PENDING_APPROVAL" }, agent: { key: "ADS" } },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, title: true, status: true, updatedAt: true },
    }),
  ]);
  return { insight, pending, recent };
}

/** Pending ADS-agent recommendations about one campaign. */
export async function campaignRecommendations(storeId: string, campaignId: string) {
  return db.aIDecision.findMany({
    where: { storeId, relatedType: "campaign", relatedId: campaignId, agent: { key: "ADS" } },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { agent: { select: { name: true } } },
  });
}

/** Connected ad account (header info: name, id, last sync). */
export async function getMetaAccount(storeId: string) {
  return db.metaAccount.findFirst({ where: { storeId } });
}
