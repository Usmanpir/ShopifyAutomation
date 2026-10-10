import { CardSkeleton, ChartSkeleton, KpiSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading analytics">
      <PageHeaderSkeleton />
      <KpiSkeleton count={8} />
      <ChartSkeleton />
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <CardSkeleton lines={8} className="xl:col-span-3" />
        <CardSkeleton lines={8} className="xl:col-span-2" />
      </div>
    </div>
  );
}
