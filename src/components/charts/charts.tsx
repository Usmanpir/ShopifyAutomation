"use client";

import { cn } from "cn";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { useFormat } from "@/components/store-context";

/** Categorical slots in fixed order (validated palette — see globals.css). Never cycled by rank. */
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];

export type ValueFormat = "money" | "number" | "percent" | "ratio";
export type Series = { key: string; label: string; color: string; area?: boolean };

function useValueFormatter() {
  const f = useFormat();
  return (v: number, format: ValueFormat, compact = false) =>
    format === "money" ? f.money(v, { compact }) : format === "percent" ? `${v.toFixed(1)}%` : format === "ratio" ? `${v.toFixed(2)}×` : f.number(v, compact);
}

function shortDate(d: string) {
  const dt = new Date(d + "T12:00:00Z");
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function ChartLegend({ series, className }: { series: { label: string; color: string }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground", className)}>
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span aria-hidden className="h-[3px] w-3.5 rounded-full" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color: string }[] }) {
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2.5 text-[12.5px] shadow-lg">
      <p className="mb-1.5 font-medium text-foreground">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="tabular font-semibold text-foreground">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Time-series chart (one y-axis, one unit). First series can be an area wash;
 * others are 2px lines. Crosshair tooltip shows every series.
 */
export function TrendChart({
  data,
  series,
  format,
  height = 280,
  xKey = "date",
  className,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  format: ValueFormat;
  height?: number;
  xKey?: string;
  className?: string;
}) {
  const fmt = useValueFormatter();
  const gid = useId().replace(/:/g, "");
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.14} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey} tickFormatter={shortDate} tick={{ fill: "var(--chart-axis)", fontSize: 11.5 }} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} minTickGap={28} />
          <YAxis tickFormatter={(v: number) => fmt(v, format, true)} tick={{ fill: "var(--chart-axis)", fontSize: 11.5 }} tickLine={false} axisLine={false} width={76} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            content={(p: TooltipContentProps<ValueType, NameType>) =>
              p.active && p.payload?.length ? (
                <TooltipCard
                  title={shortDate(String(p.label))}
                  rows={series.map((s) => ({ label: s.label, color: s.color, value: fmt(Number(p.payload!.find((x) => x.dataKey === s.key)?.value ?? 0), format) }))}
                />
              ) : null
            }
          />
          {series.map((s, i) =>
            s.area !== false && i === 0 ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#${gid}-${i})`} activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive animationDuration={600} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive animationDuration={600} />
            ),
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars (≤24px, rounded data-end, value at the tip). Single series → single color. */
export function HBarChart({
  data,
  format,
  color = SERIES_COLORS[0],
  height,
  labelWidth = 150,
  className,
}: {
  data: { label: string; value: number }[];
  format: ValueFormat;
  color?: string;
  height?: number;
  /** Width of the category label column (px). */
  labelWidth?: number;
  className?: string;
}) {
  const fmt = useValueFormatter();
  const h = height ?? Math.max(120, data.length * 36 + 16);
  const maxChars = Math.max(8, Math.floor(labelWidth / 7));
  return (
    <div className={className} style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={labelWidth} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => (v.length > maxChars ? v.slice(0, maxChars - 1) + "…" : v)} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={(p: TooltipContentProps<ValueType, NameType>) =>
              p.active && p.payload?.length ? <TooltipCard title={String(p.label)} rows={[{ label: "Value", color, value: fmt(Number(p.payload[0].value), format) }]} /> : null
            }
          />
          <Bar dataKey="value" fill={color} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive animationDuration={600}>
            <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v), format, true)} style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 500 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical columns for a category or day series. */
export function ColumnChart({ data, format, color = SERIES_COLORS[0], height = 220, xFormatter, className }: { data: { label: string; value: number }[]; format: ValueFormat; color?: string; height?: number; xFormatter?: (v: string) => string; className?: string }) {
  const fmt = useValueFormatter();
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickFormatter={xFormatter ?? ((v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? shortDate(v) : v))} tick={{ fill: "var(--chart-axis)", fontSize: 11.5 }} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} minTickGap={16} />
          <YAxis tickFormatter={(v: number) => fmt(v, format, true)} tick={{ fill: "var(--chart-axis)", fontSize: 11.5 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={(p: TooltipContentProps<ValueType, NameType>) =>
              p.active && p.payload?.length ? <TooltipCard title={/^\d{4}-/.test(String(p.label)) ? shortDate(String(p.label)) : String(p.label)} rows={[{ label: "Value", color, value: fmt(Number(p.payload[0].value), format) }]} /> : null
            }
          />
          <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut with a 2px surface gap between segments and a legend list beside it. */
export function DonutChart({ data, format, centerLabel, className }: { data: { label: string; value: number }[]; format: ValueFormat; centerLabel?: string; className?: string }) {
  const fmt = useValueFormatter();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row", className)}>
      <div className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="100%" stroke="var(--card)" strokeWidth={2} paddingAngle={0} isAnimationActive animationDuration={600}>
              {data.map((d, i) => (
                <Cell key={d.label} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={(p: TooltipContentProps<ValueType, NameType>) =>
                p.active && p.payload?.length ? (
                  <TooltipCard title={String(p.payload[0].name)} rows={[{ label: "Value", color: String(p.payload[0].payload?.fill ?? SERIES_COLORS[0]), value: `${fmt(Number(p.payload[0].value), format)} · ${((Number(p.payload[0].value) / total) * 100).toFixed(0)}%` }]} />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-base font-semibold">{fmt(total, format, true)}</p>
              <p className="text-[11px] text-muted-foreground">{centerLabel}</p>
            </div>
          </div>
        )}
      </div>
      <ul className="w-full min-w-0 space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="tabular shrink-0 font-medium">
              {fmt(d.value, format, true)} <span className="text-muted-foreground">· {((d.value / total) * 100).toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
