import { Bone, CardSkeleton, KpiSkeleton, PageHeaderSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading marketing">
      <PageHeaderSkeleton />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="h-7 w-28" />
        ))}
      </div>
      <KpiSkeleton count={6} />
      <div className="grid gap-4 xl:grid-cols-3">
        <CardSkeleton lines={6} className="xl:col-span-2" />
        <CardSkeleton lines={6} />
      </div>
      <CardSkeleton lines={5} />
    </div>
  );
}
