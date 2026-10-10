"use client";

import { cn } from "cn";
import { ArrowRight, BrainCircuit, MessageSquareText, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { BriefingPoint } from "@/services/home.service";

const DOT: Record<BriefingPoint["tone"], string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  ai: "bg-ai",
};

// Dismissal is remembered per day, per browser.
const listeners = new Set<() => void>();
const keyFor = (day: string) => `cai.briefing.dismissed.${day}`;
function read(day: string) {
  try {
    return localStorage.getItem(keyFor(day)) === "1";
  } catch {
    return false;
  }
}

export function MorningBriefing({
  day,
  greeting,
  headline,
  points,
  reportHref,
  canAsk,
}: {
  day: string;
  greeting: string;
  headline: string;
  points: BriefingPoint[];
  reportHref: string | null;
  canAsk: boolean;
}) {
  const dismissed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(day),
    () => false,
  );
  if (dismissed) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(keyFor(day), "1");
    } catch {
      /* storage unavailable */
    }
    listeners.forEach((l) => l());
  };

  return (
    <section aria-labelledby="briefing-title" className="relative overflow-hidden rounded-2xl border bg-card bg-ai-gradient p-4 sm:p-5">
      <button type="button" onClick={dismiss} aria-label="Dismiss briefing for today" className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ai text-white shadow-sm dark:text-zinc-950" aria-hidden>
          <BrainCircuit className="size-5" />
        </span>
        <div className="min-w-0">
          <p id="briefing-title" className="text-[12px] font-semibold tracking-wide text-ai uppercase">
            {greeting} briefing · Business Analyst
          </p>
          <p className="mt-1 text-[15px] leading-snug font-semibold sm:text-base">{headline}</p>
        </div>
      </div>
      {points.length > 0 && (
        <ul className="mt-3 space-y-1.5 sm:pl-[52px]">
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed">
              <span aria-hidden className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", DOT[p.tone])} />
              <span className="min-w-0">
                {p.text}
                {p.href && (
                  <Link href={p.href} className="ml-1 inline-flex items-center text-[12.5px] font-medium text-primary hover:underline">
                    Details
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 sm:pl-[52px]">
        <Button asChild size="sm">
          <a href="#needs-attention">
            Review now <ArrowRight />
          </a>
        </Button>
        {reportHref && (
          <Button asChild size="sm" variant="outline" className="bg-card">
            <Link href={reportHref}>Read full report</Link>
          </Button>
        )}
        {canAsk && (
          <Button asChild size="sm" variant="ghost">
            <Link href="/assistant?q=What%20should%20I%20focus%20on%20today%20and%20why%3F">
              <MessageSquareText /> Ask AI
            </Link>
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] text-muted-foreground sm:pl-[52px]">Written from your store data — every number links back to the records it came from.</p>
    </section>
  );
}
