import { AreaTabs } from "@/components/layout/area-tabs";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { FilterTabs, Pagination, SearchInput, SelectFilter } from "@/components/shared/url-controls";
import { ProductsView } from "@/features/products/products-view";
import { ViewToggle } from "@/features/products/view-toggle";
import { requireAuth } from "@/lib/auth/session";
import { listCategories, listProducts, productListQuery, variantStockFlags } from "@/services/product.service";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const auth = await requireAuth("products.view");
  const sp = await searchParams;
  const parsed = productListQuery.safeParse(sp);
  const q = parsed.success ? parsed.data : productListQuery.parse({});
  const view = sp.view === "grid" ? "grid" : "list";

  const [list, categories] = await Promise.all([listProducts(auth.store.id, q), listCategories(auth.store.id)]);
  const flags = await variantStockFlags(
    auth.store.id,
    list.items.map((p) => p.id),
  );
  const rows = list.items.map((p) => ({ ...p, flags: flags[p.id] }));

  const tabs = [
    { value: "all", label: "All", count: categories.reduce((s, c) => s + c.productCount, 0) },
    ...categories.map((c) => ({ value: c.slug, label: c.name, count: c.productCount })),
  ];

  return (
    <PageContainer wide>
      <PageHeader title="Products" description="Your Shopify catalog with live sales, conversion and stock health for every product." />
      <AreaTabs area="products" className="-mt-2" />
      <div className="space-y-3">
        <FilterTabs tabs={tabs} param="category" />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchInput placeholder="Search by title or SKU" className="lg:max-w-sm lg:flex-1" />
          <div className="scrollbar-thin -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-1 lg:overflow-visible lg:px-0 lg:pb-0">
            <SelectFilter
              param="stock"
              placeholder="Any stock"
              options={[
                { value: "in", label: "In stock" },
                { value: "low", label: "Low stock" },
                { value: "out", label: "Out of stock" },
              ]}
            />
            <SelectFilter
              param="status"
              placeholder="Any status"
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "DRAFT", label: "Draft" },
                { value: "ARCHIVED", label: "Archived" },
              ]}
            />
            <SelectFilter
              param="sort"
              placeholder="Top revenue"
              options={[
                { value: "unitsSold", label: "Most units sold" },
                { value: "totalInventory", label: "Inventory" },
                { value: "price", label: "Price" },
                { value: "returnRate", label: "Return rate" },
                { value: "createdAt", label: "Newest" },
              ]}
            />
            <ViewToggle className="lg:ml-auto" />
          </div>
        </div>
      </div>
      <ProductsView rows={JSON.parse(JSON.stringify(rows))} view={view} filtered={!!(q.q || q.category || q.stock || q.status)} />
      <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} />
    </PageContainer>
  );
}
