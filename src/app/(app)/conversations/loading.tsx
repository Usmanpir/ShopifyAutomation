import { Bone } from "@/components/shared/skeletons";
import { InboxSkeleton } from "@/features/conversations/skeleton";

export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem-5rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="space-y-1.5">
          <Bone className="h-5 w-40" />
          <Bone className="hidden h-3 w-96 sm:block" />
        </div>
        <Bone className="h-8 w-44 rounded-lg" />
      </div>
      <InboxSkeleton className="flex-1" />
    </div>
  );
}
