import { cn } from "cn";
import { StatusPill, type Tone } from "@/components/shared/status";
import type { CoverageResult } from "@/lib/inventory/coverage";

/** Shared, server-renderable inventory presentation helpers (no hooks). */

export type CoverageStatus = CoverageResult["status"];

export const COVERAGE_STATUS: Record<CoverageStatus, { label: string; tone: Tone }> = {
  OUT_OF_STOCK: { label: "Out of stock", tone: "danger" },
  CRITICAL: { label: "Critical", tone: "danger" },
  LOW: { label: "Low cover", tone: "warning" },
  HEALTHY: { label: "Healthy", tone: "success" },
  OVERSTOCKED: { label: "Overstocked", tone: "info" },
  NO_SALES: { label: "No recent sales", tone: "neutral" },
};

export function CoveragePill({ status, className }: { status: CoverageStatus; className?: string }) {
  const m = COVERAGE_STATUS[status];
  return (
    <StatusPill tone={m.tone} className={className}>
      {m.label}
    </StatusPill>
  );
}

/** Stock level relative to the variant's low-stock threshold. */
export function stockState(stock: number, threshold: number): { key: "out" | "low" | "ok"; label: string; tone: Tone } {
  if (stock <= 0) return { key: "out", label: "Out", tone: "danger" };
  if (stock <= threshold) return { key: "low", label: "Low", tone: "warning" };
  return { key: "ok", label: "In stock", tone: "neutral" };
}

export function formatCoverage(days: number | null) {
  if (days === null) return "—";
  if (days >= 365) return "365+ days";
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} ${days === 1 ? "day" : "days"}`;
}

const BAR_TONE: Record<Tone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
  neutral: "bg-muted-foreground/40",
  ai: "bg-ai",
  brand: "bg-brand",
};

/** Coverage days with a 0–30 day bar. Always paired with the number, never color alone. */
export function CoverageBar({ days, status, className, horizon = 30 }: { days: number | null; status: CoverageStatus; className?: string; horizon?: number }) {
  const pct = status === "OUT_OF_STOCK" ? 0 : days === null ? 100 : Math.max(4, Math.min(100, (days / horizon) * 100));
  return (
    <div className={cn("flex min-w-28 items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", BAR_TONE[COVERAGE_STATUS[status].tone])} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-16 shrink-0 text-right text-xs font-medium">{status === "OUT_OF_STOCK" ? "0 days" : formatCoverage(days)}</span>
    </div>
  );
}

const CHIP_TONE: Record<"out" | "low" | "ok", string> = {
  out: "border-danger/25 bg-danger-soft text-danger",
  low: "border-warning/25 bg-warning-soft text-warning",
  ok: "border-border bg-surface-2 text-foreground",
};

/** Compact "S 8 · M 42 · XXL 0" chips. Low/out chips carry a text marker, not just tone. */
export function SizeChips({ variants, className, max = 8 }: { variants: { id: string; title: string; size: string | null; stock: number; threshold: number }[]; className?: string; max?: number }) {
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Stock by size">
      {variants.slice(0, max).map((v) => {
        const s = stockState(v.stock, v.threshold);
        return (
          <li
            key={v.id}
            className={cn("inline-flex h-[22px] items-center gap-1 rounded-md border px-1.5 text-[11px] leading-none", CHIP_TONE[s.key])}
            title={`${v.size ?? v.title}: ${v.stock} in stock${s.key !== "ok" ? ` (${s.label.toLowerCase()})` : ""}`}
          >
            <span className={cn("font-medium", s.key === "ok" && "text-muted-foreground")}>{v.size ?? v.title}</span>
            <span className="tabular font-semibold">{Math.max(0, v.stock)}</span>
            {s.key !== "ok" && <span className="text-[9.5px] font-semibold tracking-wide uppercase opacity-80">{s.label}</span>}
          </li>
        );
      })}
      {variants.length > max && <li className="self-center text-[11px] text-muted-foreground">+{variants.length - max}</li>}
    </ul>
  );
}

/** One-line, evidence-first explanation of a variant's coverage. */
export function coverageSentence(i: { averageDailySales: number; stock: number; coverageDays: number | null; status: CoverageStatus }) {
  return `Average daily sales: ${i.averageDailySales} · Stock remaining: ${Math.max(0, i.stock)} · Estimated coverage: ${i.status === "OUT_OF_STOCK" ? "0 days" : formatCoverage(i.coverageDays)}`;
}
