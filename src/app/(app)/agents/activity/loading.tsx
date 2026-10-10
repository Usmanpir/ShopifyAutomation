import { Bone, PageHeaderSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading AI activity">
      <PageHeaderSkeleton />
      <div className="flex gap-2 border-b pb-2">
        <Bone className="h-6 w-20" />
        <Bone className="h-6 w-20" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-5 py-3.5 last:border-0">
            <Bone className="h-3 w-10" />
            <Bone className="size-7 rounded-md" />
            <div className="flex-1 space-y-2">
              <Bone className="h-3.5 w-2/3" />
              <Bone className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
