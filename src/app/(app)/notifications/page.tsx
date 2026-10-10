import { cn } from "cn";
import { Bell, Bot, Boxes, MessageCircle, Settings2, ShoppingBag, Target, User, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterTabs, SelectFilter } from "@/components/shared/url-controls";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { requireAuth } from "@/lib/auth/session";
import { listNotifications, notificationCounts } from "@/services/notification.service";

export const metadata = { title: "Notifications" };

const TYPES = [
  { value: "ORDER", label: "Orders", icon: ShoppingBag },
  { value: "INVENTORY", label: "Inventory", icon: Boxes },
  { value: "CUSTOMER", label: "Customers", icon: User },
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { value: "ADS", label: "Ads", icon: Target },
  { value: "AUTOMATION", label: "Automations", icon: Workflow },
  { value: "AI", label: "AI recommendations", icon: Bot },
  { value: "SYSTEM", label: "System", icon: Settings2 },
] as const satisfies readonly { value: string; label: string; icon: LucideIcon }[];

const querySchema = z.object({
  type: z.enum(TYPES.map((t) => t.value) as [string, ...string[]]).optional().catch(undefined),
  status: z.enum(["unread", "all", "archived"]).catch("all").default("all"),
});

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const auth = await requireAuth();
  const q = querySchema.parse(await searchParams);
  const type = q.type as (typeof TYPES)[number]["value"] | undefined;
  const [list, counts] = await Promise.all([
    listNotifications(auth.store.id, auth.user.id, { type, status: q.status, limit: 30 }),
    notificationCounts(auth.store.id, auth.user.id),
  ]);

  const typeHref = (t?: string) => {
    const p = new URLSearchParams();
    if (q.status !== "all") p.set("status", q.status);
    if (t) p.set("type", t);
    const s = p.toString();
    return s ? `/notifications?${s}` : "/notifications";
  };

  const navItems: { value?: string; label: string; icon: LucideIcon; count: number }[] = [
    { label: "All types", icon: Bell, count: counts.unread },
    ...TYPES.map((t) => ({ value: t.value, label: t.label, icon: t.icon, count: counts.unreadByType[t.value] ?? 0 })),
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description={counts.unread ? `You have ${counts.unread} unread notification${counts.unread === 1 ? "" : "s"}.` : "You're all caught up."}
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Notification types" className="hidden lg:block">
          <ul className="sticky top-20 space-y-0.5">
            {navItems.map((t) => {
              const active = type === t.value;
              return (
                <li key={t.label}>
                  <Link
                    href={typeHref(t.value)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition",
                      active ? "bg-card font-medium text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <t.icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{t.label}</span>
                    {t.count > 0 && (
                      <span className="tabular rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
                        {t.count}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <FilterTabs
              param="status"
              tabs={[
                { value: "all", label: "All", count: counts.all },
                { value: "unread", label: "Unread", count: counts.unread },
                { value: "archived", label: "Archived", count: counts.archived },
              ]}
            />
            <SelectFilter param="type" placeholder="All types" className="lg:hidden" options={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </div>
          <NotificationCenter
            key={`${type ?? "any"}-${q.status}`}
            initial={JSON.parse(JSON.stringify(list.items))}
            initialCursor={list.nextCursor}
            type={type}
            status={q.status}
            timeZone={auth.store.timezone}
            unreadTotal={counts.unread}
          />
        </div>
      </div>
    </PageContainer>
  );
}
