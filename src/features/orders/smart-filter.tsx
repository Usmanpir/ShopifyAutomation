"use client";

import { cn } from "cn";
import { CornerDownLeft, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useUrlState } from "@/components/shared/url-controls";
import { chipsFor, parseOrderQuery, type OrderFilterParams } from "@/lib/nl-filters";

const FILTER_PARAMS: (keyof OrderFilterParams)[] = ["tab", "risk", "payment", "city", "days", "min", "max", "late", "confirmation", "q"];
const EXAMPLES = ["high-risk COD orders from Lahore in the last 3 days", "unconfirmed orders over 10k", "late orders", "returns this month"];

/**
 * Type what you want to see; it becomes ordinary filters shown as chips.
 * Words that weren't understood are said out loud, never guessed.
 */
export function SmartOrderFilter({ visibleTabs }: { visibleTabs: string[] }) {
  const { params, set, pending } = useUrlState();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const current = Object.fromEntries(FILTER_PARAMS.map((k) => [k, params.get(k) ?? undefined]).filter(([, v]) => v)) as OrderFilterParams;
  // Tabs on screen already show the status; only older tab links (e.g. high_risk) need a chip.
  const customerId = params.get("customerId");
  const chips = chipsFor({ ...current, tab: current.tab && !visibleTabs.includes(current.tab) ? current.tab : undefined });

  const apply = (input: string) => {
    const { params: next, chips: found, leftover } = parseOrderQuery(input);
    if (!found.length) {
      setNote(`I couldn't turn “${input}” into a filter. Try words like risk, COD, a city, “last 3 days”, “over 5000”, shipped or returns.`);
      return;
    }
    // A new sentence replaces the previous filters.
    set(Object.fromEntries(FILTER_PARAMS.map((k) => [k, next[k] ?? (k === "tab" ? "all" : null)])));
    setNote(leftover ? `Ignored: “${leftover}”` : null);
    setText("");
  };

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) apply(text.trim());
        }}
        className="group relative"
      >
        <Sparkles className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ai" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the orders you want — e.g. “high-risk COD orders from Lahore in the last 3 days”"
          aria-label="Filter orders in plain language"
          className="h-10 w-full rounded-lg border bg-card pr-10 pl-9 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ai/50 focus-visible:ring-3 focus-visible:ring-ai/20"
        />
        <button type="submit" disabled={!text.trim() || pending} aria-label="Apply filter" className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
        </button>
      </form>
      {(chips.length > 0 || note || customerId) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {customerId && (
            <span className="inline-flex h-7 items-center gap-1 rounded-full border bg-card pr-1 pl-2.5 text-[12.5px] font-medium">
              One customer
              <button type="button" onClick={() => set({ customerId: null })} aria-label="Remove customer filter" className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
          )}
          {chips.map((c) => (
            <span key={c.param} className="inline-flex h-7 items-center gap-1 rounded-full border bg-card pr-1 pl-2.5 text-[12.5px] font-medium">
              {c.label}
              <button type="button" onClick={() => set({ [c.param]: null, ...(c.param === "late" ? { tab: null } : {}) })} aria-label={`Remove filter ${c.label}`} className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
          ))}
          {chips.length > 1 && (
            <button type="button" onClick={() => set(Object.fromEntries(FILTER_PARAMS.map((k) => [k, null])))} className="h-7 px-2 text-[12.5px] font-medium text-primary hover:underline">
              Clear all
            </button>
          )}
          {note && <span className={cn("text-xs text-muted-foreground", chips.length && "ml-1")}>{note}</span>}
        </div>
      )}
      {!chips.length && !note && !customerId && (
        <p className="hidden flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          Try:
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => apply(ex)} className="rounded-full bg-muted px-2 py-0.5 hover:bg-muted/70 hover:text-foreground">
              {ex}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
