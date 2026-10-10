import { TimeAgo } from "@/components/shared/time-ago";
import { ArrowRight, BarChart3, MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { AreaTabs } from "@/components/layout/area-tabs";
import { InsightCard } from "@/components/shared/insight-card";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { EmptyState } from "@/components/shared/states";
import { Pill } from "@/components/shared/status";
import { AIDecisionCard } from "@/features/ads/ai-decision-card";
import { LoadError } from "@/features/ads/load-error";
import { MarketingCampaignsTable, NewCampaignButton } from "@/features/marketing/campaigns";
import { MARKETING_STATUS } from "@/features/marketing/labels";
import { MarketingOverview } from "@/features/marketing/marketing-overview";
import { NewPromotionButton, PromotionsTable } from "@/features/marketing/promotions";
import { SegmentsGrid } from "@/features/marketing/segments";
import { requireAuth } from "@/lib/auth/session";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { marketingSnapshot } from "@/services/marketing-advisor.service";
import { marketingInsights, marketingOverview } from "@/services/marketing.service";

export const metadata = { title: "Marketing" };

const TABS = ["overview", "campaigns", "segments", "promotions", "ai"] as const;
type Tab = (typeof TABS)[number];

export default async function MarketingPage({ searchParams }: PageProps<"/marketing">) {
  const auth = await requireAuth("marketing.view");
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const f = makeFormatter(auth.store);
  const canManage = can(auth.role, "marketing.manage");
  const canAds = can(auth.role, "ads.view");

  let data: Awaited<ReturnType<typeof marketingOverview>>;
  let insights: Awaited<ReturnType<typeof marketingInsights>> = [];
  let snapshot: Awaited<ReturnType<typeof marketingSnapshot>> | null = null;
  try {
    [data, insights, snapshot] = await Promise.all([
      marketingOverview(auth.store.id),
      tab === "ai" ? marketingInsights(auth.store.id) : Promise.resolve([]),
      tab === "overview" && canAds ? marketingSnapshot(auth.store.id) : Promise.resolve(null),
    ]);
  } catch (err) {
    console.error("[marketing] failed to load", err);
    return (
      <PageContainer wide>
        <PageHeader title="Marketing" />
        <LoadError title="Unable to load marketing" description="Your campaigns and customer data are safe — we just couldn't load this page. Please try again." />
      </PageContainer>
    );
  }

  const segmentOptions = data.segments.map((s) => ({ id: s.id, key: s.key, name: s.name, color: s.color, customerCount: s.customerCount }));
  const pendingRecs = data.recommendations.filter((r) => r.status === "PENDING_APPROVAL");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ser = (x: unknown): any => JSON.parse(JSON.stringify(x));

  const actions =
    tab === "promotions" ? (canManage ? <NewPromotionButton /> : null) : tab === "segments" ? null : canManage ? <NewCampaignButton segments={segmentOptions} /> : null;

  return (
    <PageContainer wide>
      <PageHeader title="Marketing" description="Is your advertising paying off, and who should you talk to next? Ads and WhatsApp campaigns in one place." actions={actions} />
      <AreaTabs area="marketing" className="-mt-2" />

      {tab === "overview" && (
        <>
          {snapshot && <MarketingOverview s={snapshot} f={f} canAsk={can(auth.role, "ai.use")} />}

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <Sparkles className="size-4 text-ai" /> WhatsApp campaign ideas
              </h2>
              {pendingRecs[0] ? (
                <AIDecisionCard decision={ser(pendingRecs[0])} showStatus />
              ) : (
                <div className="rounded-xl border border-dashed bg-card">
                  <EmptyState compact icon={<Sparkles />} title="No campaign ideas waiting" description="When customers go quiet or a segment grows, the Marketing Assistant prepares a campaign for your approval." />
                </div>
              )}
            </div>
            <SectionCard
              title="Recent WhatsApp broadcasts"
              className="xl:col-span-2"
              contentClassName="px-0 pb-0"
              action={
                <Link href="/marketing?tab=campaigns" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  All <ArrowRight className="size-3.5" />
                </Link>
              }
            >
              {data.campaigns.length ? (
                <ul className="divide-y border-t">
                  {data.campaigns.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
                        <MessageCircle className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.segment?.name ?? "—"} · {f.number(c.audienceSize)} customers · <TimeAgo date={c.sentAt ?? c.createdAt} />
                        </p>
                      </div>
                      {c.status === "SENT" && (
                        <div className="hidden text-right sm:block">
                          <p className="tabular text-sm font-semibold">{f.money(c.revenue)}</p>
                          <p className="text-xs text-muted-foreground">{c.sentCount ? Math.round((c.readCount / c.sentCount) * 100) : 0}% read</p>
                        </div>
                      )}
                      <Pill map={MARKETING_STATUS} value={c.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={<BarChart3 />} title="No broadcasts yet" description={`${f.number(data.stats.reachableCustomers)} customers can be reached on WhatsApp. Start with a segment.`} />
              )}
            </SectionCard>
          </div>
        </>
      )}

      {tab === "campaigns" && <MarketingCampaignsTable rows={ser(data.campaigns)} segments={segmentOptions} />}

      {tab === "segments" && <SegmentsGrid segments={ser(data.segments)} />}

      {tab === "promotions" && <PromotionsTable rows={ser(data.promotions)} />}

      {tab === "ai" && (
        <div className="space-y-8">
          <section aria-labelledby="mk-recs" className="space-y-3">
            <div>
              <h2 id="mk-recs" className="text-[15px] font-semibold tracking-tight">
                Campaign recommendations
              </h2>
              <p className="text-[13px] text-muted-foreground">Proposed by the Marketing Assistant. Each one waits for approval before any message goes out.</p>
            </div>
            {data.recommendations.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.recommendations.map((d) => (
                  <AIDecisionCard key={d.id} decision={ser(d)} showStatus />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-card">
                <EmptyState compact icon={<Sparkles />} title="No recommendations yet" description="When customers go quiet or a segment grows, the Marketing Assistant will propose a campaign here." />
              </div>
            )}
          </section>
          <section aria-labelledby="mk-insights" className="space-y-3">
            <h2 id="mk-insights" className="text-[15px] font-semibold tracking-tight">
              Opportunities & customer insights
            </h2>
            {insights.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {insights.map((i) => (
                  <InsightCard key={i.id} insight={ser(i)} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No opportunity insights right now.</p>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}
