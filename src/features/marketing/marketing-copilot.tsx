"use client";

import { CornerDownLeft, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const PROMPTS = ["Which campaign should I scale and why?", "Why did my ad results change this week?", "Which customers should I win back?", "Draft a WhatsApp offer for inactive customers"];

/** Marketing Copilot: asks the AI Assistant with marketing context; answers cite real numbers. */
export function MarketingCopilot() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const ask = (text: string) => router.push(`/assistant?q=${encodeURIComponent(text)}`);
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
        className="relative"
      >
        <Sparkles className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ai" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about your marketing…"
          aria-label="Ask the Marketing Copilot"
          className="h-10 w-full rounded-lg border bg-background pr-10 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ai/50 focus-visible:ring-3 focus-visible:ring-ai/20"
        />
        <button type="submit" disabled={!q.trim()} aria-label="Ask" className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40">
          <CornerDownLeft className="size-4" />
        </button>
      </form>
      <ul className="flex flex-col gap-1.5">
        {PROMPTS.map((p) => (
          <li key={p}>
            <button type="button" onClick={() => ask(p)} className="w-full rounded-lg border px-3 py-2 text-left text-[13px] transition hover:border-ai/30 hover:bg-ai-soft/50">
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
