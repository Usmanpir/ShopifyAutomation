import { cn } from "cn";

/** Shimmer block — the base of every loading skeleton. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton-shimmer rounded-md bg-muted", className)} />;
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-xl border bg-card p-4">
          <Bone className="h-3.5 w-24" />
          <div className="flex items-end justify-between">
            <div className="space-y-2">
              <Bone className="h-6 w-28" />
              <Bone className="h-3 w-20" />
            </div>
            <Bone className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className, lines = 4 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("space-y-4 rounded-xl border bg-card p-5", className)}>
      <Bone className="h-4 w-40" />
      {Array.from({ length: lines }).map((_, i) => (
        <Bone key={i} className={cn("h-3.5", i % 3 === 2 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-xl border bg-card p-5", className)}>
      <div className="flex justify-between">
        <Bone className="h-4 w-36" />
        <Bone className="h-7 w-48" />
      </div>
      <div className="flex h-56 items-end gap-2 pt-4">
        {Array.from({ length: 18 }).map((_, i) => (
          <Bone key={i} className="flex-1 rounded-b-none" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex gap-6 border-b px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Bone key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 border-b px-4 py-3.5 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Bone key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-24")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex items-end justify-between">
      <div className="space-y-2">
        <Bone className="h-6 w-48" />
        <Bone className="h-4 w-72" />
      </div>
      <Bone className="h-9 w-32" />
    </div>
  );
}

export function ListPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7">
      <PageHeaderSkeleton />
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}
