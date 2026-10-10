import { Bone } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4">
      <Bone className="size-12 rounded-2xl" />
      <Bone className="h-4 w-48" />
      <Bone className="h-3.5 w-64" />
    </div>
  );
}
