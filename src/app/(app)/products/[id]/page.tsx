import { CheckCircle2, Lightbulb, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ColumnChart } from "@/components/charts/charts";
import { InsightCard } from "@/components/shared/insight-card";
import { KpiCard } from "@/components/shared/kpi-card";
import { DefinitionList, PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { ProductImage } from "@/components/shared/product-image";
import { ORDER_STATUS, Pill } from "@/components/shared/status";
import { CoveragePill, coverageSentence } from "@/features/inventory/coverage-meta";
import { PRODUCT_STATUS } from "@/features/products/product-meta";
import { ProductIntelligence } from "@/features/products/product-intelligence";
import { ProductSettings } from "@/features/products/product-settings";
import { VariantMatrix } from "@/features/products/variant-matrix";
import { requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { getProductInventory } from "@/services/inventory.service";
import { getProductDetail, listCategories, listProductInsights, productIntelligence } from "@/services/product.service";
import { TimeAgo } from "@/components/shared/time-ago";

async function load(storeId: string, id: string) {
  try {
    return await getProductDetail(storeId, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  const auth = await requireAuth("products.view");
  const p = await getProductDetail(auth.store.id, id).catch(() => null);
  return { title: p?.title ?? "Product" };
}

export default async function ProductDetailPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  const auth = await requireAuth("products.view");
  const storeId = auth.store.id;
  const f = makeFormatter(auth.store);
  const product = await load(storeId, id);
  const [inventory, insights, categories, intel] = await Promise.all([
    getProductInventory(storeId, id),
    listProductInsights(storeId, id),
    listCategories(storeId),
    productIntelligence(storeId, id),
  ]);

  const canAdjust = can(auth.role, "inventory.update");
  const units30 = product.salesDaily.reduce((s, d) => s + d.units, 0);
  const urgent = inventory.mostUrgent;
  const sellingVariants = inventory.variants.filter((v) => v.coverage.averageDailySales > 0);
  const totalDaily = Math.round(inventory.variants.reduce((s, v) => s + v.coverage.averageDailySales, 0) * 10) / 10;
  const variantName = (v: { size: string | null; color: string | null; title: string }) => [v.size, v.color].filter(Boolean).join(" / ") || v.title;

  return (
    <PageContainer wide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <ProductImage src={product.imageUrl} alt={product.title} className="size-20 sm:size-24" rounded="rounded-xl" />
        <PageHeader
          className="min-w-0 flex-1"
          crumbs={[{ label: "Products", href: "/products" }, ...(product.category ? [{ label: product.category.name, href: `/products?category=${product.category.slug}` }] : [])]}
          title={product.title}
          eyebrow={
            <div className="flex flex-wrap items-center gap-2">
              <Pill map={PRODUCT_STATUS} value={product.status} />
              <span className="text-xs text-muted-foreground">
                {product.variants.length} variant{product.variants.length === 1 ? "" : "s"}
                {product.vendor ? ` · ${product.vendor}` : ""} · updated <TimeAgo date={product.updatedAt} />
              </span>
            </div>
          }
          actions={
            can(auth.role, "ai.use") ? (
              <Button asChild variant="outline" className="h-9 bg-card">
                <Link href={`/assistant?q=${encodeURIComponent(`How is ${product.title} performing and what should I do about its stock?`)}`}>
                  <Sparkles className="text-ai" /> Ask AI
                </Link>
              </Button>
            ) : null
          }
        />
      </div>

      <section aria-label="Product metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <KpiCard label="Price" value={f.money(product.price)} />
        <KpiCard label="Revenue" value={f.money(product.revenue, { compact: true })} />
        <KpiCard label="Units sold" value={f.number(product.unitsSold)} />
        <KpiCard label="Conversion" value={`${product.conversionRate.toFixed(1)}%`} />
        <KpiCard label="Return rate" value={`${product.returnRate.toFixed(1)}%`} />
        <KpiCard label="Total stock" value={f.number(Math.max(0, product.totalInventory))} />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <SectionCard title="Sales" description={`Units sold per day · last 30 days · ${f.number(units30)} total`}>
            {units30 > 0 ? (
              <ColumnChart data={product.salesDaily.map((d) => ({ label: d.date, value: d.units }))} format="number" height={220} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">No sales in the last 30 days.</p>
            )}
          </SectionCard>

          <SectionCard title="Variants & stock" description="Stock by size and colour, with coverage at the current sales pace">
            <VariantMatrix productTitle={product.title} sizes={product.matrix.sizes} colors={product.matrix.colors} variants={JSON.parse(JSON.stringify(inventory.variants))} canAdjust={canAdjust} />
          </SectionCard>

          <SectionCard title="Recent orders" description="Latest orders containing this product" contentClassName="px-0 pb-0">
            {product.recentOrders.length ? (
              <ul className="divide-y border-t">
                {product.recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {o.name} <span className="font-normal text-muted-foreground">· {o.customerName}</span>
                        </p>
                        <p className="text-xs text-muted-foreground" title={f.dateTime(o.placedAt)}>
                          <TimeAgo date={o.placedAt} />
                        </p>
                      </div>
                      <Pill map={ORDER_STATUS} value={o.status} className="hidden sm:inline-flex" />
                      <p className="tabular w-24 text-right text-sm font-semibold">{f.money(o.total)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground">No orders for this product yet.</p>
            )}
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-4">
          <section aria-labelledby="ai-forecast" className="overflow-hidden rounded-xl border bg-card">
            <div className="bg-ai-gradient px-5 py-4">
              <p id="ai-forecast" className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-ai uppercase">
                <Sparkles className="size-3.5" aria-hidden /> Inventory forecast
              </p>
              {urgent ? (
                <>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold">
                      {variantName(urgent)} needs attention
                    </h2>
                    <CoveragePill status={urgent.coverage.status} />
                  </div>
                  <p className="tabular mt-2 text-sm leading-relaxed">{coverageSentence({ ...urgent.coverage, stock: urgent.stock })}</p>
                  {urgent.reorder > 0 && (
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      Reorder about <span className="tabular font-semibold text-foreground">{urgent.reorder} units</span> to cover the next 30 days.
                    </p>
                  )}
                  {(urgent.coverage.velocityMultiplier ?? 0) >= 1.3 && (
                    <p className="mt-1 text-[13px] text-warning">Selling {urgent.coverage.velocityMultiplier}× faster than its 30-day average.</p>
                  )}
                </>
              ) : (
                <>
                  <h2 className="mt-1.5 flex items-center gap-2 text-[15px] font-semibold">
                    <CheckCircle2 className="size-4 text-success" aria-hidden /> Stock is healthy
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {sellingVariants.length
                      ? `Selling about ${totalDaily} units a day across ${sellingVariants.length} variant${sellingVariants.length === 1 ? "" : "s"}. No size is at risk of selling out within ${inventory.warningDays} days.`
                      : "No recent sales — current stock is sufficient."}
                  </p>
                </>
              )}
            </div>
          </section>

          <ProductIntelligence title={product.title} intel={intel} canAsk={can(auth.role, "ai.use")} />

          <SectionCard title="Product settings" description="Visibility and merchandising">
            <ProductSettings productId={product.id} status={product.status} categoryId={product.categoryId} categories={categories.map((c) => ({ id: c.id, name: c.name }))} canEdit={can(auth.role, "products.update")} />
          </SectionCard>

          <SectionCard
            title="AI insights"
            description="Recommendations about this product"
          >
            {insights.length ? (
              <div className="space-y-3">
                {insights.map((i) => (
                  <InsightCard key={i.id} insight={JSON.parse(JSON.stringify(i))} compact />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <span className="mb-3 grid size-10 place-items-center rounded-xl bg-ai-soft text-ai">
                  <Lightbulb className="size-5" aria-hidden />
                </span>
                <p className="text-sm font-medium">No insights yet</p>
                <p className="mt-1 max-w-60 text-xs text-muted-foreground">AI agents will flag demand spikes, stock risks and return issues for this product here.</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Details">
            <DefinitionList
              items={[
                { label: "Category", value: product.category?.name ?? "Uncategorized" },
                { label: "Variants", value: product.variants.length },
                { label: "Sizes", value: product.matrix.sizes.join(", ") || "One size" },
                { label: "Colours", value: product.matrix.colors.join(", ") || "—" },
                ...(product.costPrice ? [{ label: "Unit cost", value: f.money(product.costPrice) }] : []),
                { label: "Tags", value: product.tags.length ? product.tags.join(", ") : "—" },
                { label: "Created", value: f.date(product.createdAt) },
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  );
}
