import { Bone } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem-5rem)] lg:h-[calc(100dvh-3.5rem)]" aria-busy="true" aria-label="Loading assistant">
      <div className="hidden w-[272px] shrink-0 space-y-3 border-r bg-surface-2/40 p-3 lg:block">
        <Bone className="h-9 w-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-10 w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-12 border-b" />
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-6">
          <Bone className="mx-auto size-14 rounded-2xl" />
          <Bone className="mx-auto h-7 w-80" />
          <Bone className="mx-auto h-4 w-96 max-w-full" />
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Bone key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="border-t p-3">
          <Bone className="mx-auto h-[54px] w-full max-w-3xl rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
