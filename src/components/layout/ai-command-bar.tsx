"use client";

import { cn } from "cn";
import { ArrowUp, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const EXAMPLES = [
  "Which products sold the most this month?",
  "Show pending COD orders",
  "Why did revenue drop yesterday?",
  "Which products are low in stock?",
  "How much did Meta ads spend this week?",
];

/** "Ask your store anything…" — submits to the AI Assistant. ⌘J focuses it. */
export function AiCommandBar({ className }: { className?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [hint, setHint] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const t = setInterval(() => setHint((h) => (h + 1) % EXAMPLES.length), 4000);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearInterval(t);
    };
  }, []);

  const submit = (q: string) => {
    if (!q.trim()) return;
    router.push(`/assistant?q=${encodeURIComponent(q.trim())}`);
    setValue("");
    ref.current?.blur();
  };

  return (
    <div className={cn("relative", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className={cn(
          "flex h-9 items-center gap-2 rounded-full border bg-card pr-1 pl-3 transition-shadow",
          focused ? "border-ai/40 shadow-[0_0_0_4px] shadow-ai/10" : "hover:border-ai/30",
        )}
      >
        <Sparkles className="size-4 shrink-0 text-ai" aria-hidden />
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          aria-label="Ask your store anything"
          placeholder="Ask your store anything…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {!focused && !value && <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] text-muted-foreground lg:block">⌘J</kbd>}
        <button
          type="submit"
          aria-label="Ask"
          disabled={!value.trim()}
          className="grid size-7 place-items-center rounded-full bg-ai text-white transition disabled:bg-muted disabled:text-muted-foreground"
        >
          <ArrowUp className="size-3.5" />
        </button>
      </form>
      {focused && !value && (
        <div className="absolute inset-x-0 top-11 z-50 animate-slide-in rounded-xl border bg-popover p-1.5 shadow-lg">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Try asking</p>
          {EXAMPLES.map((q, i) => (
            <button
              key={q}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                submit(q);
              }}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted", i === hint && "bg-muted/60")}
            >
              <Sparkles className="size-3.5 text-ai/70" />
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
