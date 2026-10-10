"use client";

import { Layers, Palette } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/states";
import { CAMPAIGN_STATUS, Pill } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import type { AdMetrics } from "@/services/meta.service";
import { Roas } from "./campaigns-table";
import { CreativeTypePill } from "./creatives-view";
import { GOAL_LABEL } from "./labels";

export type AdSetRow = { id: string; name: string; status: string; audienceName: string | null; optimizationGoal: string | null; targeting: unknown; dailyBudget: number | null; metrics: AdMetrics };
export type AdRow = {
  id: string;
  name: string;
  status: string;
  creativeType: string;
  thumbnailUrl: string | null;
  headline: string | null;
  callToAction: string | null;
  adSet: { name: string };
  metrics: AdMetrics;
};


export function AdSetsTable({ rows }: { rows: AdSetRow[] }) {
  const f = useFormat();
  const columns: Column<AdSetRow>[] = [
    {
      key: "name",
      header: "Ad set",
      cell: (s) => (
        <div className="min-w-0">
          <p className="max-w-72 truncate font-medium">{s.name}</p>
          <p className="text-xs text-muted-foreground">{s.audienceName ?? "Custom audience"}</p>
        </div>
      ),
    },
    { key: "goal", header: "Optimization", hideBelow: "lg", cell: (s) => <span className="text-[13px]">{s.optimizationGoal ? (GOAL_LABEL[s.optimizationGoal] ?? s.optimizationGoal) : "—"}</span> },
    { key: "status", header: "Status", cell: (s) => <Pill map={CAMPAIGN_STATUS} value={s.status} /> },
    { key: "spend", header: "Spend", align: "right", cell: (s) => <span className="tabular">{f.money(s.metrics.spend)}</span> },
    { key: "revenue", header: "Revenue", align: "right", cell: (s) => <span className="tabular font-medium">{f.money(s.metrics.revenue)}</span> },
    { key: "roas", header: "ROAS", align: "right", cell: (s) => <Roas value={s.metrics.roas} spend={s.metrics.spend} /> },
    { key: "purchases", header: "Purchases", align: "right", hideBelow: "xl", cell: (s) => <span className="tabular">{s.metrics.purchases}</span> },
    { key: "ctr", header: "CTR", align: "right", hideBelow: "xl", cell: (s) => <span className="tabular">{s.metrics.impressions ? `${s.metrics.ctr.toFixed(2)}%` : "—"}</span> },
  ];
  return (
    <DataTable
      caption="Ad sets"
      columns={columns}
      rows={rows}
      className="rounded-none border-0 border-t shadow-none"
      empty={<EmptyState compact icon={<Layers />} title="No ad sets" description="This campaign has no ad sets yet." />}
      mobileCard={(s) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{s.name}</p>
            <Pill map={CAMPAIGN_STATUS} value={s.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {s.optimizationGoal ? (GOAL_LABEL[s.optimizationGoal] ?? s.optimizationGoal) : "—"} · {f.money(s.metrics.spend)} spend · {f.money(s.metrics.revenue)} revenue ·{" "}
            <Roas value={s.metrics.roas} spend={s.metrics.spend} className="text-xs" /> ROAS
          </p>
        </div>
      )}
    />
  );
}

export function AdsTable({ rows }: { rows: AdRow[] }) {
  const f = useFormat();
  const columns: Column<AdRow>[] = [
    {
      key: "ad",
      header: "Ad",
      cell: (a) => (
        <div className="flex min-w-0 items-center gap-3">
          <ProductImage src={a.thumbnailUrl} alt={a.name} className="size-11" />
          <div className="min-w-0">
            <p className="max-w-64 truncate font-medium">{a.name}</p>
            <p className="max-w-64 truncate text-xs text-muted-foreground">{a.headline ?? a.adSet.name}</p>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Format", cell: (a) => <CreativeTypePill type={a.creativeType} /> },
    { key: "adset", header: "Ad set", hideBelow: "2xl", cell: (a) => <span className="block max-w-44 truncate text-[13px] text-muted-foreground">{a.adSet.name}</span> },
    { key: "status", header: "Status", hideBelow: "lg", cell: (a) => <Pill map={CAMPAIGN_STATUS} value={a.status} /> },
    { key: "spend", header: "Spend", align: "right", cell: (a) => <span className="tabular">{f.money(a.metrics.spend)}</span> },
    { key: "revenue", header: "Revenue", align: "right", cell: (a) => <span className="tabular font-medium">{f.money(a.metrics.revenue)}</span> },
    { key: "roas", header: "ROAS", align: "right", cell: (a) => <Roas value={a.metrics.roas} spend={a.metrics.spend} /> },
    { key: "purchases", header: "Purchases", align: "right", hideBelow: "xl", cell: (a) => <span className="tabular">{a.metrics.purchases}</span> },
    { key: "ctr", header: "CTR", align: "right", hideBelow: "xl", cell: (a) => <span className="tabular">{a.metrics.impressions ? `${a.metrics.ctr.toFixed(2)}%` : "—"}</span> },
  ];
  return (
    <DataTable
      caption="Ads and creatives"
      columns={columns}
      rows={rows}
      className="rounded-none border-0 border-t shadow-none"
      empty={<EmptyState compact icon={<Palette />} title="No ads" description="Ads in this campaign will appear here." />}
      mobileCard={(a) => (
        <div className="flex items-start gap-3">
          <ProductImage src={a.thumbnailUrl} alt={a.name} className="size-12" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate font-medium">{a.name}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <CreativeTypePill type={a.creativeType} />
              <span className="text-xs text-muted-foreground">
                {f.money(a.metrics.spend, { compact: true })} spend · {f.money(a.metrics.revenue, { compact: true })} rev ·{" "}
                <Roas value={a.metrics.roas} spend={a.metrics.spend} className="text-xs" />
              </span>
            </div>
          </div>
        </div>
      )}
    />
  );
}
