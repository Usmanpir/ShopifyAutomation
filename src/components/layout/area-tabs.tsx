"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useCan } from "@/components/store-context";
import type { Permission } from "@/lib/rbac";
import { useShellCounts } from "./use-shell-counts";

type AreaTab = {
  label: string;
  href: string;
  permission?: Permission;
  badge?: "approvals";
  /** Active when the path matches and (optionally) ?tab equals this value. */
  path: string;
  tab?: string | null;
  prefix?: boolean;
};

/**
 * Second-level navigation inside one sidebar area. Each area folds several
 * older pages under one name (e.g. Products → Catalog · Inventory) so the
 * sidebar stays short while every existing URL keeps working.
 */
const AREAS: Record<string, AreaTab[]> = {
  products: [
    { label: "Catalog", href: "/products", path: "/products", prefix: true, permission: "products.view" },
    { label: "Inventory & forecast", href: "/inventory", path: "/inventory", permission: "inventory.view" },
  ],
  marketing: [
    { label: "Overview", href: "/marketing", path: "/marketing", tab: null, permission: "marketing.view" },
    { label: "Meta Ads", href: "/ads", path: "/ads", prefix: true, permission: "ads.view" },
    { label: "WhatsApp campaigns", href: "/marketing?tab=campaigns", path: "/marketing", tab: "campaigns", permission: "marketing.view" },
    { label: "Segments", href: "/marketing?tab=segments", path: "/marketing", tab: "segments", permission: "marketing.view" },
    { label: "Promotions", href: "/marketing?tab=promotions", path: "/marketing", tab: "promotions", permission: "marketing.view" },
  ],
  ai: [
    { label: "AI Team", href: "/ai", path: "/ai", tab: null, permission: "approvals.view" },
    { label: "Approvals", href: "/approvals", path: "/approvals", permission: "approvals.view", badge: "approvals" },
    { label: "Activity", href: "/agents/activity", path: "/agents/activity", permission: "approvals.view" },
    { label: "Knowledge", href: "/ai?tab=knowledge", path: "/ai", tab: "knowledge", permission: "approvals.view" },
    { label: "Trust Center", href: "/ai?tab=trust", path: "/ai", tab: "trust", permission: "approvals.view" },
  ],
  analytics: [
    { label: "Overview", href: "/analytics", path: "/analytics", permission: "analytics.view" },
    { label: "Daily report", href: "/reports/daily", path: "/reports/daily", permission: "reports.view" },
    { label: "Reports", href: "/reports", path: "/reports", permission: "reports.view" },
  ],
};

export type AreaKey = keyof typeof AREAS;

export function AreaTabs({ area, className }: { area: AreaKey; className?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const can = useCan();
  const { data: counts } = useShellCounts();
  // Live counts only after hydration (the server never has them).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const tabs = AREAS[area]!.filter((t) => !t.permission || can(t.permission));
  if (tabs.length < 2) return null;
  const currentTab = params.get("tab");
  const isOn = (t: AreaTab) => {
    const pathOk = t.prefix ? pathname === t.path || pathname.startsWith(t.path + "/") : pathname === t.path;
    if (!pathOk) return false;
    if (t.tab === undefined) return true;
    // Unknown ?tab values on a page fall back to its default (tab: null) entry.
    const known = tabs.filter((x) => x.path === t.path && x.tab).map((x) => x.tab);
    return t.tab === null ? !currentTab || !known.includes(currentTab) : currentTab === t.tab;
  };
  // A more specific match (e.g. /reports/daily) wins over its parent (/reports).
  const active = tabs.filter(isOn).sort((a, b) => b.path.length - a.path.length)[0];

  return (
    <nav aria-label="Section" className={cn("scrollbar-thin -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0 print:hidden", className)}>
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const on = t === active;
          const n = t.badge && mounted ? counts?.[t.badge] : undefined;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative flex h-10 items-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap transition-colors", on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t.label}
                {!!n && <span className="tabular rounded-full bg-ai-soft px-1.5 text-[11px] leading-4 font-semibold text-ai">{n}</span>}
                <span aria-hidden className={cn("absolute inset-x-2 -bottom-px h-0.5 rounded-full", on ? "bg-primary" : "bg-transparent")} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
