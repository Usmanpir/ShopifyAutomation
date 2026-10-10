import { Bone, CardSkeleton, KpiSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading AI agents">
      <PageHeaderSkeleton />
      <div className="flex gap-2 border-b pb-2">
        <Bone className="h-6 w-20" />
        <Bone className="h-6 w-20" />
      </div>
      <KpiSkeleton count={4} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} lines={4} />
        ))}
      </div>
    </div>
  );
}
