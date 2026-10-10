"use client";

import { cn } from "cn";
import { Megaphone } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { CAMPAIGN_STATUS, Pill } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import type { AdMetrics } from "@/services/meta.service";
import { OBJECTIVE_LABEL } from "./labels";

export type CampaignRow = { id: string; name: string; objective: string; status: string; dailyBudget: number | null; metrics: AdMetrics };


/** ROAS with a text qualifier on mobile/tooltips — tone backs up the number, never replaces it. */
export function Roas({ value, spend, className }: { value: number; spend: number; className?: string }) {
  if (!spend) return <span className={cn("tabular text-muted-foreground", className)}>—</span>;
  const tone = value >= 3 ? "text-success" : value < 1.2 ? "text-danger" : "text-foreground";
  const label = value >= 3 ? "Strong" : value < 1.2 ? "Below break-even" : "Moderate";
  return (
    <span className={cn("tabular font-semibold", tone, className)} title={`${label} return on ad spend`}>
      {value.toFixed(2)}×
    </span>
  );
}

export function CampaignsTable({ rows, compact, filtered }: { rows: CampaignRow[]; compact?: boolean; filtered?: boolean }) {
  const f = useFormat();
  const columns: Column<CampaignRow>[] = [
    {
      key: "name",
      header: "Campaign",
      sortKey: "name",
      cell: (c) => (
        <div className="min-w-0">
          <p className="max-w-64 truncate font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground">{OBJECTIVE_LABEL[c.objective] ?? c.objective}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (c) => <Pill map={CAMPAIGN_STATUS} value={c.status} /> },
    { key: "budget", header: "Daily budget", sortKey: "budget", align: "right", hideBelow: compact ? "2xl" : "lg", cell: (c) => <span className="tabular">{c.dailyBudget ? f.money(c.dailyBudget) : "—"}</span> },
    { key: "spend", header: "Spend", sortKey: "spend", align: "right", cell: (c) => <span className="tabular">{f.money(c.metrics.spend)}</span> },
    { key: "revenue", header: "Revenue", sortKey: "revenue", align: "right", cell: (c) => <span className="tabular font-medium">{f.money(c.metrics.revenue)}</span> },
    { key: "roas", header: "ROAS", sortKey: "roas", align: "right", cell: (c) => <Roas value={c.metrics.roas} spend={c.metrics.spend} /> },
    { key: "purchases", header: "Purchases", sortKey: "purchases", align: "right", hideBelow: compact ? "2xl" : undefined, cell: (c) => <span className="tabular">{f.number(c.metrics.purchases)}</span> },
    { key: "cpa", header: "CPA", sortKey: "cpa", align: "right", hideBelow: "xl", cell: (c) => <span className="tabular">{c.metrics.purchases ? f.money(c.metrics.cpa) : "—"}</span> },
    { key: "ctr", header: "CTR", sortKey: "ctr", align: "right", hideBelow: compact ? "2xl" : "xl", cell: (c) => <span className="tabular">{c.metrics.impressions ? `${c.metrics.ctr.toFixed(2)}%` : "—"}</span> },
  ];
  if (!compact) {
    columns.push(
      { key: "impressions", header: "Impressions", sortKey: "impressions", align: "right", hideBelow: "2xl", cell: (c) => <span className="tabular">{f.number(c.metrics.impressions, true)}</span> },
      { key: "cpm", header: "CPM", align: "right", hideBelow: "2xl", cell: (c) => <span className="tabular">{c.metrics.impressions ? f.money(c.metrics.cpm) : "—"}</span> },
    );
  }

  return (
    <DataTable
      caption="Meta campaigns"
      columns={columns}
      rows={rows}
      rowHref={(c) => `/ads/campaigns/${c.id}`}
      className={compact ? "rounded-none border-0 shadow-none" : undefined}
      empty={
        <EmptyState
          icon={<Megaphone />}
          title={filtered ? "No campaigns match this filter" : "No campaigns yet"}
          description={filtered ? "Try a different status." : "Campaigns from your Meta ad account will appear here after the first sync."}
        />
      }
      mobileCard={(c) => (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {OBJECTIVE_LABEL[c.objective] ?? c.objective}
                {c.dailyBudget ? ` · ${f.money(c.dailyBudget)}/day` : ""}
              </p>
            </div>
            <Pill map={CAMPAIGN_STATUS} value={c.status} />
          </div>
          <dl className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Spend</dt>
              <dd className="tabular font-medium">{f.money(c.metrics.spend, { compact: true })}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Revenue</dt>
              <dd className="tabular font-medium">{f.money(c.metrics.revenue, { compact: true })}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ROAS</dt>
              <dd>
                <Roas value={c.metrics.roas} spend={c.metrics.spend} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Purchases</dt>
              <dd className="tabular font-medium">{c.metrics.purchases}</dd>
            </div>
          </dl>
        </div>
      )}
    />
  );
}
