"use client";

import { cn } from "cn";
import { Menu, MoreHorizontal, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCan, useStore } from "@/components/store-context";
import { AiCommandBar } from "./ai-command-bar";
import { CommandPalette } from "./command-palette";
import { MOBILE_NAV } from "./nav";
import { NotificationsPopover } from "./notifications-popover";
import { QuickCreate } from "./quick-create";
import { isActive, SidebarContent } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { useShellCounts } from "./use-shell-counts";
import { UserMenu } from "./user-menu";

const COLLAPSE_KEY = "cai.sidebar.collapsed";

/** Persisted sidebar preference (localStorage), SSR-safe via useSyncExternalStore. */
const collapseListeners = new Set<() => void>();
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function useCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    (cb) => {
      collapseListeners.add(cb);
      return () => collapseListeners.delete(cb);
    },
    readCollapsed,
    () => false,
  );
  const toggle = () => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      /* storage unavailable */
    }
    collapseListeners.forEach((l) => l());
  };
  return [collapsed, toggle];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, toggle] = useCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { store } = useStore();

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block print:hidden",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={toggle} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 print:hidden items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition hover:border-foreground/15 hover:text-foreground sm:w-56 lg:w-64"
            aria-label="Search (Ctrl K)"
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">Search anything…</span>
            <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <AiCommandBar className="mx-auto hidden w-full max-w-md md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {store.demoMode && (
              <Link href="/settings/general#demo" className="mr-1 hidden rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning sm:inline-block">
                Demo mode
              </Link>
            )}
            <QuickCreate />
            <NotificationsPopover />
            <ThemeToggle />
            <div className="ml-1">
              <UserMenu />
            </div>
          </div>
        </header>

        <main id="main" className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      <MobileBottomNav onMore={() => setMobileOpen(true)} />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const can = useCan();
  const { data: counts } = useShellCounts();
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 print:hidden border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      {MOBILE_NAV.filter((i) => !i.permission || can(i.permission)).map((item) => {
        const active = isActive(pathname, item);
        const count = item.badge ? counts?.[item.badge] : 0;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
            <item.icon className={cn("size-5", item.href === "/assistant" && !active && "text-ai")} />
            {item.label}
            {!!count && <span className="absolute top-1 left-[calc(50%+6px)] grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground">{count > 9 ? "9+" : count}</span>}
          </Link>
        );
      })}
      <button type="button" onClick={onMore} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium text-muted-foreground">
        <MoreHorizontal className="size-5" />
        More
      </button>
    </nav>
  );
}
