"use client";

import { cn } from "cn";
import { AlertTriangle, Ban, Loader2, Timer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Pill, RUN_STATUS, StatusPill, type Tone } from "@/components/shared/status";
import { useCan, useFormat } from "@/components/store-context";
import { humanize } from "@/lib/automation/describe";
import type { NodeType, RunStep } from "@/lib/automation/types";
import { api, errorMessage } from "@/lib/client/api";
import { ACTIVE_RUN_STATUSES, accentStyle, NODE_VISUAL } from "./meta";
import { TimeAgo } from "@/components/shared/time-ago";

export type RunRow = {
  id: string;
  automationId: string;
  automation?: { name: string } | null;
  status: string;
  triggerEvent: string;
  startedAt: string;
  finishedAt: string | null;
  resumeAt?: string | null;
  currentNodeKey: string | null;
  steps: RunStep[];
  error: string | null;
};

const OUTCOMES: Record<string, { label: string; tone: Tone }> = {
  triggered: { label: "Triggered", tone: "ai" },
  true: { label: "Yes", tone: "success" },
  false: { label: "No", tone: "neutral" },
  done: { label: "Done", tone: "success" },
  waiting: { label: "Waiting", tone: "warning" },
  resumed: { label: "Resumed", tone: "info" },
  awaiting_approval: { label: "Awaiting approval", tone: "ai" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  sent: { label: "Sent", tone: "success" },
  error: { label: "Error", tone: "danger" },
};

export function outcomeMeta(outcome: string): { label: string; tone: Tone } {
  return OUTCOMES[outcome] ?? { label: humanize(outcome), tone: "ai" };
}

export function triggerEventLabel(triggerEvent: string) {
  const manual = triggerEvent.endsWith("(manual)");
  return { label: humanize(triggerEvent.replace(" (manual)", "")), manual };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Current/last step label for a run. */
export function currentStepLabel(run: Pick<RunRow, "steps" | "currentNodeKey" | "status">): string {
  const last = run.steps[run.steps.length - 1];
  if (ACTIVE_RUN_STATUSES.includes(run.status)) return last?.label ?? run.currentNodeKey ?? "Starting";
  return last?.label ?? "—";
}

/** Vertical timeline of a run's executed steps. */
export function RunTimeline({ steps, error, className }: { steps: RunStep[]; error?: string | null; className?: string }) {
  const f = useFormat();
  if (!steps.length) return <p className="py-6 text-center text-sm text-muted-foreground">No steps executed yet.</p>;
  return (
    <ol className={cn("relative space-y-0", className)} aria-label="Run steps">
      {steps.map((s, i) => {
        const v = NODE_VISUAL[s.type as NodeType] ?? NODE_VISUAL.ACTION;
        const o = outcomeMeta(s.outcome);
        const last = i === steps.length - 1;
        const isError = s.outcome === "error";
        return (
          <li key={`${s.nodeKey}-${i}`} className="relative flex gap-3 pb-4 last:pb-0" style={accentStyle((s.type as NodeType) ?? "ACTION")}>
            {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[13px] w-px bg-border" />}
            <span
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-items-center rounded-lg ring-1",
                isError ? "bg-danger-soft text-danger ring-danger/20" : "bg-[color-mix(in_oklch,var(--node-accent)_14%,transparent)] text-[var(--node-accent)] ring-[color-mix(in_oklch,var(--node-accent)_25%,transparent)]",
              )}
            >
              <v.icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-medium">{s.label}</p>
                <StatusPill tone={o.tone}>{o.label}</StatusPill>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {v.label} · <time dateTime={s.at}>{f.dateTime(s.at)}</time>
              </p>
              {s.detail && <p className={cn("mt-1.5 rounded-md px-2 py-1.5 text-xs break-words", isError ? "bg-danger-soft text-danger" : "bg-muted/60 text-foreground/80")}>{formatDetail(s.detail, f.dateTime)}</p>}
            </div>
          </li>
        );
      })}
      {error && (
        <li role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </li>
      )}
    </ol>
  );
}

/** "Until 2026-…Z" → readable local time. */
function formatDetail(detail: string, dateTime: (d: string) => string) {
  const m = /^Until (\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/.exec(detail);
  return m ? `Resumes ${dateTime(m[1])}` : detail;
}

/** Side sheet with run details, step timeline and cancel. */
export function RunSheet({ run, open, onOpenChange, onChanged, showAutomationLink = true }: { run: RunRow | null; open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void; showAutomationLink?: boolean }) {
  const f = useFormat();
  const can = useCan();
  const [cancelling, setCancelling] = useState(false);
  const active = run ? ACTIVE_RUN_STATUSES.includes(run.status) : false;
  const trig = run ? triggerEventLabel(run.triggerEvent) : null;

  const cancel = async () => {
    if (!run) return;
    setCancelling(true);
    try {
      await api(`/api/automations/runs/${run.id}`, { method: "DELETE" });
      toast.success("Run cancelled");
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {run && (
          <>
            <SheetHeader className="border-b px-5 pt-5 pb-4">
              <div className="flex items-center gap-2 pr-8">
                <Pill map={RUN_STATUS} value={run.status} />
                {trig?.manual && <StatusPill tone="info" dot={false}>Test run</StatusPill>}
              </div>
              <SheetTitle className="mt-2 text-base">{run.automation?.name ?? "Automation run"}</SheetTitle>
              <SheetDescription>
                Triggered by {trig?.label} · <TimeAgo date={run.startedAt} />
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <dl className="mb-5 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="mt-0.5 font-medium">{f.dateTime(run.startedAt)}</dd>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <dt className="text-muted-foreground">{run.finishedAt ? "Duration" : run.status === "WAITING" && run.resumeAt ? "Resumes" : "Current step"}</dt>
                  <dd className="mt-0.5 truncate font-medium">
                    {run.finishedAt
                      ? formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())
                      : run.status === "WAITING" && run.resumeAt
                        ? f.dateTime(run.resumeAt)
                        : currentStepLabel(run)}
                  </dd>
                </div>
              </dl>
              <h3 className="mb-3 text-[13px] font-semibold">Steps</h3>
              <RunTimeline steps={run.steps} error={run.error} />
              {run.status === "WAITING" && (
                <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="size-3.5" /> Waiting runs resume automatically on schedule.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 border-t px-5 py-3">
              {showAutomationLink && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/automations/${run.automationId}`}>Open workflow</Link>
                </Button>
              )}
              {active && can("automations.manage") && (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="ml-auto text-danger hover:text-danger" disabled={cancelling}>
                      {cancelling ? <Loader2 className="animate-spin" /> : <Ban />} Cancel run
                    </Button>
                  }
                  title="Cancel this run?"
                  description="Remaining steps won't execute. Steps that already ran are not undone."
                  confirmLabel="Cancel run"
                  destructive
                  onConfirm={cancel}
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
