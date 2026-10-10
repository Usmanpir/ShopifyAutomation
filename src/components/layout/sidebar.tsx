"use client";

import { cn } from "cn";
import { HelpCircle, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCan, useStore } from "@/components/store-context";
import { initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/rbac";
import { BrandMark } from "./brand-mark";
import { ASSISTANT_ITEM, NAV, navActive, navVisible, type NavItem } from "./nav";
import { useShellCounts } from "./use-shell-counts";

export function isActive(pathname: string, item: Pick<NavItem, "href" | "match">) {
  return navActive(pathname, item);
}

function NavLink({ item, collapsed, count, onNavigate }: { item: NavItem; collapsed: boolean; count?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8.5 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium text-sidebar-foreground/80 transition-colors outline-none",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-sidebar-primary" />}
      <Icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!!count && count > 0 && (
        <span
          className={cn(
            "tabular rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-semibold text-primary",
            collapsed ? "absolute -top-0.5 -right-0.5 grid size-4 place-items-center bg-primary p-0 text-[9px] text-primary-foreground" : "ml-auto",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarContent({ collapsed = false, onToggle, onNavigate }: { collapsed?: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const can = useCan();
  const { user, role, store } = useStore();
  const { data: counts } = useShellCounts();

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center px-4", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" onClick={onNavigate} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <BrandMark withName={!collapsed} />
        </Link>
      </div>

      <nav aria-label="Main" className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 py-1">
        {NAV.map((section, i) => {
          const items = section.items.filter((it) => navVisible(it, can));
          if (!items.length) return null;
          return (
            <div key={i} className="space-y-0.5">
              {section.label && !collapsed && <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-sidebar-foreground/45 uppercase">{section.label}</p>}
              {i > 0 && !section.label && <div className={cn("mb-3 h-px bg-sidebar-border", collapsed ? "mx-2" : "mx-2.5")} />}
              {items.map((item) => (
                <NavLink key={item.href} item={item} collapsed={collapsed} count={item.badge ? counts?.[item.badge] : undefined} onNavigate={onNavigate} />
              ))}
            </div>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-sidebar-border px-3 py-3">
        {can("ai.use") && (
          <Link
            href={ASSISTANT_ITEM.href}
            onClick={onNavigate}
            className={cn(
              "group flex h-9 items-center gap-3 rounded-lg bg-ai-gradient px-2.5 text-[13.5px] font-medium text-sidebar-accent-foreground ring-1 ring-ai/15 transition hover:ring-ai/35",
              collapsed && "justify-center px-0",
            )}
          >
            <ASSISTANT_ITEM.icon className="size-[18px] text-ai" />
            {!collapsed && <span>AI Assistant</span>}
            {!collapsed && <kbd className="ml-auto rounded border border-sidebar-border bg-background/60 px-1.5 text-[10px] text-muted-foreground">⌘J</kbd>}
          </Link>
        )}
        <Link
          href="/help"
          onClick={onNavigate}
          className={cn("flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent", collapsed && "justify-center px-0")}
        >
          <HelpCircle className="size-[18px] text-sidebar-foreground/60" />
          {!collapsed && <span>Help</span>}
        </Link>
        <Link
          href="/settings/account"
          onClick={onNavigate}
          className={cn("mt-1 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent", collapsed && "justify-center px-0")}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-[12px] font-semibold text-primary">{initials(user.name)}</span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-medium">{user.name}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">
                {ROLE_LABELS[role]} · {store.name}
              </span>
            </span>
          )}
        </Link>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn("flex h-8 w-full items-center gap-3 rounded-lg px-2.5 text-[12.5px] text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground", collapsed && "justify-center px-0")}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && "Collapse"}
          </button>
        )}
      </div>
    </div>
  );
}
