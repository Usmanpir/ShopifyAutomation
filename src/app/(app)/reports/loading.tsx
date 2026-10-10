import { Bone, PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading reports">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border bg-card p-4">
            <Bone className="h-3.5 w-20" />
            <Bone className="h-6 w-28" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={10} cols={7} />
    </div>
  );
}
