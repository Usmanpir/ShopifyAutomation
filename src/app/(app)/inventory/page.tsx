import { Boxes, Flame, PackageX, Snail, TriangleAlert, Warehouse } from "lucide-react";
import { z } from "zod";
import { AreaTabs } from "@/components/layout/area-tabs";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterTabs, SearchInput, SelectFilter } from "@/components/shared/url-controls";
import { CoverageForecast, type ForecastItem } from "@/features/inventory/coverage-forecast";
import { InventoryList } from "@/features/inventory/inventory-list";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { inventoryOverview, urgencyRank } from "@/services/inventory.service";
import { listCategories } from "@/services/product.service";

export const metadata = { title: "Inventory" };

const inventoryQuery = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["low", "out", "critical", "fast", "slow"]).optional().catch(undefined),
  category: z.string().max(60).optional().catch(undefined),
});

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const auth = await requireAuth("inventory.view");
  const q = inventoryQuery.parse(await searchParams);
  const [data, categories] = await Promise.all([inventoryOverview(auth.store.id, q), listCategories(auth.store.id)]);
  const { kpis, rows, tabCounts } = data;
  const canAdjust = can(auth.role, "inventory.update");

  // Five most urgent variants that are actually selling (out-of-stock with no demand isn't actionable).
  const forecast: ForecastItem[] = rows
    .flatMap((p) => p.variants.map((v) => ({ p, v })))
    .filter(({ v }) => v.coverage.averageDailySales > 0 && ["OUT_OF_STOCK", "CRITICAL", "LOW"].includes(v.coverage.status))
    .sort((a, b) => urgencyRank(a.v) - urgencyRank(b.v))
    .slice(0, 5)
    .map(({ p, v }) => ({
      variantId: v.id,
      productId: p.id,
      productTitle: p.title,
      variantTitle: [v.size, v.color].filter(Boolean).join(" / ") || v.title,
      imageUrl: p.imageUrl,
      stock: v.stock,
      averageDailySales: v.coverage.averageDailySales,
      coverageDays: v.coverage.coverageDays,
      velocityMultiplier: v.coverage.velocityMultiplier,
      status: v.coverage.status,
      reorder: v.reorder,
    }));

  const tabs = [
    { value: "all", label: "All", count: tabCounts.all },
    { value: "critical", label: "Critical cover", count: tabCounts.critical, tone: "danger" as const },
    { value: "low", label: "Low stock", count: tabCounts.low, tone: "warning" as const },
    { value: "out", label: "Out of stock", count: tabCounts.out, tone: "danger" as const },
    { value: "fast", label: "Fast selling", count: tabCounts.fast },
    { value: "slow", label: "Slow selling", count: tabCounts.slow },
  ];

  const icon = (Icon: typeof Boxes, tone: string) => (
    <span className={`grid size-7 place-items-center rounded-md ${tone}`}>
      <Icon className="size-4" aria-hidden />
    </span>
  );

  return (
    <PageContainer wide>
      <PageHeader title="Products" description="Stock coverage for every variant, forecast from recent sales — so you reorder before you sell out." />
      <AreaTabs area="products" className="-mt-2" />

      <section aria-label="Inventory metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <KpiCard label="Total products" value={kpis.totalProducts.toLocaleString()} icon={icon(Boxes, "bg-muted text-muted-foreground")} />
        <KpiCard label="Units on hand" value={kpis.totalUnits.toLocaleString()} icon={icon(Warehouse, "bg-muted text-muted-foreground")} />
        <KpiCard label="Low stock" value={kpis.lowStock.toLocaleString()} icon={icon(TriangleAlert, "bg-warning-soft text-warning")} />
        <KpiCard label="Out of stock" value={kpis.outOfStock.toLocaleString()} icon={icon(PackageX, "bg-danger-soft text-danger")} />
        <KpiCard label="Fast selling" value={kpis.fastSelling.toLocaleString()} icon={icon(Flame, "bg-success-soft text-success")} />
        <KpiCard label="Slow selling" value={kpis.slowSelling.toLocaleString()} icon={icon(Snail, "bg-info-soft text-info")} />
      </section>

      <CoverageForecast items={forecast} canAdjust={canAdjust} />

      <div className="space-y-3">
        <FilterTabs tabs={tabs} param="status" />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput placeholder="Search products" className="sm:max-w-sm sm:flex-1" />
          <SelectFilter param="category" placeholder="All categories" options={categories.map((c) => ({ value: c.slug, label: c.name }))} />
        </div>
      </div>

      <InventoryList rows={JSON.parse(JSON.stringify(rows))} canAdjust={canAdjust} filtered={!!(q.q || q.status || q.category)} />
    </PageContainer>
  );
}
