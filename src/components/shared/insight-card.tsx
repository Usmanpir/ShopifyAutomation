import { cn } from "cn";
import { ArrowRight, Flame, Lightbulb, Megaphone, PackageX, Sparkles, TrendingUp, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { TimeAgo } from "@/components/shared/time-ago";
import { WhyButton } from "./explain";

export type InsightView = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  headline: string;
  whatHappened: string;
  whyItMatters: string;
  evidence: { label: string; value: string }[] | unknown;
  suggestedAction: string | null;
  actionLabel: string | null;
  actionHref: string | null;
  generatedAt: string | Date;
  agent?: { name: string } | null;
};

const KIND: Record<string, { icon: typeof Flame; tone: string }> = {
  TOP_PRODUCT: { icon: Flame, tone: "bg-warning-soft text-warning" },
  INVENTORY: { icon: PackageX, tone: "bg-danger-soft text-danger" },
  OPPORTUNITY: { icon: TrendingUp, tone: "bg-success-soft text-success" },
  ISSUE: { icon: TriangleAlert, tone: "bg-danger-soft text-danger" },
  CAMPAIGN: { icon: Megaphone, tone: "bg-info-soft text-info" },
  CUSTOMER: { icon: Users, tone: "bg-brand-soft text-brand" },
};

/**
 * AI recommendation card: what happened and the suggested action up front;
 * why it matters and the supporting data behind “Why?”.
 */
export function InsightCard({ insight, className, compact }: { insight: InsightView; className?: string; compact?: boolean }) {
  const meta = KIND[insight.kind] ?? { icon: Lightbulb, tone: "bg-ai-soft text-ai" };
  const evidence = Array.isArray(insight.evidence) ? (insight.evidence as { label: string; value: string }[]) : [];
  return (
    <article className={cn("group flex flex-col rounded-xl border bg-card p-4 transition hover:border-foreground/12 hover:shadow-sm", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", meta.tone)}>
          <meta.icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
            {insight.title}
            <Sparkles className="size-3 text-ai" aria-label="AI generated" />
          </p>
          <h3 className="mt-0.5 truncate text-[15px] font-semibold">{insight.headline}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{insight.whatHappened}</p>
      {!compact && insight.suggestedAction && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{insight.suggestedAction}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="flex min-w-0 items-center gap-1">
          <WhyButton
            align="start"
            className="-ml-1.5"
            explain={{
              what: insight.whatHappened,
              why: insight.whyItMatters,
              todo: insight.suggestedAction ?? "No action needed — this is for your information.",
              evidence: evidence.slice(0, 6),
            }}
          />
          <span className="truncate text-[11px] text-muted-foreground">
            <TimeAgo date={insight.generatedAt} />
          </span>
        </span>
        {insight.actionHref && (
          <Link href={insight.actionHref} className="inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-medium text-primary hover:underline">
            {insight.actionLabel ?? "View"} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </article>
  );
}
