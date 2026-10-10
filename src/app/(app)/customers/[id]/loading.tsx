import { Bone, CardSkeleton, KpiSkeleton, TableSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading customer">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Bone className="h-3.5 w-36" />
          <div className="flex items-center gap-3.5">
            <Bone className="size-14 rounded-full" />
            <div className="space-y-2">
              <Bone className="h-6 w-48" />
              <Bone className="h-4 w-36" />
            </div>
          </div>
          <Bone className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-9 w-28" />
          <Bone className="h-9 w-24" />
        </div>
      </div>
      <KpiSkeleton />
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <Bone className="h-4 w-40" />
        <Bone className="h-5 w-2/3" />
        <Bone className="h-3.5 w-1/2" />
        <Bone className="h-3.5 w-1/3" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <TableSkeleton rows={5} cols={5} />
          <CardSkeleton lines={4} />
        </div>
        <div className="space-y-4">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
