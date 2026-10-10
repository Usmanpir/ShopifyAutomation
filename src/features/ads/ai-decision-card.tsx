import { cn } from "cn";
import { ArrowRight, Gauge, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { DECISION_STATUS, Pill, RiskBadge } from "@/components/shared/status";
import { TimeAgo } from "@/components/shared/time-ago";
import { friendlyNameFromLabel } from "@/lib/ai/team";

export type DecisionView = {
  id: string;
  title: string;
  summary: string;
  reasoning?: string;
  evidence: unknown;
  expectedImpact: string | null;
  riskLevel: string;
  confidence: number | null;
  status: string;
  createdAt: string | Date;
  agent?: { name: string } | null;
};

/**
 * AI recommendation awaiting (or past) review. Always shows the data behind it
 * (evidence chips), the expected impact and a link into the Approval Center.
 */
export function AIDecisionCard({ decision, className, showStatus }: { decision: DecisionView; className?: string; showStatus?: boolean }) {
  const evidence = Array.isArray(decision.evidence) ? (decision.evidence as { label: string; value: string }[]) : [];
  const pending = decision.status === "PENDING_APPROVAL";
  return (
    <article className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 transition hover:border-foreground/12 hover:shadow-sm", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ai-soft text-ai">
          <Sparkles className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className="font-medium tracking-wide uppercase">{friendlyNameFromLabel(decision.agent?.name, "AI")}</span>
            <span aria-hidden>·</span>
            <span><TimeAgo date={decision.createdAt} /></span>
          </div>
          <h3 className="mt-0.5 text-[15px] leading-snug font-semibold">{decision.title}</h3>
        </div>
        {showStatus && <Pill map={DECISION_STATUS} value={decision.status} className="hidden sm:inline-flex" />}
      </div>
      <p className="text-sm leading-relaxed">{decision.summary}</p>
      {evidence.length > 0 && (
        <ul aria-label="Supporting data" className="flex flex-wrap gap-1.5">
          {evidence.slice(0, 6).map((e) => (
            <li key={e.label} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-surface-2 px-2 py-1 text-[12px]">
              <span className="text-muted-foreground">{e.label}</span>
              <span className="truncate font-semibold">{e.value}</span>
            </li>
          ))}
        </ul>
      )}
      {decision.expectedImpact && (
        <p className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success">
          <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Expected impact: </span>
            {decision.expectedImpact}
          </span>
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RiskBadge level={decision.riskLevel} compact />
          {typeof decision.confidence === "number" && (
            <span className="inline-flex items-center gap-1">
              <Gauge className="size-3.5" aria-hidden />
              {Math.round(decision.confidence * 100)}% confidence
            </span>
          )}
        </div>
        <Link href={`/approvals?focus=${decision.id}`} className="inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-primary hover:underline">
          {pending ? "Review Recommendation" : "View decision"} <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </article>
  );
}
