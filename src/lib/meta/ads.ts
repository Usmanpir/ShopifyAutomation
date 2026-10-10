import { toMinor } from "@/lib/money";
import { graphPaginate, graphRequest } from "./graph";

export type RemoteCampaign = {
  externalId: string;
  name: string;
  objective: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  startDate: Date | null;
  endDate: Date | null;
};
export type RemoteAdSet = {
  externalId: string;
  campaignExternalId: string;
  name: string;
  status: RemoteCampaign["status"];
  dailyBudget: number | null;
  optimizationGoal: string | null;
  targeting: unknown;
};
export type RemoteAd = {
  externalId: string;
  adSetExternalId: string;
  campaignExternalId: string;
  name: string;
  status: RemoteCampaign["status"];
  creativeType: "IMAGE" | "VIDEO" | "CAROUSEL";
  thumbnailUrl: string | null;
  headline: string | null;
  primaryText: string | null;
  callToAction: string | null;
};
export type RemoteInsight = {
  adExternalId: string;
  adSetExternalId: string;
  campaignExternalId: string;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  revenue: number;
  leads: number;
};

/** Ads provider abstraction: Graph API today, swappable as Meta's API evolves. */
export interface AdsProvider {
  readonly isDemo: boolean;
  fetchStructure(adAccountId: string): Promise<{ campaigns: RemoteCampaign[]; adSets: RemoteAdSet[]; ads: RemoteAd[] }>;
  fetchInsights(adAccountId: string, since: string, until: string): Promise<RemoteInsight[]>;
  setCampaignStatus(externalId: string, status: "ACTIVE" | "PAUSED"): Promise<void>;
  setCampaignDailyBudget(externalId: string, dailyBudgetMinor: number): Promise<void>;
}

const mapStatus = (s: string): RemoteCampaign["status"] => (s === "ACTIVE" ? "ACTIVE" : s === "ARCHIVED" || s === "DELETED" ? "ARCHIVED" : "PAUSED");
const PURCHASE_TYPES = new Set(["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
const LEAD_TYPES = new Set(["lead", "leadgen.other", "onsite_conversion.lead_grouped"]);

type ActionStat = { action_type: string; value: string };
const sumActions = (list: ActionStat[] | undefined, types: Set<string>) => {
  // Meta reports the same purchase under several action types; take the max instead of summing duplicates.
  const values = (list ?? []).filter((a) => types.has(a.action_type)).map((a) => Number(a.value) || 0);
  return values.length ? Math.max(...values) : 0;
};

export class MetaGraphAdsProvider implements AdsProvider {
  readonly isDemo = false;
  constructor(private readonly accessToken: string) {}

  async fetchStructure(adAccountId: string) {
    const act = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const [campaigns, adSets, ads] = await Promise.all([
      graphPaginate<Record<string, string>>(`${act}/campaigns`, this.accessToken, {
        fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
        limit: "100",
      }),
      graphPaginate<Record<string, unknown>>(`${act}/adsets`, this.accessToken, {
        fields: "id,name,campaign_id,status,daily_budget,optimization_goal,targeting",
        limit: "100",
      }),
      graphPaginate<Record<string, unknown>>(`${act}/ads`, this.accessToken, {
        fields: "id,name,adset_id,campaign_id,status,creative{thumbnail_url,title,body,call_to_action_type,object_type}",
        limit: "100",
      }),
    ]);
    return {
      campaigns: campaigns.map((c) => ({
        externalId: c.id,
        name: c.name,
        objective: c.objective ?? "OUTCOME_SALES",
        status: mapStatus(c.status),
        dailyBudget: c.daily_budget ? Number(c.daily_budget) : null,
        lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) : null,
        startDate: c.start_time ? new Date(c.start_time) : null,
        endDate: c.stop_time ? new Date(c.stop_time) : null,
      })),
      adSets: adSets.map((s) => ({
        externalId: String(s.id),
        campaignExternalId: String(s.campaign_id),
        name: String(s.name),
        status: mapStatus(String(s.status)),
        dailyBudget: s.daily_budget ? Number(s.daily_budget) : null,
        optimizationGoal: (s.optimization_goal as string) ?? null,
        targeting: s.targeting ?? null,
      })),
      ads: ads.map((a) => {
        const creative = (a.creative ?? {}) as Record<string, string>;
        const objectType = creative.object_type ?? "";
        return {
          externalId: String(a.id),
          adSetExternalId: String(a.adset_id),
          campaignExternalId: String(a.campaign_id),
          name: String(a.name),
          status: mapStatus(String(a.status)),
          creativeType: objectType === "VIDEO" ? "VIDEO" : objectType === "SHARE" ? "CAROUSEL" : "IMAGE",
          thumbnailUrl: creative.thumbnail_url ?? null,
          headline: creative.title ?? null,
          primaryText: creative.body ?? null,
          callToAction: creative.call_to_action_type ?? null,
        } satisfies RemoteAd;
      }),
    };
  }

  async fetchInsights(adAccountId: string, since: string, until: string): Promise<RemoteInsight[]> {
    const act = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const rows = await graphPaginate<Record<string, unknown>>(`${act}/insights`, this.accessToken, {
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields: "ad_id,adset_id,campaign_id,spend,impressions,reach,clicks,actions,action_values,date_start",
      limit: "500",
    });
    return rows.map((r) => ({
      adExternalId: String(r.ad_id),
      adSetExternalId: String(r.adset_id),
      campaignExternalId: String(r.campaign_id),
      date: String(r.date_start),
      spend: toMinor(Number(r.spend) || 0),
      impressions: Number(r.impressions) || 0,
      reach: Number(r.reach) || 0,
      clicks: Number(r.clicks) || 0,
      purchases: sumActions(r.actions as ActionStat[], PURCHASE_TYPES),
      revenue: toMinor(sumActions(r.action_values as ActionStat[], PURCHASE_TYPES)),
      leads: sumActions(r.actions as ActionStat[], LEAD_TYPES),
    }));
  }

  async setCampaignStatus(externalId: string, status: "ACTIVE" | "PAUSED") {
    await graphRequest(externalId, this.accessToken, { method: "POST", body: { status } });
  }

  async setCampaignDailyBudget(externalId: string, dailyBudgetMinor: number) {
    // Meta budgets are expressed in the account currency's minor units.
    await graphRequest(externalId, this.accessToken, { method: "POST", body: { daily_budget: String(dailyBudgetMinor) } });
  }
}

/** Demo provider: data is seeded/simulated locally; mutations succeed without calling Meta. */
export class DemoAdsProvider implements AdsProvider {
  readonly isDemo = true;
  async fetchStructure() {
    return { campaigns: [], adSets: [], ads: [] };
  }
  async fetchInsights() {
    return [];
  }
  async setCampaignStatus() {}
  async setCampaignDailyBudget() {}
}
