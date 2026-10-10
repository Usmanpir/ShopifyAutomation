import { CircleDot, Megaphone, Plug } from "lucide-react";
import Link from "next/link";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { EmptyState } from "@/components/shared/states";
import { FilterTabs, RangeSelect } from "@/components/shared/url-controls";
import { Button } from "@/components/ui/button";
import { AdsOverviewCharts, RevenueByCampaign } from "@/features/ads/ads-charts";
import { AdsAnalystPanel } from "@/features/ads/ads-analyst";
import { CampaignsTable, type CampaignRow } from "@/features/ads/campaigns-table";
import { CreativeAnalyzer } from "@/features/ads/creative-analyzer";
import { CreativeCards, CreativeTypeComparison } from "@/features/ads/creatives-view";
import { LoadError } from "@/features/ads/load-error";
import { AreaTabs } from "@/components/layout/area-tabs";
import { SocialPanel } from "@/features/ads/social-panel";
import { SyncNowButton } from "@/features/ads/sync-button";
import { requireAuth } from "@/lib/auth/session";
import { rangeQuerySchema } from "@/lib/dates";
import { timeAgo } from "@/lib/format";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { adsAnalystFeed, adsOverview, creativePerformance, getMetaAccount, socialOverview, type AdMetrics } from "@/services/meta.service";

export const metadata = { title: "Meta Ads" };

const TABS = ["overview", "campaigns", "creatives", "social"] as const;
type Tab = (typeof TABS)[number];

const SORTERS: Record<string, (c: CampaignRow) => number | string> = {
  name: (c) => c.name.toLowerCase(),
  budget: (c) => c.dailyBudget ?? 0,
  spend: (c) => c.metrics.spend,
  revenue: (c) => c.metrics.revenue,
  roas: (c) => c.metrics.roas,
  purchases: (c) => c.metrics.purchases,
  cpa: (c) => c.metrics.cpa,
  ctr: (c) => c.metrics.ctr,
  impressions: (c) => c.metrics.impressions,
};

function sortCampaigns(rows: CampaignRow[], sort: string | undefined, dir: string | undefined) {
  const get = sort ? SORTERS[sort] : undefined;
  if (!get) return rows;
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    return (x < y ? -1 : x > y ? 1 : 0) * m;
  });
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function AdsPage({ searchParams }: PageProps<"/ads">) {
  const auth = await requireAuth("ads.view");
  const sp = await searchParams;
  const parsed = rangeQuerySchema.safeParse(sp);
  const q = parsed.success ? parsed.data : rangeQuerySchema.parse({});
  const tabParam = str(sp.tab);
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";
  const storeId = auth.store.id;
  const f = makeFormatter(auth.store);
  const canManage = can(auth.role, "ads.manage");

  const account = await getMetaAccount(storeId).catch(() => null);

  const header = (
    <PageHeader
      title="Marketing"
      description={
        account ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <CircleDot className="size-3.5 text-success" aria-hidden />
              {account.name}
            </span>
            <span className="tabular">{account.adAccountId}</span>
            <span aria-hidden>·</span>
            <span title={account.lastSyncAt ? f.dateTime(account.lastSyncAt) : undefined}>Last synced {account.lastSyncAt ? timeAgo(account.lastSyncAt) : "never"}</span>
            {auth.store.demoMode && <span className="rounded-full bg-warning-soft px-2 text-[11.5px] font-medium text-warning">Demo data</span>}
          </span>
        ) : (
          "Performance, creatives and social engagement across Facebook & Instagram."
        )
      }
      actions={
        account ? (
          <>
            {tab !== "social" && <RangeSelect />}
            {canManage && <SyncNowButton />}
          </>
        ) : null
      }
    />
  );

  // Meta Ads lives under Marketing: area tabs on top, its own sections as pills below.
  const tabs = (
    <FilterTabs
      defaultValue="overview"
      tabs={[
        { value: "overview", label: "Ads overview" },
        { value: "campaigns", label: "Campaigns" },
        { value: "creatives", label: "Creatives" },
        { value: "social", label: "Comments & leads" },
      ]}
    />
  );

  if (!account) {
    return (
      <PageContainer wide>
        {header}
        <AreaTabs area="marketing" className="-mt-2" />
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={<Plug />}
            title="Connect your Meta ad account"
            description="Link Meta Ads to see spend, ROAS and creative performance, and let the AI Ad Analyst recommend budget changes."
            action={
              <Button asChild>
                <Link href="/integrations">Go to Integrations</Link>
              </Button>
            }
          />
        </div>
      </PageContainer>
    );
  }

  let body: React.ReactNode;
  try {
    body = await renderTab();
  } catch (err) {
    console.error("[ads] failed to load", err);
    body = (
      <LoadError
        title="Unable to load Meta Ads"
        description="We couldn't synchronize your Meta account. Please try again in a moment."
        lastSuccess={account.lastSyncAt ? account.lastSyncAt.toISOString() : null}
      />
    );
  }

  return (
    <PageContainer wide>
      {header}
      <AreaTabs area="marketing" className="-mt-2" />
      {tabs}
      {body}
    </PageContainer>
  );

  async function renderTab(): Promise<React.ReactNode> {
    if (tab === "overview") {
      const [ov, feed] = await Promise.all([adsOverview(storeId, q), adsAnalystFeed(storeId)]);
      const { totals: t, changes: c, series, range } = ov;
      const spark = (k: "spend" | "revenue" | "roas" | "purchases" | "cpa") => series.map((d) => d[k]);
      const primary: { key: keyof AdMetrics; label: string; value: string; spark?: number[]; invert?: boolean }[] = [
        { key: "spend", label: "Spend", value: f.money(t.spend), spark: spark("spend"), invert: true },
        { key: "revenue", label: "Revenue", value: f.money(t.revenue), spark: spark("revenue") },
        { key: "roas", label: "ROAS", value: `${t.roas.toFixed(2)}×`, spark: spark("roas") },
        { key: "purchases", label: "Purchases", value: f.number(t.purchases), spark: spark("purchases") },
      ];
      const secondary: { key: keyof AdMetrics; label: string; value: string; invert?: boolean }[] = [
        { key: "cpa", label: "CPA", value: t.purchases ? f.money(t.cpa) : "—", invert: true },
        { key: "cpc", label: "CPC", value: t.clicks ? f.money(t.cpc) : "—", invert: true },
        { key: "ctr", label: "CTR", value: `${t.ctr.toFixed(2)}%` },
        { key: "cpm", label: "CPM", value: t.impressions ? f.money(t.cpm) : "—", invert: true },
        { key: "conversionRate", label: "Conversion rate", value: `${t.conversionRate.toFixed(2)}%` },
      ];
      const rows = sortCampaigns(JSON.parse(JSON.stringify(ov.campaigns)) as CampaignRow[], str(sp.sort), str(sp.dir));
      const revenueBars = ov.campaigns
        .filter((x) => x.metrics.revenue > 0)
        .sort((a, b) => b.metrics.revenue - a.metrics.revenue)
        .map((x) => ({ id: x.id, label: x.name, value: x.metrics.revenue, roas: x.metrics.roas }));
      const noDelivery = t.impressions === 0;

      return (
        <>
          <section aria-label="Key ad metrics" className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              {primary.map((k) => (
                <KpiCard key={k.key} label={k.label} value={k.value} change={c[k.key]} comparison={range.comparisonLabel} spark={k.spark} invert={k.invert} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
              {secondary.map((k) => (
                <KpiCard key={k.key} label={k.label} value={k.value} change={c[k.key]} comparison={range.comparisonLabel} invert={k.invert} />
              ))}
            </div>
          </section>

          {noDelivery ? (
            <div className="rounded-xl border bg-card">
              <EmptyState icon={<Megaphone />} title="No ad delivery in this period" description="None of your campaigns spent in the selected range. Pick a longer range or activate a campaign." />
            </div>
          ) : (
            <AdsOverviewCharts series={series} rangeLabel={range.label} />
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard
              title="Campaign performance"
              description={`${range.label} · sorted by ${str(sp.sort) ? "your selection" : "spend"}`}
              className="xl:col-span-2"
              contentClassName="px-0 pb-0"
              action={
                <Link href="/ads?tab=campaigns" className="text-[13px] font-medium text-primary hover:underline">
                  All campaigns
                </Link>
              }
            >
              <div className="border-t">
                <CampaignsTable rows={rows} compact />
              </div>
            </SectionCard>
            <SectionCard title="Revenue by campaign" description={`${range.label} · share of revenue · ROAS`}>
              {revenueBars.length ? <RevenueByCampaign data={revenueBars} /> : <p className="py-10 text-center text-sm text-muted-foreground">No attributed revenue in this period.</p>}
            </SectionCard>
          </div>

          <AdsAnalystPanel insight={JSON.parse(JSON.stringify(feed.insight))} pending={JSON.parse(JSON.stringify(feed.pending))} recent={JSON.parse(JSON.stringify(feed.recent))} />
        </>
      );
    }

    if (tab === "campaigns") {
      const ov = await adsOverview(storeId, q);
      const status = str(sp.status) ?? "all";
      const all = JSON.parse(JSON.stringify(ov.campaigns)) as CampaignRow[];
      const filtered = status === "all" ? all : all.filter((x) => x.status === status.toUpperCase());
      const rows = sortCampaigns(filtered, str(sp.sort), str(sp.dir));
      const count = (s: string) => all.filter((x) => x.status === s).length;
      const sum = rows.reduce((a, r) => ({ spend: a.spend + r.metrics.spend, revenue: a.revenue + r.metrics.revenue, purchases: a.purchases + r.metrics.purchases }), { spend: 0, revenue: 0, purchases: 0 });
      return (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <FilterTabs
              param="status"
              tabs={[
                { value: "all", label: "All", count: all.length },
                { value: "active", label: "Active", count: count("ACTIVE") },
                { value: "paused", label: "Paused", count: count("PAUSED") },
                { value: "archived", label: "Archived", count: count("ARCHIVED") },
              ]}
            />
            <p className="text-[13px] text-muted-foreground">
              {ov.range.label}: <span className="tabular font-medium text-foreground">{f.money(sum.spend)}</span> spend ·{" "}
              <span className="tabular font-medium text-foreground">{f.money(sum.revenue)}</span> revenue ·{" "}
              <span className="tabular font-medium text-foreground">{sum.spend ? (sum.revenue / sum.spend).toFixed(2) : "0.00"}×</span> ROAS
            </p>
          </div>
          <CampaignsTable rows={rows} filtered={status !== "all"} />
        </div>
      );
    }

    if (tab === "creatives") {
      const perf = await creativePerformance(storeId, q);
      return (
        <>
          <CreativeTypeComparison byType={JSON.parse(JSON.stringify(perf.byType))} rangeLabel={perf.range.label} />
          <CreativeAnalyzer initial={JSON.parse(JSON.stringify(perf.uploads))} canManage={canManage} />
          <section aria-labelledby="creatives-title" className="space-y-3">
            <div>
              <h2 id="creatives-title" className="text-[15px] font-semibold tracking-tight">
                Ad creatives
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {perf.creatives.length} creatives with delivery · {perf.range.label.toLowerCase()} · ranked by revenue
              </p>
            </div>
            <CreativeCards creatives={JSON.parse(JSON.stringify(perf.creatives))} />
          </section>
        </>
      );
    }

    const social = await socialOverview(storeId);
    return (
      <SocialPanel
        account={JSON.parse(JSON.stringify(social.account))}
        conversations={JSON.parse(JSON.stringify(social.conversations))}
        comments={JSON.parse(JSON.stringify(social.comments))}
        leads={JSON.parse(JSON.stringify(social.leads))}
        leadCount7d={social.leadCount7d}
        unansweredComments={social.unansweredComments}
      />
    );
  }
}
