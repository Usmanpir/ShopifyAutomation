"use client";

import { useState } from "react";
import { ChartLegend, SERIES_COLORS, TrendChart, type Series } from "@/components/charts/charts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DailyPoint } from "@/services/analytics.service";

/**
 * Revenue analytics. Money metrics share one axis; orders get their own view
 * (never two y-axes on one chart).
 */
const VIEWS = {
  money: {
    label: "Revenue",
    format: "money" as const,
    series: [
      { key: "revenue", label: "Revenue", color: SERIES_COLORS[0] },
      { key: "profit", label: "Profit", color: SERIES_COLORS[2], area: false },
      { key: "adSpend", label: "Ad spend", color: SERIES_COLORS[1], area: false },
    ] satisfies Series[],
  },
  orders: {
    label: "Orders",
    format: "number" as const,
    series: [
      { key: "orders", label: "Orders", color: SERIES_COLORS[0] },
      { key: "confirmed", label: "Confirmed", color: SERIES_COLORS[2], area: false },
    ] satisfies Series[],
  },
};

export function RevenueChart({ series }: { series: DailyPoint[] }) {
  const [view, setView] = useState<keyof typeof VIEWS>("money");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const v = VIEWS[view];
  const visible = v.series.filter((s) => !hidden.has(s.key));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup type="single" value={view} onValueChange={(x) => x && (setView(x as keyof typeof VIEWS), setHidden(new Set()))} variant="outline" size="sm" aria-label="Chart metric">
          <ToggleGroupItem value="money">Revenue · Profit · Ad spend</ToggleGroupItem>
          <ToggleGroupItem value="orders">Orders</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex flex-wrap gap-1.5">
          {v.series.map((s) => {
            const on = !hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(s.key)) n.delete(s.key);
                    else if (v.series.length - n.size > 1) n.add(s.key);
                    return n;
                  })
                }
                className="flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition aria-[pressed=false]:opacity-45"
              >
                <span aria-hidden className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <TrendChart data={series as unknown as Record<string, number | string>[]} series={visible} format={v.format} height={290} />
      <ChartLegend series={visible} className="sr-only" />
    </div>
  );
}
