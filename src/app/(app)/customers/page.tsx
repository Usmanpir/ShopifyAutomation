import { Crown, Repeat, Users, Wallet } from "lucide-react";
import { StatTile } from "@/features/customers/stat-tile";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterTabs, Pagination, SearchInput, SelectFilter } from "@/components/shared/url-controls";
import { CustomersTable } from "@/features/customers/customers-table";
import { requireAuth } from "@/lib/auth/session";
import { makeFormatter } from "@/lib/formatter";
import { customerListQuery, customerStats, listCustomers } from "@/services/customer.service";
import { listSegments } from "@/services/segment.service";

export const metadata = { title: "Customers" };

const icon = (Icon: typeof Users) => <Icon className="size-4 text-muted-foreground" aria-hidden />;

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const auth = await requireAuth("customers.view");
  const q = customerListQuery.parse(await searchParams);
  const f = makeFormatter(auth.store);
  const [list, stats, segments] = await Promise.all([listCustomers(auth.store.id, q), customerStats(auth.store.id), listSegments(auth.store.id)]);

  const tabs = [
    { value: "all", label: "All", count: stats.total },
    ...segments.filter((s) => s.customerCount > 0 || s.key === q.segment).map((s) => ({ value: s.key, label: s.name, count: s.customerCount })),
  ];

  return (
    <PageContainer>
      <PageHeader title="Customers" description="Your customer base, auto-segmented by AI from orders, returns and WhatsApp activity." />

      <section aria-label="Customer metrics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Total customers" value={f.number(stats.total)} hint={`${f.number(stats.newThisMonth)} new in 30 days`} icon={icon(Users)} />
        <StatTile label="VIP customers" value={f.number(stats.vip)} hint={stats.total ? `${((stats.vip / stats.total) * 100).toFixed(1)}% of customers` : undefined} icon={icon(Crown)} />
        <StatTile label="Repeat rate" value={`${stats.repeatRate.toFixed(1)}%`} hint="of buyers ordered 2+ times" icon={icon(Repeat)} />
        <StatTile label="Avg. lifetime value" value={f.money(stats.avgLtv)} hint={`across ${f.number(stats.buyers)} buyers`} icon={icon(Wallet)} />
      </section>

      <div className="space-y-3">
        <FilterTabs tabs={tabs} param="segment" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput placeholder="Search name, email, phone or city" className="sm:max-w-sm sm:flex-1" />
          <div className="flex gap-2">
            <SelectFilter
              param="risk"
              placeholder="All risk levels"
              className="flex-1 sm:flex-none"
              options={[
                { value: "LOW", label: "Low risk" },
                { value: "MEDIUM", label: "Medium risk" },
                { value: "HIGH", label: "High risk" },
              ]}
            />
            <SelectFilter
              param="status"
              placeholder="All statuses"
              className="flex-1 sm:flex-none"
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "BLOCKED", label: "Blocked" },
              ]}
            />
          </div>
        </div>
      </div>

      <CustomersTable rows={JSON.parse(JSON.stringify(list.items))} filtered={!!(q.q || q.segment || q.risk || q.status)} />
      <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} />    </PageContainer>
  );
}
