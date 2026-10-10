import { cn } from "cn";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "./sparkline";

/**
 * Stat tile: label · value · delta (signed, vs a named period, colored by
 * direction × whether up is good) · sparkline. Icons back up the color.
 */
export function KpiCard({
  label,
  value,
  change,
  comparison,
  spark,
  invert = false,
  className,
  icon,
}: {
  label: string;
  value: string;
  change?: number | null;
  comparison?: string;
  spark?: number[];
  invert?: boolean;
  className?: string;
  icon?: React.ReactNode;
}) {
  const hasChange = typeof change === "number" && Number.isFinite(change);
  const flat = hasChange && Math.abs(change!) < 0.05;
  const up = hasChange && change! > 0;
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("group relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-foreground/12 hover:shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="truncate text-xl leading-tight font-semibold tracking-tight sm:text-2xl" title={value}>
        {value}
      </p>
      <div className="flex items-end justify-between gap-2">
        {hasChange ? (
          <div className="min-w-0 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1 py-px font-semibold",
                good === null ? "bg-muted text-muted-foreground" : good ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              <span className="tabular">{Math.abs(change!).toFixed(1)}%</span>
              <span className="sr-only">{up ? "increase" : "decrease"}</span>
            </span>
          </div>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 && <Sparkline data={spark} className="h-8 w-16 shrink-0 text-chart-1 sm:w-20" />}
      </div>
      {/* Own line so it never competes with the sparkline for width. */}
      {comparison && <p className="-mt-1 truncate text-xs text-muted-foreground">{comparison}</p>}
    </div>
  );
}
