import { Bone } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <div className="flex w-full max-w-3xl items-center justify-between">
        <Bone className="h-8 w-36" />
        <Bone className="h-4 w-20" />
      </div>
      <div className="mt-10 flex w-full max-w-3xl gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Bone key={i} className="h-1.5 flex-1 rounded-full" />
        ))}
      </div>
      <div className="mt-8 w-full max-w-2xl space-y-5 rounded-2xl border bg-card p-8">
        <Bone className="size-12 rounded-2xl" />
        <Bone className="h-7 w-2/3" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-4/5" />
        <div className="grid gap-3 pt-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
