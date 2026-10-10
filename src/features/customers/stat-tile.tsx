import { cn } from "cn";

/** Stat tile with a sub-label (KpiCard only shows its comparison next to a % change). Server-safe. */
export function StatTile({ label, value, hint, icon, className }: { label: string; value: string; hint?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="tabular truncate text-xl leading-tight font-semibold tracking-tight sm:text-2xl" title={value}>
        {value}
      </p>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
