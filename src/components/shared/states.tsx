"use client";

import { cn } from "cn";
import { CloudOff, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/shared/time-ago";

/** Helpful empty state: what this is, why it's empty, and the next action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary/8 text-primary ring-1 ring-primary/10 [&_svg]:size-6">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Friendly error state with retry and reassurance. Never shows stack traces. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. Please try again.",
  onRetry,
  lastSuccess,
  className,
  reassure = true,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  lastSuccess?: string | Date | null;
  className?: string;
  /** Tell people their data is safe (a failed load never changes anything). */
  reassure?: boolean;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
        <CloudOff className="size-6" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {reassure && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" aria-hidden /> Your data is safe — nothing was changed.
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
      {lastSuccess && <p className="mt-3 text-xs text-muted-foreground">Last successful sync: <TimeAgo date={lastSuccess} /></p>}
    </div>
  );
}
