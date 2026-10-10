"use client";
import { TimeAgo } from "@/components/shared/time-ago";

import { cn } from "cn";
import { ChevronRight, History, Hourglass } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/shared/states";
import { Pill, RUN_STATUS, StatusPill } from "@/components/shared/status";

import { currentStepLabel, formatDuration, RunSheet, triggerEventLabel, type RunRow } from "./run-timeline";

function Finished({ run }: { run: RunRow }) {
  if (run.finishedAt) {
    return (
      <span className="tabular">
        {formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())}
        <span className="block text-xs text-muted-foreground"><TimeAgo date={run.finishedAt} /></span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Hourglass className="size-3.5" /> In progress
    </span>
  );
}

/** Recent automation runs; each row opens the step timeline in a sheet. */
export function RunsTable({ rows, showAutomation = true, onChanged, filtered }: { rows: RunRow[]; showAutomation?: boolean; onChanged?: () => void; filtered?: boolean }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = rows.find((r) => r.id === selectedId) ?? null;
  const setOpenId = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };
  const changed = onChanged ?? (() => router.refresh());

  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          icon={<History />}
          title={filtered ? "No runs match this filter" : "No runs yet"}
          description={filtered ? "Try another status." : "Runs appear here when an active automation is triggered, or when you start a test run from the builder."}
        />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <table className="hidden w-full text-sm md:table">
          <caption className="sr-only">Automation runs</caption>
          <thead>
            <tr className="border-b bg-surface-2/60 text-left text-[12px] font-medium text-muted-foreground">
              {showAutomation && <th scope="col" className="px-4 py-2.5 font-medium">Automation</th>}
              <th scope="col" className="px-4 py-2.5 font-medium">Trigger</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Current / last step</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Started</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Duration</th>
              <th scope="col" className="w-10 px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const trig = triggerEventLabel(r.triggerEvent);
              return (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40">
                  {showAutomation && (
                    <td className="max-w-64 px-4 py-3">
                      <button type="button" onClick={() => setOpenId(r.id)} className="truncate text-left font-medium hover:text-primary focus-visible:text-primary">
                        {r.automation?.name ?? "Automation"}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      {showAutomation ? trig.label : (
                        <button type="button" onClick={() => setOpenId(r.id)} className="text-left font-medium hover:text-primary">
                          {trig.label}
                        </button>
                      )}
                      {trig.manual && <StatusPill tone="info" dot={false} className="h-5 text-[10.5px]">Test</StatusPill>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Pill map={RUN_STATUS} value={r.status} />
                  </td>
                  <td className="max-w-56 truncate px-4 py-3 text-muted-foreground">{currentStepLabel(r)}</td>
                  <td className="px-4 py-3 whitespace-nowrap" title={new Date(r.startedAt).toLocaleString()}>
                    <TimeAgo date={r.startedAt} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Finished run={r} />
                  </td>
                  <td className="px-2 text-muted-foreground">
                    <ChevronRight className="size-4" aria-hidden />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="divide-y md:hidden">
          {rows.map((r) => {
            const trig = triggerEventLabel(r.triggerEvent);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{showAutomation ? (r.automation?.name ?? "Automation") : trig.label}</p>
                      <Pill map={RUN_STATUS} value={r.status} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {showAutomation && `${trig.label} · `}
                      {currentStepLabel(r)} · <TimeAgo date={r.startedAt} />
                    </p>
                  </div>
                  <ChevronRight className={cn("mt-1 size-4 shrink-0 text-muted-foreground")} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <RunSheet run={open} open={sheetOpen && !!open} onOpenChange={setSheetOpen} onChanged={changed} showAutomationLink={showAutomation} />
    </>
  );
}
