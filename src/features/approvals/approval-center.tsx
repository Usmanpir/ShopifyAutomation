"use client";

import { cn } from "cn";
import { ArrowUpRight, CheckCircle2, Eye, Inbox, Lock, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/states";
import { DECISION_STATUS, Pill, RiskBadge } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFormat } from "@/components/store-context";
import { AgentAvatar, relatedHref, toolShortLabel } from "@/features/agents/agent-meta";
import { friendlyAgentName } from "@/lib/ai/team";
import {
  ConfidenceMeter,
  DecideButton,
  type DecisionView,
  EvidenceGrid,
  evidenceOf,
  ExecutionResult,
  ExpiryChip,
  ImpactCallout,
  ReviewNote,
  useNow,
} from "./decision-parts";
import { useDecisionActions } from "./use-decision";
import { TimeAgo } from "@/components/shared/time-ago";

const EMPTY: Record<string, { title: string; description: string }> = {
  pending: { title: "You're all caught up", description: "No AI actions are waiting for approval. New recommendations appear here the moment an agent needs a human." },
  approved: { title: "Nothing approved yet", description: "Recommendations you approve are listed here with their execution result." },
  executed: { title: "No executed actions yet", description: "Actions run after approval — or automatically for autonomous agents — appear here." },
  rejected: { title: "Nothing rejected", description: "Rejected and expired recommendations are kept here for reference." },
  all: { title: "No AI recommendations yet", description: "When agents suggest an action, it appears here with the data behind it." },
};

export function ApprovalCenter({ decisions, status, canDecide, focusId }: { decisions: DecisionView[]; status: string; canDecide: boolean; focusId: string | null }) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(focusId);
  const now = useNow(30_000);
  const f = useFormat();
  const scrolled = useRef(false);

  const { approve, reject } = useDecisionActions((id) => {
    if (status === "pending") setRemoved((s) => new Set(s).add(id));
    setReviewId((r) => (r === id ? null : r));
  });

  const items = useMemo(() => decisions.filter((d) => !removed.has(d.id)), [decisions, removed]);
  const reviewing = reviewId ? decisions.find((d) => d.id === reviewId) ?? null : null;

  useEffect(() => {
    if (!focusId || scrolled.current) return;
    const el = document.getElementById(`decision-${focusId}`);
    if (!el) return;
    scrolled.current = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    (el as HTMLElement).focus({ preventScroll: true });
    const t = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(t);
  }, [focusId]);

  if (!items.length) {
    const e = EMPTY[status] ?? EMPTY.all;
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState icon={status === "pending" ? <CheckCircle2 /> : <Inbox />} title={e.title} description={e.description} />
      </div>
    );
  }

  const busyFor = (id: string) => (approve.isPending && approve.variables?.id === id) || (reject.isPending && reject.variables?.id === id);
  const formatTime = (s: string | null) => f.dateTime(s);

  return (
    <>
      <ul className="space-y-4" aria-label="AI recommendations">
        {items.map((d) => (
          <li key={d.id}>
            <DecisionCard
              d={d}
              now={now}
              canDecide={canDecide}
              busy={busyFor(d.id)}
              highlighted={highlight === d.id}
              formatTime={formatTime}
              onApprove={(note) => approve.mutate({ id: d.id, note })}
              onReject={(note) => reject.mutate({ id: d.id, note })}
              onReview={() => setReviewId(d.id)}
            />
          </li>
        ))}
      </ul>

      <Sheet open={!!reviewing} onOpenChange={(o) => !o && setReviewId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-xl">
          {reviewing && (
            <ReviewPanel
              d={reviewing}
              now={now}
              canDecide={canDecide}
              busy={busyFor(reviewing.id)}
              formatTime={formatTime}
              onApprove={(note) => approve.mutate({ id: reviewing.id, note })}
              onReject={(note) => reject.mutate({ id: reviewing.id, note })}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

type CardProps = {
  d: DecisionView;
  now: number;
  canDecide: boolean;
  busy: boolean;
  formatTime: (s: string | null) => string;
  onApprove: (note?: string) => void;
  onReject: (note?: string) => void;
};

function ActionChip({ action, stacked }: { action: string; stacked?: boolean }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs font-medium">
      <Zap className="size-3.5 shrink-0 text-ai" aria-hidden />
      <span className={cn("min-w-0", stacked && "flex flex-col")}>
        <span className="block truncate">{toolShortLabel(action)}</span>
        {stacked && <code className="block truncate font-mono text-[10.5px] font-normal text-muted-foreground">{action}</code>}
      </span>
    </span>
  );
}

function DecisionCard({ d, now, canDecide, busy, highlighted, formatTime, onApprove, onReject, onReview }: CardProps & { highlighted: boolean; onReview: () => void }) {
  const pending = d.status === "PENDING_APPROVAL";
  const evidence = evidenceOf(d);
  const rel = relatedHref(d.relatedType, d.relatedId);
  return (
    <article
      id={`decision-${d.id}`}
      tabIndex={-1}
      aria-labelledby={`decision-title-${d.id}`}
      className={cn(
        "scroll-mt-20 overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[box-shadow,border-color] duration-500 outline-none",
        highlighted && "border-ai/60 ring-4 ring-ai/15",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-surface-2/50 px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <AgentAvatar agentKey={d.agent?.key} size="sm" />
          <p className="min-w-0 truncate text-[13px]">
            <span className="font-semibold">{friendlyAgentName(d.agent?.key, d.agent?.name ?? "AI")}</span>
            <span className="text-muted-foreground"> · recommends · <TimeAgo date={d.createdAt} /></span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pending && <ExpiryChip expiresAt={d.expiresAt} now={now} />}
          <Pill map={DECISION_STATUS} value={d.status} />
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-4">
          <h3 id={`decision-title-${d.id}`} className="text-base leading-6 font-semibold tracking-tight">
            {d.title}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">What happened</h4>
              <p className="mt-1 text-sm leading-6">{d.summary}</p>
            </div>
            <div>
              <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Why it matters</h4>
              <p className="mt-1 text-sm leading-6 text-foreground/85">{d.reasoning}</p>
            </div>
          </div>
          {evidence.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Data supporting it</h4>
              <EvidenceGrid items={evidence} />
            </div>
          )}
          {d.expectedImpact && <ImpactCallout text={d.expectedImpact} />}
          <ExecutionResult d={d} formatTime={formatTime} />
          <ReviewNote d={d} formatTime={formatTime} />
        </div>

        <aside className="flex flex-col gap-4 rounded-lg bg-surface-2 p-3.5 lg:self-start" aria-label="Decision details">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Proposed action</p>
            <ActionChip action={d.action} stacked />
          </div>
          {d.stake && (
            <div className="rounded-md border bg-card px-3 py-2">
              <p className="text-xs text-muted-foreground">{d.stake.label}</p>
              <p className="tabular text-base font-semibold">{d.stake.value}</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Risk</span>
            <RiskBadge level={d.riskLevel} />
          </div>
          <ConfidenceMeter value={d.confidence} />
          {rel && (
            <Link href={rel.href} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
              {rel.label} <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-5">
        {pending && !canDecide ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden /> View only — your role can&apos;t approve actions
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-ai" aria-hidden />
            {pending ? "Nothing runs until a human approves" : d.requiresApproval ? "Reviewed by a human" : "Low-risk action — ran without approval"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onReview}>
            <Eye /> Review
          </Button>
          {pending && canDecide && (
            <>
              <DecideButton kind="reject" title={d.title} actionLabel={toolShortLabel(d.action)} busy={busy} onConfirm={onReject} />
              <DecideButton kind="approve" title={d.title} actionLabel={toolShortLabel(d.action)} busy={busy} onConfirm={onApprove} />
            </>
          )}
        </div>
      </footer>
    </article>
  );
}

function ReviewPanel({ d, now, canDecide, busy, formatTime, onApprove, onReject }: CardProps) {
  const pending = d.status === "PENDING_APPROVAL";
  const evidence = evidenceOf(d);
  const rel = relatedHref(d.relatedType, d.relatedId);
  const json = JSON.stringify(d.actionInput ?? {}, null, 2);
  const meta = [
    { label: "Agent", value: d.agent?.name ?? "AI" },
    { label: "Created", value: formatTime(d.createdAt) },
    ...(d.expiresAt && pending ? [{ label: "Expires", value: formatTime(d.expiresAt) }] : []),
    { label: "Approval", value: d.requiresApproval ? "Required" : "Not required" },
    ...(d.automationRunId ? [{ label: "Automation run", value: "Waiting on this decision" }] : []),
    { label: "Reference", value: d.id },
  ];
  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="gap-2 border-b bg-ai-gradient px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 pr-8">
          <AgentAvatar agentKey={d.agent?.key} size="sm" />
          <span className="text-[13px] text-muted-foreground">{friendlyAgentName(d.agent?.key, d.agent?.name ?? "AI")} recommends</span>
        </div>
        <SheetTitle className="text-lg leading-6 font-semibold tracking-tight">{d.title}</SheetTitle>
        <SheetDescription className="sr-only">Full details of this AI recommendation</SheetDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Pill map={DECISION_STATUS} value={d.status} />
          <RiskBadge level={d.riskLevel} />
          {pending && <ExpiryChip expiresAt={d.expiresAt} now={now} />}
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-5 px-5 py-5">
        <section>
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">What happened</h3>
          <p className="mt-1 text-sm leading-6">{d.summary}</p>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Why it matters</h3>
          <p className="mt-1 text-sm leading-6">{d.reasoning}</p>
        </section>
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Data supporting it</h3>
          <EvidenceGrid items={evidence} className="sm:grid-cols-2" />
        </section>
        {d.expectedImpact && <ImpactCallout text={d.expectedImpact} />}
        <ConfidenceMeter value={d.confidence} />

        <section>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Action to execute</h3>
            <ActionChip action={d.action} />
          </div>
          <pre className="scrollbar-thin max-h-64 overflow-auto rounded-lg border bg-surface-2 p-3 font-mono text-[12px] leading-5" aria-label="Action input">
            {json}
          </pre>
          <p className="mt-1.5 text-xs text-muted-foreground">Input is re-validated and permission-checked when it runs.</p>
        </section>

        <ExecutionResult d={d} formatTime={formatTime} />
        <ReviewNote d={d} formatTime={formatTime} />

        <dl className="divide-y rounded-lg border text-[13px]">
          {meta.map((m) => (
            <div key={m.label} className="flex items-center justify-between gap-4 px-3 py-2">
              <dt className="text-muted-foreground">{m.label}</dt>
              <dd className={cn("min-w-0 truncate text-right font-medium", m.label === "Reference" && "font-mono text-[11.5px]")}>{m.value}</dd>
            </div>
          ))}
        </dl>
        {rel && (
          <Button asChild variant="outline" className="w-full">
            <Link href={rel.href}>
              {rel.label} <ArrowUpRight />
            </Link>
          </Button>
        )}
      </div>

      {pending && (
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-popover px-5 py-3">
          {canDecide ? (
            <>
              <DecideButton kind="reject" title={d.title} actionLabel={toolShortLabel(d.action)} busy={busy} onConfirm={onReject} size="default" />
              <DecideButton kind="approve" title={d.title} actionLabel={toolShortLabel(d.action)} busy={busy} onConfirm={onApprove} size="default" />
            </>
          ) : (
            <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" aria-hidden /> View only — your role can&apos;t approve actions
            </span>
          )}
        </div>
      )}
    </div>
  );
}
