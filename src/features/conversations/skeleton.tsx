import { cn } from "cn";
import { Bone } from "@/components/shared/skeletons";

export function ConversationListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-3.5">
          <Bone className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="flex justify-between">
              <Bone className="h-3.5 w-28" />
              <Bone className="h-3 w-8" />
            </div>
            <Bone className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Bone className="size-10 rounded-full" />
        <div className="space-y-2">
          <Bone className="h-4 w-36" />
          <Bone className="h-3 w-24" />
        </div>
        <Bone className="ml-auto h-8 w-28" />
      </div>
      <div className="flex-1 space-y-4 bg-surface-2/60 p-6">
        {["w-3/5", "w-2/5", "w-2/3", "w-1/3", "w-1/2"].map((w, i) => (
          <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
            <Bone className={cn("h-12 rounded-2xl", w)} />
          </div>
        ))}
      </div>
      <div className="border-t p-3">
        <Bone className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Full inbox skeleton (list | thread | context) used by route loading states. */
export function InboxSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-1 overflow-hidden", className)}>
      <div className="flex w-full flex-col border-r bg-card md:w-[340px] md:shrink-0">
        <div className="space-y-2.5 border-b p-3">
          <Bone className="h-9 w-full rounded-lg" />
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} className="h-7 w-16 rounded-full" />
            ))}
          </div>
        </div>
        <ConversationListSkeleton />
      </div>
      <div className="hidden min-w-0 flex-1 md:flex">
        <ThreadSkeleton />
      </div>
      <div className="hidden w-[320px] shrink-0 space-y-4 border-l bg-card p-4 xl:block">
        <Bone className="h-16 w-full rounded-xl" />
        <Bone className="h-4 w-24" />
        <Bone className="h-24 w-full rounded-xl" />
        <Bone className="h-4 w-24" />
        <Bone className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}
