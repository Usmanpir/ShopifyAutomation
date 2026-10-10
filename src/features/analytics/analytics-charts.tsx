"use client";

import { ChartLegend, DonutChart, HBarChart, SERIES_COLORS, TrendChart, type Series } from "@/components/charts/charts";

type Point = Record<string, number | string>;

const MONEY_SERIES: Series[] = [
  { key: "revenue", label: "Revenue", color: SERIES_COLORS[0] },
  { key: "profit", label: "Profit", color: SERIES_COLORS[2], area: false },
];

const ORDER_SERIES: Series[] = [
  { key: "orders", label: "Orders placed", color: SERIES_COLORS[0] },
  { key: "confirmed", label: "Confirmed", color: SERIES_COLORS[2], area: false },
  { key: "cancelled", label: "Cancelled", color: SERIES_COLORS[7], area: false },
];

const AOV_SERIES: Series[] = [{ key: "aov", label: "Average order value", color: SERIES_COLORS[0] }];

/** Revenue & profit share one money axis. */
export function RevenueProfitChart({ data }: { data: Point[] }) {
  return (
    <div className="space-y-3">
      <ChartLegend series={MONEY_SERIES} />
      <TrendChart data={data} series={MONEY_SERIES} format="money" height={280} />
    </div>
  );
}

/** Order counts get their own chart — never mixed with money. */
export function OrdersTrendChart({ data }: { data: Point[] }) {
  return (
    <div className="space-y-3">
      <ChartLegend series={ORDER_SERIES} />
      <TrendChart data={data} series={ORDER_SERIES} format="number" height={240} />
    </div>
  );
}

export function AovTrendChart({ data }: { data: Point[] }) {
  return <TrendChart data={data} series={AOV_SERIES} format="money" height={240} />;
}

export function MoneyBars({ data }: { data: { label: string; value: number }[] }) {
  return <HBarChart data={data} format="money" />;
}

export function MoneyDonut({ data, centerLabel }: { data: { label: string; value: number }[]; centerLabel?: string }) {
  return <DonutChart data={data} format="money" centerLabel={centerLabel} />;
}
