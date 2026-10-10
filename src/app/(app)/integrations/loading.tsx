import { Bone, PageHeaderSkeleton, TableSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-[66px] rounded-xl" />
        ))}
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Bone key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <Bone className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-32" />
                <Bone className="h-3 w-20" />
              </div>
            </div>
            <Bone className="h-3.5 w-full" />
            <Bone className="h-3.5 w-2/3" />
            <Bone className="h-8 w-24" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={5} cols={5} />
    </div>
  );
}
