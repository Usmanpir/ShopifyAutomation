"use client";

import { cn } from "cn";
import { PackageSearch } from "lucide-react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/states";
import { Pill, StatusPill } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import { PRODUCT_STATUS, productStockState, type StockFlags } from "./product-meta";

export type ProductRow = {
  id: string;
  title: string;
  imageUrl: string | null;
  status: string;
  price: number;
  compareAtPrice: number | null;
  totalInventory: number;
  unitsSold: number;
  revenue: number;
  returnRate: number;
  conversionRate: number;
  category: { name: string; slug: string } | null;
  _count: { variants: number };
  flags?: StockFlags;
};

function Price({ p, className }: { p: ProductRow; className?: string }) {
  const f = useFormat();
  const onSale = p.compareAtPrice !== null && p.compareAtPrice > p.price;
  return (
    <span className={cn("tabular inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className="font-semibold">{f.money(p.price)}</span>
      {onSale && (
        <s className="text-xs text-muted-foreground">
          <span className="sr-only">was </span>
          {f.money(p.compareAtPrice)}
        </s>
      )}
    </span>
  );
}

function Stock({ p }: { p: ProductRow }) {
  const s = productStockState(p.totalInventory, p.flags);
  return (
    <div>
      <p className={cn("tabular font-semibold", p.totalInventory <= 0 && "text-danger")}>{Math.max(0, p.totalInventory).toLocaleString()}</p>
      {s ? <p className={cn("text-[11.5px] font-medium", s.tone === "danger" ? "text-danger" : "text-warning")}>{s.label}</p> : <p className="text-[11.5px] text-muted-foreground">In stock</p>}
    </div>
  );
}

export function ProductsView({ rows, view, filtered }: { rows: ProductRow[]; view: "list" | "grid"; filtered: boolean }) {
  const f = useFormat();
  const empty = (
    <EmptyState
      icon={<PackageSearch />}
      title={filtered ? "No products match these filters" : "No products yet"}
      description={filtered ? "Try another category, stock level or search term." : "Products sync from Shopify automatically and appear here with live sales and stock."}
    />
  );

  if (view === "grid") {
    if (!rows.length) return <div className="rounded-xl border bg-card">{empty}</div>;
    return (
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-label="Products">
        {rows.map((p) => {
          const s = productStockState(p.totalInventory, p.flags);
          return (
            <li key={p.id}>
              <Link
                href={`/products/${p.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:border-foreground/12 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <div className="relative">
                  <ProductImage src={p.imageUrl} alt={p.title} className="block aspect-4/3 w-full border-0 border-b transition-transform duration-300 group-hover:scale-[1.02]" rounded="rounded-none" />
                  <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    {p.status !== "ACTIVE" && <Pill map={PRODUCT_STATUS} value={p.status} className="shadow-sm" />}
                    {s && (
                      <StatusPill tone={s.tone} className="shadow-sm">
                        {s.label}
                      </StatusPill>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                  <div className="min-w-0">
                    <p className="text-[11.5px] text-muted-foreground">{p.category?.name ?? "Uncategorized"}</p>
                    <h3 className="line-clamp-2 text-sm leading-snug font-medium group-hover:text-primary">{p.title}</h3>
                  </div>
                  <Price p={p} className="text-sm" />
                  <dl className="mt-auto grid grid-cols-2 gap-2 border-t pt-2.5 text-xs">
                    <div>
                      <dt className="text-muted-foreground">In stock</dt>
                      <dd className={cn("tabular font-semibold", p.totalInventory <= 0 && "text-danger")}>{Math.max(0, p.totalInventory).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Units sold</dt>
                      <dd className="tabular font-semibold">{p.unitsSold.toLocaleString()}</dd>
                    </div>
                  </dl>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  const columns: Column<ProductRow>[] = [
    {
      key: "product",
      header: "Product",
      sortKey: "title",
      cell: (p) => (
        <div className="flex min-w-56 items-center gap-3">
          <ProductImage src={p.imageUrl} alt={p.title} className="size-11" />
          <div className="min-w-0">
            <p className="truncate font-medium">{p.title}</p>
            <p className="text-xs text-muted-foreground">
              {p._count.variants} SKU{p._count.variants === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", hideBelow: "xl", cell: (p) => <span className="text-muted-foreground">{p.category?.name ?? "—"}</span> },
    { key: "price", header: "Price", sortKey: "price", align: "right", cell: (p) => <Price p={p} className="justify-end" /> },
    { key: "inventory", header: "Inventory", sortKey: "totalInventory", align: "right", cell: (p) => <Stock p={p} /> },
    {
      key: "sales",
      header: "Sales",
      sortKey: "revenue",
      align: "right",
      cell: (p) => (
        <div>
          <p className="tabular font-semibold">{f.money(p.revenue, { compact: true })}</p>
          <p className="tabular text-[11.5px] text-muted-foreground">{p.unitsSold.toLocaleString()} units</p>
        </div>
      ),
    },
    { key: "conversion", header: "Conversion", align: "right", hideBelow: "lg", cell: (p) => <span className="tabular">{p.conversionRate.toFixed(1)}%</span> },
    {
      key: "returns",
      header: "Return rate",
      sortKey: "returnRate",
      align: "right",
      hideBelow: "lg",
      cell: (p) => <span className={cn("tabular", p.returnRate >= 10 && "font-medium text-danger")}>{p.returnRate.toFixed(1)}%</span>,
    },
    { key: "status", header: "Status", cell: (p) => <Pill map={PRODUCT_STATUS} value={p.status} /> },
  ];

  return (
    <DataTable
      caption="Products"
      columns={columns}
      rows={rows}
      rowHref={(p) => `/products/${p.id}`}
      empty={empty}
      mobileCard={(p) => {
        const s = productStockState(p.totalInventory, p.flags);
        return (
          <div className="flex gap-3">
            <ProductImage src={p.imageUrl} alt={p.title} className="size-14" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-medium">{p.title}</p>
                <Pill map={PRODUCT_STATUS} value={p.status} />
              </div>
              <Price p={p} className="text-sm" />
              <p className="text-xs text-muted-foreground">
                <span className={cn("tabular", p.totalInventory <= 0 ? "font-medium text-danger" : "text-foreground")}>{Math.max(0, p.totalInventory)}</span> in stock
                {s && p.totalInventory > 0 && <span className={cn("font-medium", s.tone === "danger" ? "text-danger" : "text-warning")}> · {s.label}</span>}
                {" · "}
                <span className="tabular text-foreground">{p.unitsSold}</span> sold · <span className="tabular">{p.returnRate.toFixed(1)}%</span> returns
              </p>
            </div>
          </div>
        );
      }}
    />
  );
}
