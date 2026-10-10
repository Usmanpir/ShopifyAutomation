"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ErrorState } from "@/components/shared/states";

/** Server-side load failure → friendly error with a Retry that re-runs the server render. */
export function LoadError({ title, description, lastSuccess }: { title: string; description: string; lastSuccess?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="rounded-xl border bg-card" aria-busy={pending}>
      <ErrorState title={title} description={description} lastSuccess={lastSuccess} onRetry={() => start(() => router.refresh())} />
    </div>
  );
}
