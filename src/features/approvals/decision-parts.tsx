"use client";

import { cn } from "cn";
import { CheckCircle2, Clock, Loader2, Timer, TrendingUp, XCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

/** Shape of a decision as serialized from listDecisions / getDecision. */
export type DecisionView = {
  id: string;
  title: string;
  summary: string;
  reasoning: string;
  evidence: unknown;
  action: string;
  actionInput: unknown;
  expectedImpact: string | null;
  riskLevel: string;
  confidence: number | null;
  requiresApproval: boolean;
  status: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  executedAt: string | null;
  executionResult: unknown;
  relatedType: string | null;
  relatedId: string | null;
  automationRunId: string | null;
  expiresAt: string | null;
  createdAt: string;
  agent: { name: string; key: string } | null;
  reviewedBy: { name: string } | null;
  /** What's concretely at stake if approved (money or people), when known. */
  stake?: { label: string; value: string } | null;
};

export type EvidenceItem = { label: string; value: string; points?: number };

export function evidenceOf(d: DecisionView): EvidenceItem[] {
  return Array.isArray(d.evidence) ? (d.evidence as EvidenceItem[]).filter((e) => e && typeof e.label === "string") : [];
}

/** Re-renders on an interval so countdowns stay fresh. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function countdown(to: string | null, now: number): { label: string; urgent: boolean; expired: boolean } | null {
  if (!to) return null;
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return { label: "Expired", urgent: true, expired: true };
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const label = d >= 1 ? `${d}d ${h % 24}h left` : h >= 1 ? `${h}h ${m % 60}m left` : `${Math.max(1, m)}m left`;
  return { label, urgent: diff < 6 * 3_600_000, expired: false };
}

export function ExpiryChip({ expiresAt, now }: { expiresAt: string | null; now: number }) {
  const c = countdown(expiresAt, now);
  if (!c) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", c.urgent ? "font-medium text-warning" : "text-muted-foreground")} title={expiresAt ? new Date(expiresAt).toLocaleString() : undefined}>
      <Timer className="size-3.5" aria-hidden />
      {c.label}
    </span>
  );
}

/** Only rendered for real model confidence — never a placeholder. */
export function ConfidenceMeter({ value, className }: { value: number | null; className?: string }) {
  if (typeof value !== "number") return null;
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? "bg-success" : pct >= 60 ? "bg-ai" : "bg-warning";
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className="tabular font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="AI confidence">
        <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EvidenceGrid({ items, className }: { items: EvidenceItem[]; className?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No supporting data attached.</p>;
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
    <dl className={cn("-mr-px -mb-px grid grid-cols-2 sm:grid-cols-3", className)}>
      {items.map((e, i) => (
        <div key={`${e.label}-${i}`} className="min-w-0 border-r border-b px-3 py-2.5">
          <dt className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">{e.label}</span>
            {typeof e.points === "number" && e.points !== 0 && (
              <span className={cn("tabular shrink-0 rounded px-1 text-[10px] font-semibold", e.points > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success")} title="Risk points">
                {e.points > 0 ? "+" : ""}
                {e.points}
              </span>
            )}
          </dt>
          <dd className="mt-0.5 text-[13px] leading-5 font-semibold wrap-break-word">{e.value}</dd>
        </div>
      ))}
    </dl>
    </div>
  );
}

export function ImpactCallout({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-success-soft/60 px-3 py-2.5 text-[13px] leading-5">
      <TrendingUp className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      <p>
        <span className="font-semibold text-success">Expected impact · </span>
        {text}
      </p>
    </div>
  );
}

type ExecResult = { ok?: boolean; status?: string; error?: string; output?: unknown };

export function ExecutionResult({ d, formatTime }: { d: DecisionView; formatTime: (s: string | null) => string }) {
  const r = (d.executionResult ?? null) as ExecResult | null;
  if (!["EXECUTED", "AUTO_EXECUTED", "FAILED"].includes(d.status)) return null;
  const failed = d.status === "FAILED" || r?.ok === false;
  return (
    <div className={cn("flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-5", failed ? "bg-danger-soft/70" : "bg-success-soft/60")}>
      {failed ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />}
      <div className="min-w-0">
        <p className={cn("font-semibold", failed ? "text-danger" : "text-success")}>
          {failed ? "Action failed" : d.status === "AUTO_EXECUTED" ? "Executed automatically" : "Action executed"}
          {d.executedAt && <span className="font-normal text-muted-foreground"> · {formatTime(d.executedAt)}</span>}
        </p>
        {failed && r?.error && <p className="mt-0.5 wrap-break-word text-foreground/80">{r.error}</p>}
        {!failed && d.action === "automation.approval" && <p className="mt-0.5 text-muted-foreground">The waiting automation continued.</p>}
      </div>
    </div>
  );
}

export function ReviewNote({ d, formatTime }: { d: DecisionView; formatTime: (s: string | null) => string }) {
  if (!d.reviewedAt && !d.reviewNote) return null;
  const verb = d.status === "REJECTED" ? "Rejected" : "Approved";
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Clock className="mt-px size-3.5 shrink-0" aria-hidden />
      <p>
        {verb} by <span className="font-medium text-foreground">{d.reviewedBy?.name ?? "a team member"}</span>
        {d.reviewedAt && <> · {formatTime(d.reviewedAt)}</>}
        {d.reviewNote && <span className="mt-1 block rounded-md border-l-2 border-border bg-surface-2 px-2 py-1 text-foreground/80 italic">“{d.reviewNote}”</span>}
      </p>
    </div>
  );
}

/** Approve / reject button that opens a small popover for an optional note. */
export function DecideButton({
  kind,
  title,
  actionLabel,
  busy,
  disabled,
  onConfirm,
  size = "sm",
  className,
}: {
  kind: "approve" | "reject";
  title: string;
  actionLabel: string;
  busy: boolean;
  disabled?: boolean;
  onConfirm: (note?: string) => void;
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const approve = kind === "approve";
  const id = useId();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size={size} variant={approve ? "default" : "outline"} disabled={busy || disabled} className={className} aria-label={`${approve ? "Approve" : "Reject"}: ${title}`}>
          {busy ? <Loader2 className="animate-spin" /> : approve ? <CheckCircle2 /> : <XCircle />}
          {approve ? "Approve" : "Reject"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            onConfirm(note.trim() || undefined);
          }}
        >
          <div>
            <p className="text-sm font-semibold">{approve ? "Approve and run now?" : "Reject this recommendation?"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {approve ? (
                <>
                  <span className="font-medium text-foreground">{actionLabel}</span> runs immediately through the guarded executor and is written to the audit log.
                </>
              ) : (
                "Nothing will change in your store. The agent learns from rejections."
              )}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={id} className="text-xs">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={id}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder={approve ? "e.g. OK for this week only" : "e.g. Customer already contacted us"}
              className="min-h-14 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant={approve ? "default" : "destructive"}>
              {approve ? "Approve & execute" : "Reject"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
