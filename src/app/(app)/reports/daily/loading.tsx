import { Bone, CardSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading daily report">
      <PageHeaderSkeleton />
      <div className="space-y-6 rounded-2xl border bg-card p-6 sm:p-8">
        <div className="space-y-3">
          <Bone className="h-3 w-48" />
          <Bone className="h-7 w-72" />
          <Bone className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-4">
              <Bone className="h-3 w-16" />
              <Bone className="h-6 w-24" />
            </div>
          ))}
        </div>
        <CardSkeleton lines={5} />
      </div>
    </div>
  );
}
