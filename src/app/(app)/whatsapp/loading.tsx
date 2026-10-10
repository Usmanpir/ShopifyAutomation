import { Bone } from "@/components/shared/skeletons";
import { InboxSkeleton } from "@/features/conversations/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-col gap-3 px-4 pt-5 pb-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="space-y-2">
          <Bone className="h-7 w-52" />
          <Bone className="h-4 w-80 max-w-full" />
        </div>
        <Bone className="h-8 w-64 rounded-lg" />
      </div>
      <div className="mb-4 flex gap-3 overflow-hidden px-4 sm:px-6 xl:grid xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex min-w-[150px] items-center gap-3 rounded-xl border bg-card px-3.5 py-3">
            <Bone className="size-9 rounded-lg" />
            <div className="space-y-1.5">
              <Bone className="h-3 w-20" />
              <Bone className="h-5 w-12" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 px-4 pb-4 sm:px-6 lg:min-h-0">
        <InboxSkeleton className="h-[72dvh] rounded-xl border lg:h-full" />
      </div>
    </div>
  );
}
