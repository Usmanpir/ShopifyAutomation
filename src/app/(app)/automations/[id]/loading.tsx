import { Bone } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem-5rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Bone className="size-7" />
        <div className="flex-1 space-y-1.5">
          <Bone className="h-4 w-56" />
          <Bone className="h-3 w-80 max-w-full" />
        </div>
        <Bone className="hidden h-7 w-64 md:block" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[212px] space-y-2 border-r bg-card p-2 lg:block">
          {Array.from({ length: 7 }).map((_, i) => (
            <Bone key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="flex flex-1 flex-col items-center gap-10 bg-surface-2 pt-16">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} className="h-[76px] w-[264px] rounded-xl" />
          ))}
        </div>
        <div className="hidden w-[340px] space-y-3 border-l bg-card p-4 xl:block">
          <Bone className="h-8 w-full" />
          <Bone className="h-16 w-full" />
          <Bone className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
