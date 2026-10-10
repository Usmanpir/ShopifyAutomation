import { Bone, PageHeaderSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading notifications">
      <PageHeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 9 }).map((_, i) => (
            <Bone key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Bone key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
          <div className="divide-y rounded-xl border bg-card">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-4">
                <Bone className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Bone className="h-3.5 w-2/3" />
                  <Bone className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
