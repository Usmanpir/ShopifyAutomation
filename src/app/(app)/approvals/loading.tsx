import { Bone, PageHeaderSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading approvals">
      <PageHeaderSkeleton />
      <Bone className="h-[72px] rounded-xl" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-3">
            <Bone className="size-7 rounded-md" />
            <Bone className="h-3.5 w-48" />
          </div>
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_260px]">
            <div className="space-y-3">
              <Bone className="h-5 w-2/3" />
              <Bone className="h-3.5 w-full" />
              <Bone className="h-3.5 w-5/6" />
              <Bone className="h-24 w-full" />
            </div>
            <Bone className="h-40 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
