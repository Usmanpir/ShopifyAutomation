import { cn } from "cn";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterTabs, Pagination } from "@/components/shared/url-controls";
import { LetAiConfirmButton, NewOrderButton } from "@/features/orders/order-header-actions";
import { OrdersTable } from "@/features/orders/orders-table";
import { SmartOrderFilter } from "@/features/orders/smart-filter";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { actionableCodCount } from "@/services/confirmation-assist.service";
import { listOrders, orderListQuery, ordersToday, orderTabCounts } from "@/services/order.service";

export const metadata = { title: "Orders" };

const FILTER_KEYS = ["q", "payment", "risk", "city", "days", "min", "max", "late", "confirmation", "customerId"] as const;

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const auth = await requireAuth("orders.view");
  const sp = await searchParams;
  const storeId = auth.store.id;
  const [counts, today, codPending, shopify] = await Promise.all([
    orderTabCounts(storeId),
    ordersToday(storeId),
    actionableCodCount(storeId),
    db.shopifyConnection.findUnique({ where: { storeId }, select: { shopDomain: true, uninstalledAt: true } }),
  ]);
  // Open on the work queue when there is work; otherwise show everything.
  const defaultTab = counts.attention > 0 ? "attention" : "all";
  const q = orderListQuery.parse({ ...sp, tab: sp.tab ?? defaultTab });
  const list = await listOrders(storeId, q);
  const canUpdate = can(auth.role, "orders.update");

  const tabs = [
    { value: "attention", label: "Needs attention", count: counts.attention, tone: "warning" as const },
    { value: "all", label: "All", count: counts.all },
    { value: "to_ship", label: "Processing", count: counts.to_ship },
    { value: "shipped", label: "Shipped", count: counts.shipped },
    { value: "delivered", label: "Delivered", count: counts.delivered },
    { value: "returned", label: "Returns", count: counts.returned },
  ];
  // Older tab links (e.g. ?tab=high_risk, ?tab=cancelled) keep working; they show as a filter chip.
  const strip = [
    { label: "New today", value: today.placed, href: "/orders?tab=all&days=1" },
    { label: "To confirm", value: today.toConfirm, href: "/orders?tab=attention&confirmation=awaiting", tone: today.toConfirm ? "text-warning" : undefined },
    { label: "Ready to ship", value: today.toShip, href: "/orders?tab=to_ship" },
    { label: "Shipped today", value: today.shipped, href: "/orders?tab=shipped" },
    { label: "Delivered today", value: today.delivered, href: "/orders?tab=delivered" },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Orders"
        description="Every order is risk-checked by the Order Assistant and confirmed on WhatsApp before dispatch."
        actions={
          <>
            {(auth.store.demoMode || shopify) && canUpdate && <NewOrderButton demo={auth.store.demoMode} shopDomain={shopify && !shopify.uninstalledAt ? shopify.shopDomain : null} />}
            {canUpdate && codPending > 0 && <LetAiConfirmButton count={codPending} />}
          </>
        }
      />

      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        {strip.map((s, i) => (
          <Link key={s.label} href={s.href} className={cn("rounded-xl border bg-card px-3 py-2.5 transition hover:border-foreground/15 sm:px-4", i > 2 && "hidden sm:block")}>
            <dt className="truncate text-[12px] text-muted-foreground">{s.label}</dt>
            <dd className={cn("tabular mt-0.5 text-lg font-semibold", s.tone)}>{s.value}</dd>
          </Link>
        ))}
      </dl>

      <div className="space-y-3">
        <FilterTabs tabs={tabs} defaultValue={defaultTab} />
        <SmartOrderFilter visibleTabs={tabs.map((t) => t.value)} />
      </div>
      <OrdersTable
        rows={JSON.parse(JSON.stringify(list.items))}
        total={list.total}
        canUpdate={canUpdate}
        canCancel={can(auth.role, "orders.cancel")}
        filtered={FILTER_KEYS.some((k) => !!sp[k]) || q.tab !== "all"}
      />
      <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} />
    </PageContainer>
  );
}
