"use client";

import { LineChart, SlidersHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shared/product-image";
import { AdjustStockDialog, type AdjustTarget } from "./adjust-stock-dialog";
import { CoveragePill, coverageSentence, type CoverageStatus } from "./coverage-meta";
import { ForecastDrawer } from "./forecast-drawer";

export type ForecastItem = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  imageUrl: string | null;
  stock: number;
  averageDailySales: number;
  coverageDays: number | null;
  velocityMultiplier: number | null;
  status: CoverageStatus;
  reorder: number;
};

export function CoverageForecast({ items, canAdjust }: { items: ForecastItem[]; canAdjust: boolean }) {
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  const [forecast, setForecast] = useState<string | null>(null);
  return (
    <section aria-labelledby="forecast-title" className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-ai-gradient px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-ai-soft text-ai">
            <Sparkles className="size-[18px]" aria-hidden />
          </span>
          <div>
            <h2 id="forecast-title" className="text-[15px] font-semibold tracking-tight">
              AI coverage forecast
            </h2>
            <p className="text-[13px] text-muted-foreground">Variants that will sell out first at the current pace</p>
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Every selling variant has healthy cover. Nothing urgent right now.</p>
      ) : (
        <ol className="divide-y">
          {items.map((i, idx) => (
            <li key={i.variantId} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="tabular mt-2.5 w-4 shrink-0 text-xs text-muted-foreground" aria-hidden>
                  {idx + 1}
                </span>
                <ProductImage src={i.imageUrl} alt={i.productTitle} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/products/${i.productId}`} className="truncate text-sm font-medium hover:text-primary hover:underline">
                      {i.productTitle} <span className="text-muted-foreground">· {i.variantTitle}</span>
                    </Link>
                    <CoveragePill status={i.status} />
                    {i.velocityMultiplier !== null && i.velocityMultiplier >= 1.3 && (
                      <span className="text-[11.5px] font-medium text-warning">↑ {i.velocityMultiplier}× faster than usual</span>
                    )}
                  </div>
                  <p className="tabular mt-1 text-[13px] text-muted-foreground">{coverageSentence(i)}</p>
                  {i.reorder > 0 && (
                    <p className="mt-0.5 text-[12.5px]">
                      Suggested: reorder <span className="tabular font-semibold">{i.reorder}</span> units for 30 days of cover.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2 pl-7 sm:pl-0">
                {canAdjust && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget({ variantId: i.variantId, productTitle: i.productTitle, variantTitle: i.variantTitle, stock: i.stock, reorder: i.reorder, averageDailySales: i.averageDailySales })}
                  >
                    <SlidersHorizontal /> Adjust
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setForecast(i.variantId)} aria-label={`View forecast for ${i.productTitle} ${i.variantTitle}`}>
                  <LineChart /> View forecast
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <AdjustStockDialog target={target} onClose={() => setTarget(null)} />
      <ForecastDrawer variantId={forecast} onClose={() => setForecast(null)} />
    </section>
  );
}
