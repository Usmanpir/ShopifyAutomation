import { Bone, CardSkeleton, ChartSkeleton, KpiSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading product">
      <div className="flex items-end gap-4">
        <Bone className="size-20 rounded-xl sm:size-24" />
        <div className="space-y-2">
          <Bone className="h-3 w-32" />
          <Bone className="h-5 w-24 rounded-full" />
          <Bone className="h-6 w-64" />
        </div>
      </div>
      <KpiSkeleton count={6} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <ChartSkeleton />
          <CardSkeleton lines={6} />
        </div>
        <div className="space-y-4">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}
