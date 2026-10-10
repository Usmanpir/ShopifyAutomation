import { Bone, CardSkeleton, ChartSkeleton, KpiSkeleton, TableSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading campaign">
      <div className="space-y-2">
        <Bone className="h-3.5 w-40" />
        <Bone className="h-7 w-72" />
        <Bone className="h-4 w-56" />
      </div>
      <KpiSkeleton count={6} />
      <ChartSkeleton />
      <TableSkeleton rows={4} cols={7} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
    </div>
  );
}
