import { cn } from "cn";
import Link from "next/link";

export type SegmentItem = { href: string; label: string; active: boolean; icon?: React.ReactNode; count?: number; tone?: "warning" | "danger" };

/** Link-based segmented control for switching views (server-rendered). */
export function SegmentedNav({ items, label, className }: { items: SegmentItem[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("scrollbar-thin flex max-w-full overflow-x-auto", className)}>
      <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-[3px]">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={it.active ? "page" : undefined}
            scroll={false}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition [&_svg]:size-3.5",
              it.active ? "bg-card text-foreground shadow-sm dark:bg-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.icon}
            {it.label}
            {typeof it.count === "number" && it.count > 0 && (
              <span className={cn("tabular rounded-full px-1.5 text-[10.5px] leading-4", it.tone === "danger" ? "bg-danger-soft text-danger" : it.tone === "warning" ? "bg-warning-soft text-warning" : "bg-foreground/8")}>
                {it.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
