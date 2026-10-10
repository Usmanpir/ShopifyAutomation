import { Bone, CardSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 sm:py-7" aria-busy="true" aria-label="Loading agent">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bone className="size-12 rounded-xl" />
          <div className="space-y-2">
            <Bone className="h-3 w-32" />
            <Bone className="h-6 w-48" />
            <Bone className="h-4 w-56" />
          </div>
        </div>
        <Bone className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={6} />
          <CardSkeleton lines={8} />
        </div>
        <div className="space-y-4">
          <CardSkeleton lines={8} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}
