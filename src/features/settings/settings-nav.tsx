"use client";

import { cn } from "cn";
import { ArrowUpRight, Bell, Blocks, Bot, Settings2, ShieldCheck, UserRound, Users, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/settings/general", label: "General", icon: Settings2 },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/ai", label: "AI", icon: Bot },
  { href: "/settings/automation", label: "Automation", icon: Workflow },
  { href: "/integrations", label: "Integrations", icon: Blocks, external: true },
  { href: "/settings/security", label: "Security", icon: ShieldCheck },
  { href: "/settings/account", label: "Account", icon: UserRound },
];

/** Vertical sub-navigation on desktop, horizontally scrolling tabs on mobile. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 border-b pb-px lg:flex-col lg:border-b-0 lg:pb-0">
        {ITEMS.map((it) => {
          const active = !it.external && pathname.startsWith(it.href);
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  "max-lg:rounded-none max-lg:px-2.5 max-lg:after:absolute max-lg:after:inset-x-2 max-lg:after:-bottom-px max-lg:after:h-0.5 max-lg:after:rounded-full",
                  active
                    ? "text-foreground lg:bg-card lg:shadow-[0_1px_2px_rgba(16,24,40,0.06)] lg:ring-1 lg:ring-border max-lg:after:bg-primary"
                    : "text-muted-foreground hover:text-foreground lg:hover:bg-muted/60",
                )}
              >
                <it.icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} aria-hidden />
                {it.label}
                {it.external && <ArrowUpRight className="ml-auto size-3.5 opacity-50" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
