import { Bone, KpiSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading customers">
      <PageHeaderSkeleton />
      <KpiSkeleton />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <Bone key={i} className="h-8 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <TableSkeleton cols={7} />
    </div>
  );
}
