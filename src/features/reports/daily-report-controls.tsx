"use client";

import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Loader2, Printer, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/components/store-context";
import { api, errorMessage } from "@/lib/client/api";
import { dayKey } from "@/lib/dates";

type Option = { value: string; label: string };

/** History picker + "Generate now" + print, for the daily AI report. */
export function DailyReportControls({ options, selected, yesterday, hasReport }: { options: Option[]; selected: string | null; yesterday: string; hasReport: boolean }) {
  const router = useRouter();
  const { store } = useStore();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(selected ?? yesterday);

  const generate = useMutation({
    mutationFn: (d: string | undefined) => api<{ periodStart: string }>("/api/reports/daily", { method: "POST", body: d ? { date: d } : {} }),
    onSuccess: (r) => {
      const key = dayKey(new Date(r.periodStart), store.timezone);
      toast.success("Report generated", { description: `Daily business report for ${key} is ready.` });
      setOpen(false);
      start(() => {
        router.push(`/reports/daily?date=${key}`, { scroll: false });
        router.refresh();
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const busy = generate.isPending || pending;

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {options.length > 0 && (
        <Select value={selected ?? undefined} onValueChange={(v) => start(() => router.push(`/reports/daily?date=${v}`, { scroll: false }))}>
          <SelectTrigger size="sm" className="h-9 min-w-48 bg-card" aria-label="Report date">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarDays className="size-4 text-muted-foreground" />}
            <SelectValue placeholder="Choose a date" />
          </SelectTrigger>
          <SelectContent align="end">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 bg-card" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : hasReport ? <RefreshCw /> : <Sparkles className="text-ai" />}
            Generate now
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div>
            <p className="text-sm font-semibold">Generate a daily report</p>
            <p className="text-xs text-muted-foreground">Re-runs the numbers and AI insights for the chosen day. Existing reports are replaced.</p>
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              generate.mutate(date || undefined);
            }}
          >
            <label className="block space-y-1 text-xs font-medium">
              <span>Day</span>
              <input type="date" value={date} max={yesterday} onChange={(e) => setDate(e.target.value)} className="h-9 w-full rounded-lg border bg-card px-2 text-sm" />
            </label>
            <Button type="submit" className="w-full" disabled={busy || !date}>
              {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate report
            </Button>
          </form>
        </PopoverContent>
      </Popover>

      {hasReport && (
        <Button className="h-9" onClick={() => window.print()}>
          <Printer /> Print / Save as PDF
        </Button>
      )}
    </div>
  );
}

/** Primary CTA when no report exists yet. */
export function GenerateFirstReport({ date }: { date?: string }) {
  const router = useRouter();
  const { store } = useStore();
  const generate = useMutation({
    mutationFn: () => api<{ periodStart: string }>("/api/reports/daily", { method: "POST", body: date ? { date } : {} }),
    onSuccess: (r) => {
      toast.success("Report generated");
      router.push(`/reports/daily?date=${dayKey(new Date(r.periodStart), store.timezone)}`, { scroll: false });
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
      {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate {date ? `report for ${date}` : "yesterday's report"}
    </Button>
  );
}
