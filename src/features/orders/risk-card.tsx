"use client";

import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { AlertTriangle, Check, Loader2, MessageCircle, RefreshCw, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { useDecisionActions } from "@/features/approvals/use-decision";
import { api, errorMessage } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";

export type RiskSignalView = { key: string; label: string; detail: string; points: number; direction: "increase" | "decrease" | "neutral" };

const LEVEL = {
  HIGH: { label: "High risk", Icon: ShieldAlert, text: "text-danger", stroke: "stroke-danger", bar: "bg-danger", soft: "bg-danger-soft" },
  MEDIUM: { label: "Medium risk", Icon: AlertTriangle, text: "text-warning", stroke: "stroke-warning", bar: "bg-warning", soft: "bg-warning-soft" },
  LOW: { label: "Low risk", Icon: ShieldCheck, text: "text-success", stroke: "stroke-success", bar: "bg-success", soft: "bg-success-soft" },
} as const;

function Meter({ score, level }: { score: number; level: keyof typeof LEVEL }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative size-[88px] shrink-0" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Risk score">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} className={cn(LEVEL[level].stroke, "transition-[stroke-dasharray] duration-700")} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-2xl leading-none font-semibold tracking-tight">{score}</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

export function RiskCard({
  orderId,
  score,
  level: rawLevel,
  signals,
  recommendation,
  analyzedAt,
  isFinal,
  canRequestConfirmation,
  pendingDecisionId,
  canUpdate,
  canDecide,
}: {
  orderId: string;
  score: number;
  level: string;
  signals: RiskSignalView[];
  recommendation: { action: string; label: string } | null;
  analyzedAt: string | null;
  isFinal: boolean;
  canRequestConfirmation: boolean;
  pendingDecisionId: string | null;
  canUpdate: boolean;
  canDecide: boolean;
}) {
  const router = useRouter();
  const level = (rawLevel in LEVEL ? rawLevel : "LOW") as keyof typeof LEVEL;
  const meta = LEVEL[level];
  const [ignored, setIgnored] = useState(false);
  const { approve, reject } = useDecisionActions();

  const reanalyze = useMutation({
    mutationFn: () => api<{ score: number; level: string }>(`/api/orders/${orderId}/risk`, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`Risk re-analyzed · ${r.level.toLowerCase()} (${r.score}/100)`);
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const requestConfirmation = useMutation({
    mutationFn: () => api(`/api/orders/${orderId}/actions`, { body: { action: "request_confirmation" } }),
    onSuccess: () => {
      toast.success("WhatsApp confirmation sent");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const contributing = signals.filter((s) => s.points > 0).sort((a, b) => b.points - a.points);
  const passed = signals.filter((s) => s.points <= 0);
  const maxPoints = Math.max(20, ...contributing.map((s) => s.points));

  const viaDecision = !!pendingDecisionId && canDecide;
  const canAct = viaDecision || (canRequestConfirmation && canUpdate);
  const showRecommendation = level === "HIGH" && !isFinal && !ignored && canAct;
  const acting = approve.isPending || reject.isPending || requestConfirmation.isPending;

  return (
    <SectionCard
      title="AI risk analysis"
      description={analyzedAt ? `Analyzed ${timeAgo(analyzedAt)}` : "COD fraud & refusal risk"}
      icon={
        <span className="grid size-8 place-items-center rounded-lg bg-ai-soft text-ai">
          <Sparkles className="size-4" />
        </span>
      }
      action={
        <Button size="sm" variant="ghost" onClick={() => reanalyze.mutate()} disabled={reanalyze.isPending} aria-label="Re-analyze risk">
          {reanalyze.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          <span className="hidden sm:inline xl:hidden 2xl:inline">Re-analyze</span>
        </Button>
      }
    >
      <div className="flex items-center gap-4">
        <Meter score={score} level={level} />
        <div className="min-w-0 space-y-1.5">
          <p className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold", meta.soft, meta.text)}>
            <meta.Icon className="size-4" aria-hidden /> {meta.label}
          </p>
          {recommendation && <p className="text-[13px] leading-snug text-muted-foreground">{recommendation.label}</p>}
        </div>
      </div>

      {showRecommendation && (
        <div className="mt-4 animate-fade-in rounded-lg border border-ai/20 bg-ai-gradient p-3.5">
          <p className="text-[11px] font-semibold tracking-wide text-ai uppercase">Recommended action</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            <MessageCircle className="size-4 text-ai" aria-hidden /> Request WhatsApp confirmation
          </p>
          <p className="mt-1 text-xs text-muted-foreground">High-risk COD orders are often refused at the door. Confirm before dispatch to avoid two-way shipping costs.</p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={acting}
              onClick={() => (viaDecision ? approve.mutate({ id: pendingDecisionId! }) : requestConfirmation.mutate())}
            >
              {approve.isPending || requestConfirmation.isPending ? <Loader2 className="animate-spin" /> : <Check />} Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={acting}
              onClick={() => (viaDecision ? reject.mutate({ id: pendingDecisionId!, note: "Ignored from order page" }) : setIgnored(true))}
            >
              Ignore
            </Button>
          </div>
        </div>
      )}

      {contributing.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2.5 text-xs font-medium text-muted-foreground">Risk signals</h3>
          <ul className="space-y-3">
            {contributing.map((s) => (
              <li key={s.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-medium">{s.label}</p>
                  <span className={cn("tabular shrink-0 text-xs font-semibold", s.direction === "decrease" ? "text-success" : level === "HIGH" ? "text-danger" : "text-warning")}>
                    {s.direction === "decrease" ? "−" : "+"}
                    {Number(s.points.toFixed(1))}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{s.detail}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className={cn("h-full rounded-full", s.direction === "decrease" ? "bg-success" : level === "HIGH" ? "bg-danger" : "bg-warning")} style={{ width: `${(s.points / maxPoints) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {passed.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Checks passed</h3>
          <ul className="space-y-1.5">
            {passed.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-xs">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                <span>
                  <span className="font-medium">{s.label}</span> <span className="text-muted-foreground">· {s.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!signals.length && <p className="mt-4 text-sm text-muted-foreground">This order hasn&apos;t been analyzed yet. Run the analysis to see risk signals.</p>}
    </SectionCard>
  );
}
