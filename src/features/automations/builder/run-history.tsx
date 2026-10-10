"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ChevronRight, History, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Bone } from "@/components/shared/skeletons";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Pill, RUN_STATUS, StatusPill } from "@/components/shared/status";
import { useFormat } from "@/components/store-context";
import { api, errorMessage } from "@/lib/client/api";
import { ACTIVE_RUN_STATUSES } from "../meta";
import { currentStepLabel, formatDuration, RunTimeline, triggerEventLabel, type RunRow } from "../run-timeline";
import { TimeAgo } from "@/components/shared/time-ago";

export const runsQueryKey = (automationId: string) => ["automation-runs", automationId];

export function useAutomationRuns(automationId: string, enabled = true) {
  return useQuery({
    queryKey: runsQueryKey(automationId),
    queryFn: () => api<RunRow[]>(`/api/automations/runs?automationId=${automationId}&limit=30`),
    enabled,
    refetchInterval: 20_000,
  });
}

/** Run history for one automation, with inline step timeline + canvas path highlight. */
export function RunHistory({ automationId, canManage, onHighlight }: { automationId: string; canManage: boolean; onHighlight: (keys: Set<string> | null) => void }) {
  const f = useFormat();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useAutomationRuns(automationId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const open = data?.find((r) => r.id === openId) ?? null;

  const select = (run: RunRow | null) => {
    setOpenId(run?.id ?? null);
    onHighlight(run ? new Set(run.steps.map((s) => s.nodeKey)) : null);
  };

  const cancel = async (run: RunRow) => {
    setCancelling(true);
    try {
      await api(`/api/automations/runs/${run.id}`, { method: "DELETE" });
      toast.success("Run cancelled");
      await qc.invalidateQueries({ queryKey: runsQueryKey(automationId) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  };

  if (open) {
    const trig = triggerEventLabel(open.triggerEvent);
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Button variant="ghost" size="icon-sm" onClick={() => select(null)} aria-label="Back to run list">
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">
              {trig.label}
              {trig.manual && <span className="font-normal text-muted-foreground"> · test</span>}
            </p>
            <p className="text-[11.5px] text-muted-foreground">{f.dateTime(open.startedAt)}</p>
          </div>
          <Pill map={RUN_STATUS} value={open.status} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-3 text-[11.5px] text-muted-foreground">The path this run took is highlighted on the canvas.</p>
          <RunTimeline steps={open.steps} error={open.error} />
        </div>
        {ACTIVE_RUN_STATUSES.includes(open.status) && canManage && (
          <div className="border-t px-4 py-3">
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm" className="w-full text-danger hover:bg-danger-soft hover:text-danger" disabled={cancelling}>
                  {cancelling ? <Loader2 className="animate-spin" /> : <Ban />} Cancel run
                </Button>
              }
              title="Cancel this run?"
              description="Remaining steps won't execute. Steps that already ran are not undone."
              confirmLabel="Cancel run"
              destructive
              onConfirm={() => cancel(open)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-[12px] text-muted-foreground">Last 30 runs</p>
        <Button variant="ghost" size="icon-sm" onClick={() => void refetch()} aria-label="Refresh runs" disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : undefined} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState description="We couldn't load run history." onRetry={() => void refetch()} />
        ) : !data?.length ? (
          <EmptyState compact icon={<History />} title="No runs yet" description="Activate the workflow or start a test run to see each step it takes." />
        ) : (
          <ul className="divide-y">
            {data.map((r) => {
              const trig = triggerEventLabel(r.triggerEvent);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => select(r)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-muted/50 focus-visible:bg-muted/50">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Pill map={RUN_STATUS} value={r.status} />
                        {trig.manual && (
                          <StatusPill tone="info" dot={false} className="h-5 text-[10.5px]">
                            Test
                          </StatusPill>
                        )}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground"><TimeAgo date={r.startedAt} /></span>
                      </div>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {currentStepLabel(r)}
                        {r.finishedAt && ` · ${formatDuration(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime())}`}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
