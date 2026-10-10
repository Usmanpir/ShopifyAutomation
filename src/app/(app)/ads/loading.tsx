import { Bone, ChartSkeleton, KpiSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading Meta Ads">
      <PageHeaderSkeleton />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-7 w-24" />
        ))}
      </div>
      <KpiSkeleton count={4} />
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartSkeleton className="xl:col-span-2" />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton rows={6} cols={7} />
    </div>
  );
}
