import { cn } from "cn";
import Link from "next/link";

/** Compact stat: label · value · hint. Optional link makes the whole tile clickable. */
export function StatTile({ label, value, hint, icon, href, valueClassName }: { label: string; value: string; hint?: string; icon?: React.ReactNode; href?: string; valueClassName?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] leading-4 font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={cn("tabular mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl", valueClassName)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = "block rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
  return href ? (
    <Link href={href} className={cn(cls, "transition hover:border-foreground/15 hover:shadow-sm")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
