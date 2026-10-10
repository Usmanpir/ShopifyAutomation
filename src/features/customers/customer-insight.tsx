"use client";

import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowRight, Loader2, RefreshCw, Sparkles, TrendingDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";
import type { CustomerSummary } from "@/services/customer.service";

const CHURN: Record<string, { label: string; cls: string }> = {
  LOW: { label: "Low churn risk", cls: "bg-success-soft text-success" },
  MEDIUM: { label: "Medium churn risk", cls: "bg-warning-soft text-warning" },
  HIGH: { label: "High churn risk", cls: "bg-danger-soft text-danger" },
};

export function CustomerInsight({ customerId, initial }: { customerId: string; initial: CustomerSummary | null }) {
  const router = useRouter();
  const [summary, setSummary] = useState<CustomerSummary | null>(initial);
  const gen = useMutation({
    mutationFn: () => api<CustomerSummary>(`/api/customers/${customerId}/summary`, { method: "POST" }),
    onSuccess: (s) => {
      const first = !summary;
      setSummary(s);
      if (!first) toast.success("Customer insight updated");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  // First visit: build the insight automatically instead of asking the owner to press a button.
  const started = useRef(false);
  const run = gen.mutate;
  useEffect(() => {
    if (!initial && !started.current) {
      started.current = true;
      run();
    }
  }, [initial, run]);
  const churn = summary ? (CHURN[summary.churnRisk] ?? CHURN.MEDIUM!) : null;

  return (
    <section aria-labelledby="ai-insight-title" className="relative overflow-hidden rounded-xl border border-ai/20 bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="bg-ai-gradient px-5 py-4 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-ai text-white shadow-sm">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <h2 id="ai-insight-title" className="text-[11px] font-semibold tracking-[0.08em] text-ai uppercase">
                AI customer insight
              </h2>
              <p className="text-xs text-muted-foreground">{summary ? `Generated ${timeAgo(summary.generatedAt)}` : "Grounded in this customer's real orders"}</p>
            </div>
          </div>
          {summary && (
            <Button size="sm" variant="ghost" onClick={() => gen.mutate()} disabled={gen.isPending}>
              {gen.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
            </Button>
          )}
        </div>

        {summary ? (
          <div className={cn("mt-4 grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]", gen.isPending && "opacity-60 transition-opacity")}>
            <div className="space-y-3">
              <p className="text-[17px] leading-snug font-semibold tracking-tight">{summary.headline}</p>
              <ul className="space-y-1.5">
                {summary.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/85">
                    <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ai/70" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              {summary.likelyInterestedIn.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Likely interested in</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {summary.likelyInterestedIn.map((x) => (
                      <span key={x} className="inline-flex h-6 items-center rounded-full border border-ai/20 bg-card/70 px-2.5 text-xs font-medium">
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-lg border bg-card/80 p-3">
                <p className="text-xs font-medium text-muted-foreground">Next best action</p>
                <p className="mt-1 flex items-start gap-1.5 text-sm font-medium">
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden /> {summary.nextBestAction}
                </p>
              </div>
              {churn && (
                <p className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", churn.cls)}>
                  <TrendingDown className="size-3.5" aria-hidden /> {churn.label}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm text-muted-foreground">
              Get a one-glance summary of this customer — buying patterns, what they&apos;re likely to buy next, churn risk and the best next action.
            </p>
            <Button onClick={() => gen.mutate()} disabled={gen.isPending} className="shrink-0">
              {gen.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} {gen.isPending ? "Reading order history…" : "Generate insight"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
