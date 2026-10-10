"use client";

import { cn } from "cn";
import { BellOff, Check, ChevronDown, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AiMode } from "./types";

export const AI_MODES: Record<AiMode, { label: string; short: string; icon: typeof Sparkles; tone: string; description: string }> = {
  AUTO: {
    label: "Automatic",
    short: "AI replies",
    icon: Sparkles,
    tone: "text-ai",
    description: "The AI answers on its own — only approved topics (order status, delivery, prices, stock, FAQs, confirmations). Anything else comes to you.",
  },
  SUGGEST: {
    label: "Suggestions",
    short: "AI suggests",
    icon: Lightbulb,
    tone: "text-warning",
    description: "You reply. The AI drafts answers from live store data that you can send or edit.",
  },
  MANUAL: {
    label: "Manual",
    short: "AI off",
    icon: BellOff,
    tone: "text-muted-foreground",
    description: "The AI stays out of this conversation completely.",
  },
};

/** Per-conversation AI mode: Manual · Suggestions · Automatic. */
export function AiModeControl({ mode, onChange, busy, disabled }: { mode: AiMode; onChange: (m: AiMode) => void; busy?: boolean; disabled?: boolean }) {
  const cur = AI_MODES[mode];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} aria-label={`AI mode: ${cur.label}. Change`}>
          {busy ? <Loader2 className="animate-spin" /> : <cur.icon className={cur.tone} />}
          <span className="hidden @lg:inline">{cur.short}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>What may the AI do in this chat?</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(["AUTO", "SUGGEST", "MANUAL"] as AiMode[]).map((m) => {
          const M = AI_MODES[m];
          return (
            <DropdownMenuItem key={m} onSelect={() => m !== mode && onChange(m)} className="items-start gap-2.5 py-2">
              <M.icon className={cn("mt-0.5", M.tone)} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{M.label}</p>
                <p className="text-xs leading-snug text-muted-foreground">{M.description}</p>
              </div>
              {m === mode && <Check className="mt-0.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
