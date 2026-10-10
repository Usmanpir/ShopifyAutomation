import { CardSkeleton, ChartSkeleton, KpiSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading dashboard">
      <PageHeaderSkeleton />
      <KpiSkeleton count={8} />
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartSkeleton className="xl:col-span-2" />
        <CardSkeleton lines={6} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} lines={3} />
        ))}
      </div>
    </div>
  );
}
