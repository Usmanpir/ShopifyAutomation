"use client";

import { cn } from "cn";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AdjustStockDialog, type AdjustTarget } from "@/features/inventory/adjust-stock-dialog";
import { CoverageBar, CoveragePill, formatCoverage, stockState } from "@/features/inventory/coverage-meta";
import type { VariantInventoryRow } from "@/services/inventory.service";

const CELL_TONE = {
  out: "border-danger/30 bg-danger-soft text-danger",
  low: "border-warning/30 bg-warning-soft text-warning",
  ok: "border-border bg-card text-foreground",
} as const;

function variantLabel(v: { title: string; size: string | null; color: string | null }) {
  const parts = [v.size, v.color].filter(Boolean);
  return parts.length ? parts.join(" / ") : v.title;
}

/**
 * Sizes × colors stock grid plus per-variant inventory intelligence.
 * Clicking a cell (or "Adjust") opens the shared adjust-stock dialog.
 */
export function VariantMatrix({
  productTitle,
  sizes,
  colors,
  variants,
  canAdjust,
}: {
  productTitle: string;
  sizes: string[];
  colors: string[];
  variants: VariantInventoryRow[];
  canAdjust: boolean;
}) {
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  const cols: (string | null)[] = sizes.length ? sizes : [null];
  const rows: (string | null)[] = colors.length ? colors : [null];
  const find = (size: string | null, color: string | null) => variants.find((v) => (size === null || v.size === size) && (color === null || v.color === color));
  const adjust = (v: VariantInventoryRow) => setTarget({ variantId: v.id, productTitle, variantTitle: variantLabel(v), stock: v.stock, reorder: v.reorder, averageDailySales: v.coverage.averageDailySales });

  return (
    <div className="space-y-5">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full border-separate border-spacing-1.5 text-sm">
          <caption className="sr-only">Stock by size and colour{canAdjust ? " — select a cell to adjust stock" : ""}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-12 text-left sm:w-24 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
                <span className="sr-only">Colour</span>
              </th>
              {cols.map((s) => (
                <th key={s ?? "one"} scope="col" className="min-w-11 text-center sm:min-w-18 text-[12px] font-semibold text-muted-foreground">
                  {s ?? "One size"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c ?? "default"}>
                <th scope="row" className="pr-1 text-left text-[12px] sm:pr-2 sm:text-[12.5px] font-medium whitespace-nowrap">
                  {c ?? "Default"}
                </th>
                {cols.map((s) => {
                  const v = find(s, c);
                  if (!v)
                    return (
                      <td key={s ?? "one"} className="h-[72px] rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                        <span aria-label="Not offered">—</span>
                      </td>
                    );
                  const st = stockState(v.stock, v.threshold);
                  const inner = (
                    <>
                      <span className="tabular text-lg leading-none font-semibold">{Math.max(0, v.stock)}</span>
                      <span className={cn("text-[10.5px] font-semibold tracking-wide uppercase", st.key === "ok" && "font-medium text-muted-foreground normal-case tracking-normal")}>
                        {st.key === "ok" ? (
                          v.coverage.coverageDays !== null ? (
                            <>
                              <span className="sm:hidden">{Math.round(v.coverage.coverageDays)}d</span>
                              <span className="hidden sm:inline">{formatCoverage(v.coverage.coverageDays)} cover</span>
                            </>
                          ) : (
                            "in stock"
                          )
                        ) : (
                          <>
                            <span className="sm:hidden">{st.label}</span>
                            <span className="hidden sm:inline">{st.key === "out" ? "Out of stock" : "Low stock"}</span>
                          </>
                        )}
                      </span>
                    </>
                  );
                  const cls = cn("flex h-[72px] w-full flex-col items-center justify-center gap-1.5 rounded-lg border px-1 transition sm:px-2", CELL_TONE[st.key]);
                  return (
                    <td key={v.id} className="p-0">
                      {canAdjust ? (
                        <button
                          type="button"
                          onClick={() => adjust(v)}
                          className={cn(cls, "hover:-translate-y-px hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none")}
                          aria-label={`${variantLabel(v)}: ${v.stock} in stock${st.key !== "ok" ? `, ${st.label.toLowerCase()}` : ""}. Adjust stock`}
                          title="Adjust stock"
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className={cls}>{inner}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm border border-warning/30 bg-warning-soft" /> Low stock (≤ {variants[0]?.threshold ?? 10})
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm border border-danger/30 bg-danger-soft" /> Out of stock
        </span>
        {canAdjust && <span>Select a cell to adjust stock.</span>}
      </p>

      {/* Inventory intelligence per variant */}
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Inventory intelligence</h3>
        <div className="hidden overflow-hidden rounded-lg border md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Inventory intelligence per variant</caption>
            <thead>
              <tr className="border-b bg-surface-2/60 text-left text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Variant</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Stock</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Avg / day</th>
                <th scope="col" className="px-3 py-2 font-medium">Coverage</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Suggested reorder</th>
                {canAdjust && (
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium whitespace-nowrap">{variantLabel(v)}</p>
                    {v.sku && <p className="font-mono text-[11px] text-muted-foreground">{v.sku}</p>}
                  </td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{v.stock}</td>
                  <td className="tabular px-3 py-2 text-right">{v.coverage.averageDailySales}</td>
                  <td className="px-3 py-2">
                    <CoverageBar days={v.coverage.coverageDays} status={v.coverage.status} />
                  </td>
                  <td className="px-3 py-2">
                    <CoveragePill status={v.coverage.status} />
                  </td>
                  <td className="tabular px-3 py-2 text-right">{v.reorder > 0 ? <span className="font-medium">+{v.reorder}</span> : <span className="text-muted-foreground">—</span>}</td>
                  {canAdjust && (
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => adjust(v)} aria-label={`Adjust stock for ${variantLabel(v)}`}>
                        <SlidersHorizontal /> Adjust
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y rounded-lg border md:hidden">
          {variants.map((v) => (
            <li key={v.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{variantLabel(v)}</p>
                  <CoveragePill status={v.coverage.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="tabular text-foreground">{v.stock}</span> in stock · <span className="tabular">{v.coverage.averageDailySales}</span>/day ·{" "}
                  {v.coverage.status === "OUT_OF_STOCK" ? "0 days" : formatCoverage(v.coverage.coverageDays)} cover
                  {v.reorder > 0 && <> · reorder +{v.reorder}</>}
                </p>
              </div>
              {canAdjust && (
                <Button size="icon-sm" variant="outline" onClick={() => adjust(v)} aria-label={`Adjust stock for ${variantLabel(v)}`}>
                  <SlidersHorizontal />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <AdjustStockDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
