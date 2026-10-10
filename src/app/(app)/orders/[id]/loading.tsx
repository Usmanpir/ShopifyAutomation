import { Bone, CardSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading order">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Bone className="h-3.5 w-28" />
          <Bone className="h-7 w-56" />
          <Bone className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-9 w-48" />
          <Bone className="h-9 w-24" />
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <Bone className="h-4 w-28" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone className="size-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Bone className="h-3.5 w-1/2" />
                  <Bone className="h-3 w-24" />
                </div>
                <Bone className="h-4 w-20" />
              </div>
            ))}
          </div>
          <div className="space-y-5 rounded-xl border bg-card p-5">
            <Bone className="h-4 w-24" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Bone className="size-8 rounded-full" />
                <div className="flex-1 space-y-2 pt-1">
                  <Bone className="h-3.5 w-1/3" />
                  <Bone className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
          <CardSkeleton lines={3} />
        </div>
        <div className="space-y-4">
          <CardSkeleton lines={4} />
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <Bone className="h-4 w-32" />
            <div className="flex items-center gap-4">
              <Bone className="size-[88px] rounded-full" />
              <div className="flex-1 space-y-2">
                <Bone className="h-5 w-24 rounded-full" />
                <Bone className="h-3 w-full" />
              </div>
            </div>
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-2/3" />
          </div>
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
