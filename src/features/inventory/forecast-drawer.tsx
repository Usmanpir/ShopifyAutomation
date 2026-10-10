"use client";

import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { ColumnChart } from "@/components/charts/charts";
import { Drawer } from "@/components/shared/drawer";
import { ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormat } from "@/components/store-context";
import { api } from "@/lib/client/api";
import { CoveragePill, type CoverageStatus } from "./coverage-meta";

type VariantForecast = {
  displayName: string;
  variant: { inventoryQuantity: number; price: number };
  coverage: { averageDailySales: number; coverageDays: number | null; velocityMultiplier: number | null; status: CoverageStatus };
  reorder: number;
  dailySales: number[];
};

/** Predictive stock for one variant: 30-day sales, days of cover, run-out date and reorder size. */
export function ForecastDrawer({ variantId, onClose }: { variantId: string | null; onClose: () => void }) {
  const f = useFormat();
  const q = useQuery({ queryKey: ["variant-forecast", variantId], queryFn: () => api<VariantForecast>(`/api/inventory/${variantId}`), enabled: !!variantId });
  const d = q.data;
  const today = new Date();
  const labels = Array.from({ length: 30 }, (_, i) => new Date(today.getTime() - (29 - i) * 86_400_000).toISOString().slice(0, 10));
  const runOut = d?.coverage.coverageDays != null && d.coverage.coverageDays > 0 ? new Date(today.getTime() + d.coverage.coverageDays * 86_400_000) : null;
  const m = d?.coverage.velocityMultiplier;
  const lostPerDay = d ? Math.round(d.coverage.averageDailySales * d.variant.price) : 0;

  return (
    <Drawer
      open={!!variantId}
      onOpenChange={(o) => !o && onClose()}
      icon={<LineChart />}
      title={d ? d.displayName : "Stock forecast"}
      description="Forecast from this variant's own sales — no guesses about the future beyond the current pace."
    >
      {q.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : q.isError || !d ? (
        <ErrorState title="Couldn't load the forecast" description="Please try again in a moment." onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <CoveragePill status={d.coverage.status} />
            {m != null && m >= 1.3 && <span className="text-xs font-medium text-warning">Selling {m}× faster than its 30-day average</span>}
            {m != null && m <= 0.7 && <span className="text-xs font-medium text-muted-foreground">Selling slower than usual ({m}×)</span>}
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "In stock", value: String(d.variant.inventoryQuantity) },
              { label: "Sells per day", value: String(d.coverage.averageDailySales) },
              { label: "Days left", value: d.variant.inventoryQuantity <= 0 ? "0" : d.coverage.coverageDays == null ? "No sales" : String(d.coverage.coverageDays) },
              { label: "Runs out", value: d.variant.inventoryQuantity <= 0 ? "Now" : runOut ? f.dateShort(runOut) : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-surface-2/50 px-3 py-2">
                <dt className="text-[11.5px] text-muted-foreground">{s.label}</dt>
                <dd className="tabular text-[15px] font-semibold">{s.value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-1 text-[13px] font-medium">Units sold per day · last 30 days</p>
            <ColumnChart data={labels.map((label, i) => ({ label, value: d.dailySales[i] ?? 0 }))} format="number" height={190} />
          </div>
          <div className="rounded-lg border p-3 text-[13px] leading-relaxed">
            {d.reorder > 0 ? (
              <p>
                <span className="font-semibold">Reorder about {d.reorder} units</span> to cover the next 30 days at the current pace.
                {lostPerDay > 0 && <> Each day out of stock costs about {f.money(lostPerDay)} in sales.</>}
              </p>
            ) : (
              <p>No reorder needed — current stock covers more than 30 days at this pace.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              How it&apos;s calculated: average daily sales over the recent window (excluding cancelled orders) divided into the stock on hand; the trend compares that window with the 30-day average.
            </p>
          </div>
        </div>
      )}
    </Drawer>
  );
}
