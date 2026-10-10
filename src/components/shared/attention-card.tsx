"use client";

import { cn } from "cn";
import { ArrowRight, Boxes, Clock, MessagesSquare, Megaphone, ShoppingBag, Sparkles, Ticket, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { priorityBand, WEIGHTS, type PriorityCategory, type PriorityItem } from "@/lib/priority";
import { ConfidenceBadge, WhyButton } from "./explain";

const CATEGORY: Record<PriorityCategory, { icon: LucideIcon; label: string }> = {
  orders: { icon: ShoppingBag, label: "Orders" },
  inbox: { icon: MessagesSquare, label: "Inbox" },
  support: { icon: Ticket, label: "Support" },
  inventory: { icon: Boxes, label: "Inventory" },
  marketing: { icon: Megaphone, label: "Marketing" },
  ai: { icon: Sparkles, label: "AI approvals" },
  automations: { icon: Workflow, label: "Automations" },
};

const TONE: Record<PriorityItem["tone"], string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  ai: "bg-ai-soft text-ai",
};

const BAND: Record<string, string> = {
  danger: "text-danger",
  warning: "text-warning",
  info: "text-muted-foreground",
};

/**
 * One ranked thing to act on: what it is, what's at stake, how urgent,
 * one primary action, and a "Why?" that shows the evidence and the rank.
 */
export function AttentionCard({ item, rank, onAction, className }: { item: PriorityItem; rank?: number; onAction?: (item: PriorityItem) => void; className?: string }) {
  const cat = CATEGORY[item.category];
  const band = priorityBand(item.score);
  const method = `Ranked ${item.score}/100 = impact ${Math.round(item.factors.impact * 100)}% × ${WEIGHTS.impact} + urgency ${Math.round(item.factors.urgency * 100)}% × ${WEIGHTS.urgency} + certainty ${Math.round(
    item.factors.certainty * 100,
  )}% × ${WEIGHTS.certainty}. Impact compares the money at stake with an average day of sales.`;

  return (
    <article className={cn("group flex flex-col gap-3 rounded-xl border bg-card p-4 transition hover:border-foreground/12 sm:flex-row sm:items-center", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-xl", TONE[item.tone])}>
          <cat.icon className="size-[18px]" aria-hidden />
          {rank !== undefined && (
            <span className="tabular absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full bg-foreground text-[10.5px] font-semibold text-background ring-2 ring-card">{rank}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] font-medium text-muted-foreground">
            <span>{cat.label}</span>
            <span aria-hidden>·</span>
            <span className={cn("font-semibold", BAND[band.tone])}>{band.label}</span>
          </p>
          <h3 className="mt-0.5 text-[14.5px] leading-snug font-semibold">{item.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{item.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {item.impactLabel && <span className="tabular inline-flex h-[22px] items-center rounded-full bg-surface-2 px-2 text-[11.5px] font-semibold ring-1 ring-border ring-inset">{item.impactLabel}</span>}
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full px-1 text-[11.5px] text-muted-foreground">
              <Clock className="size-3" aria-hidden /> {item.urgencyLabel}
            </span>
            <ConfidenceBadge value={item.confidence} source={item.confidenceLabel ?? undefined} />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
        <WhyButton explain={{ ...item.explain, method }} />
        {item.action.kind === "link" ? (
          <Button asChild size="sm" variant={rank === 1 ? "default" : "outline"}>
            <Link href={item.action.href}>
              {item.action.label} <ArrowRight />
            </Link>
          </Button>
        ) : (
          <Button size="sm" onClick={() => onAction?.(item)} className="bg-ai text-white hover:bg-ai/90 dark:text-zinc-950">
            <Sparkles /> {item.action.label}
          </Button>
        )}
      </div>
    </article>
  );
}
