"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

/**
 * Relative time ("3m ago") that stays fresh and is hydration-safe: server and
 * client may straddle a minute boundary, so the text is allowed to differ.
 */
export function TimeAgo({ date, className }: { date: string | Date | null | undefined; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!date) return <span className={className}>—</span>;
  const iso = new Date(date).toISOString();
  return (
    <time dateTime={iso} title={new Date(date).toLocaleString()} className={className} suppressHydrationWarning>
      {timeAgo(date)}
    </time>
  );
}
