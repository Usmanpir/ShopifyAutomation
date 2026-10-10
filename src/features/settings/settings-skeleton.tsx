import { Bone, CardSkeleton } from "@/components/shared/skeletons";

/** Skeleton for a settings sub-page (rendered inside the settings layout). */
export function SettingsPageSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Bone className="h-5 w-40" />
        <Bone className="h-3.5 w-72" />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <CardSkeleton key={i} lines={i === 0 ? 6 : 4} />
      ))}
    </div>
  );
}

/** Settings section heading used at the top of each sub-page. */
export function SettingsHeading({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
