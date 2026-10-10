"use client";

import { cn } from "cn";
import { ArrowDownRight, ArrowUpRight, ChevronRight, LineChart, PackageSearch, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/states";
import { StatusPill } from "@/components/shared/status";
import type { VariantInventoryRow } from "@/services/inventory.service";
import { AdjustStockDialog, type AdjustTarget } from "./adjust-stock-dialog";
import { CoverageBar, CoveragePill, SizeChips, formatCoverage, stockState, type CoverageStatus } from "./coverage-meta";
import { ForecastDrawer } from "./forecast-drawer";

/** Sales trend vs the 30-day average, shown only when it's a real change. */
function Trend({ m }: { m: number | null }) {
  if (m == null || (m < 1.3 && m > 0.7)) return null;
  const up = m >= 1.3;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", up ? "text-warning" : "text-muted-foreground")} title={`Selling ${m}× its 30-day average`}>
      {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
      {m}×
    </span>
  );
}

export type InventoryProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  category: string;
  stock: number;
  lowVariants: number;
  outVariants: number;
  unitsSold30d: number;
  coverage: { averageDailySales: number; coverageDays: number | null; velocityMultiplier: number | null; status: CoverageStatus };
  variants: VariantInventoryRow[];
};

const GRID = "grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_4.5rem_10.5rem_8rem] items-center gap-4";

export function InventoryList({ rows, canAdjust, filtered }: { rows: InventoryProduct[]; canAdjust: boolean; filtered: boolean }) {
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  const [forecast, setForecast] = useState<string | null>(null);

  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={<PackageSearch />}
          title={filtered ? "No products match these filters" : "No products to track yet"}
          description={filtered ? "Try another status, category or search term." : "Once products sync from Shopify, stock coverage is calculated here automatically."}
        />
      </div>
    );
  }

  const openAdjust = (p: InventoryProduct, v: VariantInventoryRow) =>
    setTarget({ variantId: v.id, productTitle: p.title, variantTitle: variantLabel(v), stock: v.stock, reorder: v.reorder, averageDailySales: v.coverage.averageDailySales });

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className={cn(GRID, "hidden border-b bg-surface-2/60 py-2.5 pr-3 pl-12 text-[12px] font-medium text-muted-foreground lg:grid")} role="presentation">
        <span>Product</span>
        <span className="text-right">Stock</span>
        <span className="text-right">Sold · 30d</span>
        <span className="text-right">Avg / day</span>
        <span>Coverage</span>
        <span>Status</span>
      </div>
      <ul className="divide-y" aria-label="Inventory by product">
        {rows.map((p) => (
          <ProductRow key={p.id} p={p} canAdjust={canAdjust} onAdjust={(v) => openAdjust(p, v)} onForecast={setForecast} />
        ))}
      </ul>
      <AdjustStockDialog target={target} onClose={() => setTarget(null)} />
      <ForecastDrawer variantId={forecast} onClose={() => setForecast(null)} />
    </div>
  );
}

function variantLabel(v: { title: string; size: string | null; color: string | null }) {
  const parts = [v.size, v.color].filter(Boolean);
  return parts.length ? parts.join(" / ") : v.title;
}

function ProductRow({ p, canAdjust, onAdjust, onForecast }: { p: InventoryProduct; canAdjust: boolean; onAdjust: (v: VariantInventoryRow) => void; onForecast: (variantId: string) => void }) {
  const [open, setOpen] = useState(false);
  const flags = [p.outVariants > 0 && `${p.outVariants} out`, p.lowVariants > 0 && `${p.lowVariants} low`].filter(Boolean).join(" · ");
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <li>
        {/* Whole row toggles (pointer convenience); the chevron button is the accessible trigger. */}
        <div
          className={cn("group flex w-full cursor-pointer items-start gap-2 px-3 py-3 transition-colors hover:bg-muted/40 lg:items-center", open && "bg-muted/30")}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a,button")) return;
            setOpen((o) => !o);
          }}
        >
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="mt-1.5 shrink-0 text-muted-foreground lg:mt-0" aria-label={`${open ? "Hide" : "Show"} variants for ${p.title}`}>
              <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
            </Button>
          </CollapsibleTrigger>
          {/* Desktop row */}
          <div className={cn(GRID, "hidden min-w-0 flex-1 lg:grid")}>
            <div className="flex min-w-0 items-center gap-3">
              <ProductImage src={p.imageUrl} alt={p.title} className="size-10" />
              <div className="min-w-0 space-y-1">
                <p className="flex min-w-0 items-baseline gap-2">
                  <Link href={`/products/${p.id}`} className="truncate text-sm font-medium hover:text-primary hover:underline">
                    {p.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.category}</span>
                </p>
                <SizeChips variants={p.variants} />
              </div>
            </div>
              <div className="text-right">
                <p className="tabular text-sm font-semibold">{p.stock.toLocaleString()}</p>
                {flags && <p className="text-[11px] font-medium text-warning">{flags}</p>}
              </div>
              <span className="tabular text-right text-sm">{p.unitsSold30d.toLocaleString()}</span>
              <span className="tabular text-right text-sm">{p.coverage.averageDailySales}</span>
              <CoverageBar days={p.coverage.coverageDays} status={p.coverage.status} />
              <div className="flex items-center gap-1.5">
                <CoveragePill status={p.coverage.status} />
                <Trend m={p.coverage.velocityMultiplier} />
              </div>
            </div>
            {/* Mobile / tablet card */}
            <div className="min-w-0 flex-1 space-y-2.5 lg:hidden">
              <div className="flex items-start gap-3">
                <ProductImage src={p.imageUrl} alt={p.title} className="size-11" />
                <div className="min-w-0 flex-1">
                  <Link href={`/products/${p.id}`} className="block truncate text-sm font-medium hover:text-primary">{p.title}</Link>
                  <p className="text-xs text-muted-foreground">
                    {p.category} · <span className="tabular">{p.stock}</span> in stock{flags && <span className="font-medium text-warning"> · {flags}</span>}
                  </p>
                </div>
                <CoveragePill status={p.coverage.status} />
              </div>
              <SizeChips variants={p.variants} />
              <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-4 text-xs text-muted-foreground">
                <span>
                  Sold 30d <span className="tabular font-medium text-foreground">{p.unitsSold30d}</span>
                </span>
                <span>
                  Avg/day <span className="tabular font-medium text-foreground">{p.coverage.averageDailySales}</span>
                </span>
                <CoverageBar days={p.coverage.coverageDays} status={p.coverage.status} className="min-w-0" />
              </div>
            </div>
        </div>
        <CollapsibleContent className="data-[state=open]:animate-fade-in">
          <VariantTable p={p} canAdjust={canAdjust} onAdjust={onAdjust} onForecast={onForecast} />
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}

function VariantTable({ p, canAdjust, onAdjust, onForecast }: { p: InventoryProduct; canAdjust: boolean; onAdjust: (v: VariantInventoryRow) => void; onForecast: (variantId: string) => void }) {
  return (
    <div className="border-t bg-surface-2/50 px-4 py-3 lg:pl-12">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {p.variants.length} variant{p.variants.length === 1 ? "" : "s"} · coverage at the current sales pace
        </p>
        <Link href={`/products/${p.id}`} className="text-xs font-medium text-primary hover:underline">
          Open product
        </Link>
      </div>
      {/* Desktop variant table */}
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Variants of {p.title}</caption>
          <thead>
            <tr className="border-b text-left text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Variant</th>
              <th scope="col" className="px-3 py-2 font-medium">SKU</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Stock</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Avg / day</th>
              <th scope="col" className="px-3 py-2 font-medium">Coverage</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Suggested reorder</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {p.variants.map((v) => {
              const s = stockState(v.stock, v.threshold);
              return (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{variantLabel(v)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{v.sku ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="tabular font-semibold">{v.stock}</span>
                    {s.key !== "ok" && (
                      <StatusPill tone={s.tone} dot={false} className="ml-2 h-4.5 px-1.5 text-[10.5px]">
                        {s.label}
                      </StatusPill>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{v.coverage.averageDailySales}</td>
                  <td className="px-3 py-2">
                    <CoverageBar days={v.coverage.coverageDays} status={v.coverage.status} />
                  </td>
                  <td className="px-3 py-2">
                    <CoveragePill status={v.coverage.status} />
                  </td>
                  <td className="tabular px-3 py-2 text-right">{v.reorder > 0 ? <span className="font-medium">+{v.reorder}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => onForecast(v.id)} aria-label={`View forecast for ${p.title} ${variantLabel(v)}`}>
                      <LineChart /> Forecast
                    </Button>
                    {canAdjust && (
                      <Button size="sm" variant="outline" onClick={() => onAdjust(v)} aria-label={`Adjust stock for ${p.title} ${variantLabel(v)}`}>
                        <SlidersHorizontal /> Adjust
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile variant cards */}
      <ul className="space-y-2 md:hidden">
        {p.variants.map((v) => {
          const s = stockState(v.stock, v.threshold);
          return (
            <li key={v.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {variantLabel(v)} · <span className="tabular">{v.stock}</span>
                  {s.key !== "ok" && <span className={cn("ml-1 text-xs font-semibold", s.key === "out" ? "text-danger" : "text-warning")}>{s.label}</span>}
                </p>
                <CoveragePill status={v.coverage.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Avg/day <span className="tabular text-foreground">{v.coverage.averageDailySales}</span> · Cover{" "}
                <span className="tabular text-foreground">{v.coverage.status === "OUT_OF_STOCK" ? "0 days" : formatCoverage(v.coverage.coverageDays)}</span>
                {v.reorder > 0 && (
                  <>
                    {" "}
                    · Reorder <span className="tabular text-foreground">+{v.reorder}</span>
                  </>
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => onForecast(v.id)}>
                  <LineChart /> Forecast
                </Button>
                {canAdjust && (
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onAdjust(v)}>
                    <SlidersHorizontal /> Adjust
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
