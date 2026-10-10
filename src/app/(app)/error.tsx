"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";

/** Route-level error boundary: friendly message + retry, never a stack trace. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border bg-card">
        <ErrorState
          title="This page couldn't load"
          description={`We hit a problem showing this page. Try again — if it keeps happening, share this reference with support.${error.digest ? ` (ref ${error.digest})` : ""}`}
          onRetry={reset}
        />
      </div>
    </div>
  );
}
