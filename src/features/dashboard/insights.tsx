"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InsightCard, type InsightView } from "@/components/shared/insight-card";
import { EmptyState } from "@/components/shared/states";
import { api, errorMessage } from "@/lib/client/api";

export function DashboardInsights({ initial, canRefresh }: { initial: InsightView[]; canRefresh: boolean }) {
  const qc = useQueryClient();
  const { data = initial } = useQuery({ queryKey: ["insights"], queryFn: () => api<InsightView[]>("/api/ai/insights"), initialData: initial, staleTime: 60_000 });
  const regenerate = useMutation({
    mutationFn: () => api<{ insights: number; decisions: number }>("/api/ai/insights", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`AI refreshed ${r.insights} insights${r.decisions ? ` · ${r.decisions} new recommendations` : ""}`);
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["shell-counts"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section aria-labelledby="insights-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="insights-title" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Sparkles className="size-4 text-ai" /> AI insights
          </h2>
          <p className="text-[13px] text-muted-foreground">What happened, why it matters, and what to do — backed by your data.</p>
        </div>
        {canRefresh && (
          <Button variant="ghost" size="sm" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
            {regenerate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
          </Button>
        )}
      </div>
      {data.length ? (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.slice(0, 4).map((i) => (
            <InsightCard key={i.id} insight={i} className="animate-fade-in" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={<Sparkles />} title="No insights yet" description="Insights appear once there's enough order data to analyze." compact />
        </div>
      )}
    </section>
  );
}
