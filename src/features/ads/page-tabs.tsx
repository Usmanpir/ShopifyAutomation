"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type PageTab = { value: string; label: string; count?: number; icon?: React.ReactNode };

/**
 * Page-level section tabs bound to `?tab=`. Real links (keeps other params such
 * as the date range), underline style, scrolls horizontally on mobile.
 */
export function PageTabs({ tabs, defaultValue, param = "tab", className, label = "Sections" }: { tabs: PageTab[]; defaultValue: string; param?: string; className?: string; label?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(param) ?? defaultValue;
  const hrefFor = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === defaultValue) next.delete(param);
    else next.set(param, value);
    for (const k of ["sort", "dir", "status", "page"]) next.delete(k);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  return (
    <nav aria-label={label} className={cn("scrollbar-thin -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = current === t.value;
          return (
            <li key={t.value}>
              <Link
                href={hrefFor(t.value)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center gap-1.5 rounded-t-md px-3 text-sm font-medium whitespace-nowrap transition-colors [&_svg]:size-4",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.icon}
                {t.label}
                {typeof t.count === "number" && <span className={cn("tabular rounded-full px-1.5 text-[11px] leading-4", active ? "bg-foreground text-background" : "bg-muted")}>{t.count}</span>}
                <span aria-hidden className={cn("absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors", active ? "bg-primary" : "bg-transparent")} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
