"use client";

import { cn } from "cn";
import { CircleHelp, Gauge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type Explanation = {
  what: string;
  why: string;
  todo: string;
  evidence?: { label: string; value: string }[];
  /** Optional footnote on how the item was calculated or ranked. */
  method?: string;
};

/**
 * "Why?" reveal used on every AI insight, priority and recommendation.
 * Always answers What is happening · Why it matters · What should I do,
 * with the data behind it.
 */
export function WhyButton({ explain, label = "Why?", className, align = "end" }: { explain: Explanation; label?: string; className?: string; align?: "start" | "center" | "end" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground", className)}
        >
          <CircleHelp className="size-3.5" aria-hidden /> {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,380px)] p-0">
        <ExplainBody explain={explain} />
      </PopoverContent>
    </Popover>
  );
}

export function ExplainBody({ explain, className }: { explain: Explanation; className?: string }) {
  const rows = [
    { k: "What is happening", v: explain.what },
    { k: "Why it matters", v: explain.why },
    { k: "What you can do", v: explain.todo },
  ];
  return (
    <div className={cn("space-y-3 p-4 text-sm", className)}>
      {rows.map((r) => (
        <div key={r.k}>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{r.k}</p>
          <p className="mt-0.5 leading-relaxed">{r.v}</p>
        </div>
      ))}
      {!!explain.evidence?.length && (
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Based on</p>
          <dl className="mt-1.5 divide-y rounded-lg border bg-surface-2/60 text-[13px]">
            {explain.evidence.map((e, i) => (
              <div key={`${e.label}-${i}`} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                <dt className="min-w-0 truncate text-muted-foreground">{e.label}</dt>
                <dd className="tabular shrink-0 text-right font-medium">{e.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {explain.method && <p className="border-t pt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{explain.method}</p>}
    </div>
  );
}

/**
 * Model confidence — renders nothing unless there is a real value. Rule
 * outputs and counted facts never get a made-up percentage.
 */
export function ConfidenceBadge({ value, source, className }: { value: number | null | undefined; source?: string; className?: string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? "text-success" : pct >= 60 ? "text-warning" : "text-danger";
  const badge = (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full bg-muted px-2 text-[11.5px] font-medium text-muted-foreground", className)}>
      <Gauge className={cn("size-3.5", tone)} aria-hidden />
      <span className="tabular">{pct}%</span> confident
    </span>
  );
  if (!source) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-60">{source}</TooltipContent>
    </Tooltip>
  );
}
