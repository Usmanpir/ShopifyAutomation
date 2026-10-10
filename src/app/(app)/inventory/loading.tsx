import { Bone, CardSkeleton, KpiSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading inventory">
      <PageHeaderSkeleton />
      <KpiSkeleton count={6} />
      <CardSkeleton lines={5} />
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <TableSkeleton rows={8} cols={7} />
    </div>
  );
}
