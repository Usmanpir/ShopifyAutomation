"use client";

import Link from "next/link";
import { useState } from "react";
import { ChartLegend, ColumnChart, SERIES_COLORS, TrendChart, type Series, type ValueFormat } from "@/components/charts/charts";
import { SectionCard } from "@/components/shared/page";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFormat } from "@/components/store-context";

export type AdsDayPoint = { date: string; spend: number; revenue: number; purchases: number; roas: number; cpa?: number; ctr: number };

const SPEND_REVENUE: Series[] = [
  { key: "revenue", label: "Revenue", color: SERIES_COLORS[0] },
  { key: "spend", label: "Spend", color: SERIES_COLORS[1], area: false },
];

type Rows = Record<string, number | string>[];

/** Overview charts — one unit per chart, never two y-axes. */
export function AdsOverviewCharts({ series, rangeLabel }: { series: AdsDayPoint[]; rangeLabel: string }) {
  const f = useFormat();
  const data = series as unknown as Rows;
  const totalSpend = series.reduce((s, d) => s + d.spend, 0);
  const totalRevenue = series.reduce((s, d) => s + d.revenue, 0);
  const daysWithSpend = series.filter((d) => d.spend > 0);
  const bestRoas = daysWithSpend.length ? daysWithSpend.reduce((a, b) => (b.roas > a.roas ? b : a)) : null;
  const withPurchases = series.filter((d) => d.purchases > 0);
  const avgCpa = withPurchases.length ? Math.round(withPurchases.reduce((s, d) => s + (d.cpa ?? 0), 0) / withPurchases.length) : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard
        title="Spend vs revenue"
        description={`${rangeLabel} · daily · ${f.money(totalRevenue, { compact: true })} revenue on ${f.money(totalSpend, { compact: true })} spend`}
        className="xl:col-span-2"
      >
        <TrendChart data={data} series={SPEND_REVENUE} format="money" height={280} />
        <ChartLegend series={SPEND_REVENUE} className="mt-3" />
      </SectionCard>
      <SectionCard title="ROAS trend" description={bestRoas ? `Best day ${f.dateShort(bestRoas.date + "T12:00:00Z")} at ${bestRoas.roas.toFixed(2)}×` : "Return on ad spend per day"}>
        <TrendChart data={data} series={[{ key: "roas", label: "ROAS", color: SERIES_COLORS[0] }]} format="ratio" height={220} />
      </SectionCard>
      <SectionCard title="Purchases" description={`${f.number(series.reduce((s, d) => s + d.purchases, 0))} attributed purchases`}>
        <ColumnChart data={series.map((d) => ({ label: d.date, value: d.purchases }))} format="number" height={220} />
      </SectionCard>
      <SectionCard title="Cost per acquisition" description={avgCpa ? `Averaging ${f.money(avgCpa)} per purchase · lower is better` : "Cost per purchase per day · lower is better"} className="xl:col-span-2">
        <TrendChart data={data} series={[{ key: "cpa", label: "CPA", color: SERIES_COLORS[0] }]} format="money" height={200} />
      </SectionCard>
    </div>
  );
}

/** Ranked bar list (full names, value + ROAS at the tip) — reads better than an axis chart in a narrow column. */
export function RevenueByCampaign({ data }: { data: { id: string; label: string; value: number; roas: number }[] }) {
  const f = useFormat();
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.id}>
          <Link href={`/ads/campaigns/${d.id}`} className="group block space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-medium group-hover:text-primary">{d.label}</span>
              <span className="tabular shrink-0 font-semibold">{f.money(d.value, { compact: true })}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="presentation">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: SERIES_COLORS[0] }} />
              </div>
              <span className="tabular w-24 shrink-0 text-right text-[11.5px] text-muted-foreground">
                {((d.value / total) * 100).toFixed(0)}% · {d.roas.toFixed(2)}×
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const DETAIL_VIEWS: Record<string, { label: string; format: ValueFormat; series: Series[] }> = {
  money: { label: "Spend vs revenue", format: "money", series: SPEND_REVENUE },
  roas: { label: "ROAS", format: "ratio", series: [{ key: "roas", label: "ROAS", color: SERIES_COLORS[0] }] },
  purchases: { label: "Purchases", format: "number", series: [{ key: "purchases", label: "Purchases", color: SERIES_COLORS[0] }] },
  ctr: { label: "CTR", format: "percent", series: [{ key: "ctr", label: "CTR", color: SERIES_COLORS[0] }] },
};

/** Campaign detail trend with a metric switcher (one unit at a time). */
export function CampaignTrend({ series }: { series: AdsDayPoint[] }) {
  const [view, setView] = useState("money");
  const v = DETAIL_VIEWS[view];
  return (
    <div className="space-y-4">
      <ToggleGroup type="single" value={view} onValueChange={(x) => x && setView(x)} variant="outline" size="sm" aria-label="Chart metric" className="flex-wrap">
        {Object.entries(DETAIL_VIEWS).map(([k, d]) => (
          <ToggleGroupItem key={k} value={k}>
            {d.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <TrendChart data={series as unknown as Rows} series={v.series} format={v.format} height={260} />
      {v.series.length > 1 && <ChartLegend series={v.series} />}
    </div>
  );
}
