import { cn } from "cn";
import { ArrowRight, CheckCircle2, Hourglass, Sparkles } from "lucide-react";
import type { OrderSummary } from "@/lib/order-summary";

const DOT: Record<string, string> = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info", neutral: "bg-muted-foreground/50" };

/** "AI order summary": the story of this order in a few lines, plus the next step. */
export function AiOrderSummary({ summary }: { summary: OrderSummary }) {
  const NextIcon = summary.next.tone === "action" ? ArrowRight : summary.next.tone === "wait" ? Hourglass : CheckCircle2;
  return (
    <section aria-labelledby="ai-summary" className="grid gap-4 rounded-xl border bg-card bg-ai-gradient p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      <div className="min-w-0">
        <h2 id="ai-summary" className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-ai uppercase">
          <Sparkles className="size-3.5" aria-hidden /> AI order summary
        </h2>
        <ul className="mt-2 space-y-1.5">
          {summary.points.map((p, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed">
              <span aria-hidden className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", DOT[p.tone])} />
              <span className="min-w-0">{p.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("rounded-lg border bg-card p-3.5", summary.next.tone === "action" && "border-primary/30")}>
        <p className="text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">Next step</p>
        <p className="mt-1 flex items-start gap-1.5 text-[14px] leading-snug font-semibold">
          <NextIcon className={cn("mt-0.5 size-4 shrink-0", summary.next.tone === "action" ? "text-primary" : summary.next.tone === "wait" ? "text-warning" : "text-success")} aria-hidden />
          {summary.next.label}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{summary.next.why}</p>
      </div>
    </section>
  );
}
