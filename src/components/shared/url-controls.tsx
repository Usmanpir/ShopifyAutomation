"use client";

import { cn } from "cn";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Updates URL search params (resetting pagination) inside a transition. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (updates: Record<string, string | null | undefined>, opts: { keepPage?: boolean } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!opts.keepPage && !("page" in updates)) next.delete("page");
    const qs = next.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, set, pending };
}

export type TabDef = { value: string; label: string; count?: number; tone?: "danger" | "warning" };

/** Pill tabs bound to a URL param. Scrolls horizontally on mobile. */
export function FilterTabs({ tabs, param = "tab", defaultValue = "all", className }: { tabs: TabDef[]; param?: string; defaultValue?: string; className?: string }) {
  const { params, set, pending } = useUrlState();
  const current = params.get(param) ?? defaultValue;
  return (
    <div role="tablist" aria-label="Filter" className={cn("scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1", pending && "opacity-80", className)}>
      {tabs.map((t) => {
        const active = current === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => set({ [param]: t.value === defaultValue ? null : t.value })}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition",
              active ? "border-foreground/10 bg-foreground text-background" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[11px]",
                  active ? "bg-background/20" : t.tone === "danger" && t.count > 0 ? "bg-danger-soft text-danger" : t.tone === "warning" && t.count > 0 ? "bg-warning-soft text-warning" : "bg-muted",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Debounced search box bound to ?q= */
export function SearchInput({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { params, set, pending } = useUrlState();
  const [value, setValue] = useState(params.get(param) ?? "");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => set({ [param]: value.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border bg-card pr-8 pl-9 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
      {pending ? (
        <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value && (
          <button type="button" onClick={() => setValue("")} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )
      )}
    </div>
  );
}

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

/** Date range presets (+ custom from/to) bound to ?range=&from=&to= */
export function RangeSelect({ defaultValue = "7d", className }: { defaultValue?: string; className?: string }) {
  const { params, set, pending } = useUrlState();
  const value = params.get("range") ?? defaultValue;
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select value={value} onValueChange={(v) => set({ range: v === defaultValue ? null : v, ...(v !== "custom" ? { from: null, to: null } : {}) })}>
        <SelectTrigger size="sm" className="h-9 min-w-40 bg-card" aria-label="Date range">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarDays className="size-4 text-muted-foreground" />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {RANGES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === "custom" && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) set({ range: "custom", from, to });
          }}
        >
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="h-9 rounded-lg border bg-card px-2 text-sm" />
          <span className="text-muted-foreground">–</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" className="h-9 rounded-lg border bg-card px-2 text-sm" />
          <Button type="submit" size="sm" variant="outline" className="h-9" disabled={!from || !to}>
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}

/** Server-side pagination bound to ?page= */
export function Pagination({ page, pageCount, total, pageSize, className }: { page: number; pageCount: number; total: number; pageSize: number; className?: string }) {
  const { set, pending } = useUrlState();
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm", className)}>
      <p className="text-muted-foreground">
        <span className="tabular font-medium text-foreground">
          {from}–{to}
        </span>{" "}
        of <span className="tabular font-medium text-foreground">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1 || pending} onClick={() => set({ page: String(page - 1) }, { keepPage: true })} aria-label="Previous page">
          <ChevronLeft /> <span className="hidden sm:inline">Previous</span>
        </Button>
        <span className="tabular px-2 text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pageCount || pending} onClick={() => set({ page: String(page + 1) }, { keepPage: true })} aria-label="Next page">
          <span className="hidden sm:inline">Next</span> <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Generic select filter bound to a URL param. */
export function SelectFilter({ param, options, placeholder, className }: { param: string; options: { value: string; label: string }[]; placeholder: string; className?: string }) {
  const { params, set } = useUrlState();
  const value = params.get(param) ?? "__all";
  return (
    <Select value={value} onValueChange={(v) => set({ [param]: v === "__all" ? null : v })}>
      <SelectTrigger size="sm" className={cn("h-9 min-w-36 bg-card", className)} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
