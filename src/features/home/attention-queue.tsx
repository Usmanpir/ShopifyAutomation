"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { AttentionCard } from "@/components/shared/attention-card";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { CodConfirmDrawer } from "@/features/orders/cod-confirm-drawer";
import { api } from "@/lib/client/api";
import type { PriorityItem } from "@/lib/priority";

/** Ranked "Needs attention" list from the Priority Engine, refreshed every minute. */
export function AttentionQueue({ initial, limit = 4 }: { initial: PriorityItem[]; limit?: number }) {
  const { data = initial } = useQuery({
    queryKey: ["priorities"],
    queryFn: async () => (await api<{ items: PriorityItem[] }>("/api/priorities")).items,
    initialData: initial,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const [all, setAll] = useState(false);
  const [codOpen, setCodOpen] = useState(false);
  const shown = all ? data : data.slice(0, limit);

  if (!data.length) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          compact
          icon={<CheckCircle2 />}
          title="You're all caught up"
          description="Nothing needs you right now. Your AI team keeps watching orders, chats, stock and ads, and anything new will show up here."
        />
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {shown.map((item, i) => (
        <AttentionCard key={item.key} item={item} rank={i + 1} onAction={(it) => it.action.kind === "cod_confirm" && setCodOpen(true)} className="animate-fade-in" />
      ))}
      {data.length > limit && (
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setAll(!all)}>
          <ChevronDown className={all ? "rotate-180 transition" : "transition"} />
          {all ? "Show fewer" : `Show ${data.length - limit} more`}
        </Button>
      )}
      <CodConfirmDrawer open={codOpen} onOpenChange={setCodOpen} />
    </div>
  );
}
