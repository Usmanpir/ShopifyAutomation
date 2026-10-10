import { TimeAgo } from "@/components/shared/time-ago";
import { ArrowRight, BotMessageSquare, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { InsightCard, type InsightView } from "@/components/shared/insight-card";
import { DECISION_STATUS, Pill } from "@/components/shared/status";

import { AIDecisionCard, type DecisionView } from "./ai-decision-card";

/**
 * AI Ad Analyst: the latest campaign insight + recommendations from the Ads
 * agent waiting in the Approval Center. Every card shows its supporting data.
 */
export function AdsAnalystPanel({
  insight,
  pending,
  recent,
}: {
  insight: InsightView | null;
  pending: DecisionView[];
  recent: { id: string; title: string; status: string; updatedAt: string }[];
}) {
  return (
    <section aria-labelledby="ads-analyst-title" className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-ai-gradient px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-card text-ai shadow-sm ring-1 ring-ai/15">
            <BotMessageSquare className="size-[18px]" />
          </span>
          <div>
            <h2 id="ads-analyst-title" className="text-[15px] font-semibold tracking-tight">
              AI Ad Analyst
            </h2>
            <p className="text-[13px] text-muted-foreground">Reviews your campaigns continuously. Budget changes always wait for your approval.</p>
          </div>
        </div>
        <Link href="/approvals" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
          Approval Center <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-3">
        <div className="space-y-3">
          <h3 className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">Latest insight</h3>
          {insight ? (
            <InsightCard insight={insight} />
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No campaign insight yet — the analyst runs after the next sync.</p>
          )}
          {recent.length > 0 && (
            <div className="rounded-xl border p-3">
              <p className="mb-2 text-[12px] font-medium text-muted-foreground">Recently decided</p>
              <ul className="space-y-2">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <Link href={`/approvals?focus=${r.id}`} className="min-w-0 truncate hover:text-primary hover:underline" title={r.title}>
                      {r.title}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-[11px] text-muted-foreground sm:inline"><TimeAgo date={r.updatedAt} /></span>
                      <Pill map={DECISION_STATUS} value={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-3 xl:col-span-2">
          <h3 className="flex items-center gap-2 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
            Recommendations awaiting review
            {pending.length > 0 && <span className="tabular rounded-full bg-warning-soft px-1.5 text-[11px] text-warning normal-case">{pending.length}</span>}
          </h3>
          {pending.length ? (
            <div className={pending.length > 1 ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
              {pending.map((d) => (
                <AIDecisionCard key={d.id} decision={d} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
              <CheckCircle2 className="size-6 text-success" aria-hidden />
              <p className="text-sm font-medium">No recommendations waiting</p>
              <p className="max-w-sm text-[13px] text-muted-foreground">Budget changes and pauses the analyst proposes will appear here with the numbers behind them.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
