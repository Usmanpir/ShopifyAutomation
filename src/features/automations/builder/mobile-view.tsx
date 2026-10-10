"use client";

import { AlertCircle, ArrowLeft, FlaskConical, Loader2, Monitor } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/shared/status";
import { handleLabel, orderedNodes, summarizeNode } from "@/lib/automation/describe";
import type { AutomationGraph } from "@/lib/automation/types";
import { accentStyle, AUTOMATION_STATUS, NODE_VISUAL } from "../meta";
import { RunsTable } from "../runs-table";
import { useAutomationRuns } from "./run-history";

/** Read-only step list for small screens, with activate/pause and test run. */
export function MobileView({
  automationId,
  name,
  description,
  status,
  graph,
  errorCount,
  canManage,
  busy,
  onToggle,
  onTestRun,
}: {
  automationId: string;
  name: string;
  description: string;
  status: string;
  graph: AutomationGraph;
  errorCount: number;
  canManage: boolean;
  busy: "status" | "test" | null;
  onToggle: (on: boolean) => void;
  onTestRun: () => void;
}) {
  const ordered = orderedNodes(graph);
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const [showRuns, setShowRuns] = useState(false);
  const runs = useAutomationRuns(automationId, showRuns);

  return (
    <div className="space-y-5 px-4 py-5">
      <div className="space-y-3">
        <Link href="/automations" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Automations
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{name}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <Pill map={AUTOMATION_STATUS} value={status} />
        </div>
        {canManage && (
          <div className="flex items-center gap-2 rounded-xl border bg-card p-3">
            <label className="flex flex-1 items-center gap-3 text-sm font-medium">
              <Switch checked={status === "ACTIVE"} disabled={busy !== null} onCheckedChange={onToggle} aria-label={status === "ACTIVE" ? "Pause automation" : "Activate automation"} />
              {status === "ACTIVE" ? "Active" : "Inactive"}
            </label>
            <Button variant="outline" size="sm" onClick={onTestRun} disabled={busy !== null || errorCount > 0}>
              {busy === "test" ? <Loader2 className="animate-spin" /> : <FlaskConical />} Test run
            </Button>
          </div>
        )}
        {errorCount > 0 && (
          <p className="flex items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
            <AlertCircle className="size-3.5 shrink-0" /> {errorCount} problem{errorCount === 1 ? "" : "s"} to fix on desktop before this can run.
          </p>
        )}
        <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Monitor className="size-3.5 shrink-0" /> Editing works best on a larger screen. Here you can review steps, activate and test.
        </p>
      </div>

      <section aria-label="Workflow steps">
        <h2 className="mb-3 text-[15px] font-semibold">Steps</h2>
        <ol className="relative space-y-2">
          {ordered.map(({ node, via }, i) => {
            const v = NODE_VISUAL[node.type];
            const branch = via ? handleLabel(byKey.get(via.from), via.handle) : "";
            const from = via && branch ? byKey.get(via.from)?.label : null;
            return (
              <li key={node.key} style={accentStyle(node.type)} className="relative">
                {i > 0 && <span aria-hidden className="absolute -top-2 left-[27px] h-2 w-px bg-border" />}
                <div className="flex items-start gap-3 rounded-xl border border-l-[3px] border-l-[var(--node-accent)] bg-card p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklch,var(--node-accent)_13%,transparent)] text-[var(--node-accent)]" aria-hidden>
                    <v.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold tracking-wider text-[var(--node-accent)] uppercase">
                      {node.type === "TRIGGER" ? "When" : v.label}
                      {branch && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-px font-medium tracking-normal text-muted-foreground normal-case">
                          {from ? `${from} → ${branch}` : branch}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{node.label}</p>
                    {summarizeNode(node) !== node.label && <p className="text-xs text-muted-foreground">{summarizeNode(node)}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="Run history" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Recent runs</h2>
          {!showRuns && (
            <Button variant="ghost" size="sm" onClick={() => setShowRuns(true)}>
              Show
            </Button>
          )}
        </div>
        {showRuns &&
          (runs.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <RunsTable rows={runs.data ?? []} showAutomation={false} onChanged={() => void runs.refetch()} />
          ))}
      </section>
    </div>
  );
}
