import { CalendarDays, Target, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { CAMPAIGN_STATUS, Pill } from "@/components/shared/status";
import { RangeSelect } from "@/components/shared/url-controls";
import { AIDecisionCard } from "@/features/ads/ai-decision-card";
import { CampaignTrend } from "@/features/ads/ads-charts";
import { CampaignActions } from "@/features/ads/campaign-actions";
import { AdSetsTable, AdsTable } from "@/features/ads/campaign-detail-tables";
import { GOAL_LABEL, OBJECTIVE_LABEL } from "@/features/ads/labels";
import { requireAuth } from "@/lib/auth/session";
import { rangeQuerySchema } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { campaignDetail, campaignRecommendations, type AdMetrics } from "@/services/meta.service";

export const metadata = { title: "Campaign" };

const COUNTRY: Record<string, string> = { PK: "Pakistan", AE: "UAE", SA: "Saudi Arabia", GB: "United Kingdom", US: "United States" };

/** Human summary of a Meta targeting spec. */
function summarizeTargeting(t: unknown): { label: string; value: string }[] {
  if (!t || typeof t !== "object") return [];
  const x = t as { geo?: string[]; age?: [number, number]; genders?: string[]; interests?: string[]; cities?: string[] };
  const out: { label: string; value: string }[] = [];
  if (x.geo?.length) out.push({ label: "Location", value: x.geo.map((g) => COUNTRY[g] ?? g).join(", ") });
  if (x.cities?.length) out.push({ label: "Cities", value: x.cities.join(", ") });
  if (x.age?.length === 2) out.push({ label: "Age", value: `${x.age[0]}–${x.age[1]}${x.age[1] >= 65 ? "+" : ""}` });
  if (x.genders?.length) out.push({ label: "Gender", value: x.genders.map((g) => (g === "male" ? "Men" : g === "female" ? "Women" : g)).join(", ") });
  if (x.interests?.length) out.push({ label: "Interests", value: x.interests.join(", ") });
  return out;
}

export default async function CampaignPage({ params, searchParams }: PageProps<"/ads/campaigns/[id]">) {
  const auth = await requireAuth("ads.view");
  const { id } = await params;
  const parsed = rangeQuerySchema.safeParse(await searchParams);
  const q = parsed.success ? parsed.data : rangeQuerySchema.parse({});
  const f = makeFormatter(auth.store);

  let data: Awaited<ReturnType<typeof campaignDetail>>;
  try {
    data = await campaignDetail(auth.store.id, id, q);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  const recs = can(auth.role, "approvals.view") ? await campaignRecommendations(auth.store.id, id) : [];
  const { campaign, totals: t, range, series } = data;
  const changes = data.changes as Record<keyof AdMetrics, number>;

  const kpis: { key: keyof AdMetrics; label: string; value: string; spark?: number[]; invert?: boolean }[] = [
    { key: "spend", label: "Spend", value: f.money(t.spend), spark: series.map((d) => d.spend), invert: true },
    { key: "revenue", label: "Revenue", value: f.money(t.revenue), spark: series.map((d) => d.revenue) },
    { key: "roas", label: "ROAS", value: `${t.roas.toFixed(2)}×`, spark: series.map((d) => d.roas) },
    { key: "purchases", label: "Purchases", value: f.number(t.purchases), spark: series.map((d) => d.purchases) },
    { key: "cpa", label: "CPA", value: t.purchases ? f.money(t.cpa) : "—", invert: true },
    { key: "ctr", label: "CTR", value: `${t.ctr.toFixed(2)}%`, spark: series.map((d) => d.ctr) },
  ];

  const adSets = JSON.parse(JSON.stringify(data.adSets));
  const ads = JSON.parse(JSON.stringify([...data.ads].sort((a, b) => b.metrics.revenue - a.metrics.revenue)));
  const audiences = data.adSets.map((s) => ({ id: s.id, name: s.audienceName ?? s.name, goal: s.optimizationGoal, status: s.status, chips: summarizeTargeting(s.targeting), spend: s.metrics.spend, impressions: s.metrics.impressions }));

  return (
    <PageContainer>
      <PageHeader
        crumbs={[{ label: "Meta Ads", href: "/ads" }, { label: "Campaigns", href: "/ads?tab=campaigns" }, { label: campaign.name }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {campaign.name}
            <Pill map={CAMPAIGN_STATUS} value={campaign.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Target className="size-3.5" aria-hidden />
              {OBJECTIVE_LABEL[campaign.objective] ?? campaign.objective} objective
            </span>
            <span>
              <span className="tabular font-medium text-foreground">{campaign.dailyBudget ? f.money(campaign.dailyBudget) : "—"}</span> / day
            </span>
            {campaign.startDate && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                Since {f.date(campaign.startDate)}
                {campaign.endDate ? ` · ended ${f.date(campaign.endDate)}` : ""}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <RangeSelect />
            {can(auth.role, "ads.manage") && (
              <CampaignActions
                id={campaign.id}
                name={campaign.name}
                status={campaign.status}
                dailyBudget={campaign.dailyBudget}
                approvalPercent={auth.store.settings.approvals.adBudgetChangePercent}
                roas={t.roas}
              />
            )}
          </>
        }
      />

      <section aria-label="Campaign metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard key={k.key} label={k.label} value={k.value} change={changes[k.key]} comparison={range.comparisonLabel} spark={k.spark} invert={k.invert} />
        ))}
      </section>

      <SectionCard title="Performance trend" description={`${range.label} · daily`}>
        <CampaignTrend series={series} />
      </SectionCard>

      {recs.length > 0 && (
        <section aria-labelledby="recs-title" className="space-y-3">
          <h2 id="recs-title" className="text-[15px] font-semibold tracking-tight">
            AI recommendations for this campaign
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {recs.map((d) => (
              <AIDecisionCard key={d.id} decision={JSON.parse(JSON.stringify(d))} showStatus />
            ))}
          </div>
        </section>
      )}

      <SectionCard title="Ad sets" description={`${data.adSets.length} ad set${data.adSets.length === 1 ? "" : "s"} · ${range.label.toLowerCase()}`} contentClassName="px-0 pb-0">
        <AdSetsTable rows={adSets} />
      </SectionCard>

      <SectionCard title="Ads & creatives" description={`${data.ads.length} ads · ranked by revenue`} contentClassName="px-0 pb-0">
        <AdsTable rows={ads} />
      </SectionCard>

      <SectionCard title="Audiences" description="Who each ad set reaches" icon={<span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand"><Users className="size-4" /></span>}>
        {audiences.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {audiences.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{a.name}</p>
                    <p className="text-xs text-muted-foreground">Optimizing for {a.goal ? (GOAL_LABEL[a.goal] ?? a.goal).toLowerCase() : "—"}</p>
                  </div>
                  <Pill map={CAMPAIGN_STATUS} value={a.status} />
                </div>
                {a.chips.length > 0 ? (
                  <dl className="flex flex-wrap gap-1.5">
                    {a.chips.map((c) => (
                      <div key={c.label} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[12px]">
                        <dt className="text-muted-foreground">{c.label}</dt>
                        <dd className="font-medium">{c.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-muted-foreground">Broad targeting (Advantage+)</p>
                )}
                <p className="mt-auto text-xs text-muted-foreground">
                  <span className="tabular font-medium text-foreground">{f.number(a.impressions, true)}</span> impressions · <span className="tabular font-medium text-foreground">{f.money(a.spend, { compact: true })}</span> spend in period
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No audiences defined.</p>
        )}
      </SectionCard>
    </PageContainer>
  );
}
