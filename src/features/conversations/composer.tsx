"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, Loader2, Lock, Pencil, SendHorizontal, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCan, useStore } from "@/components/store-context";
import { api, errorMessage } from "@/lib/client/api";
import type { ConversationDetail } from "./types";
import type { useConversationActions } from "./use-conversation";

const SIMULATE_PROMPTS = ["Bhai black shirt available hai?", "Mera order kahan hai?", "Can I exchange size L for XL? It's been 10 days", "Kurta ki price kya hai?", "Delivery kitne din mein hogi Lahore?"];

export function Composer({ conversation, actions }: { conversation: ConversationDetail; actions: ReturnType<typeof useConversationActions> }) {
  const can = useCan();
  const { store } = useStore();
  const canReply = can("conversations.reply");
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Suggestions mode: drafts load by themselves for the latest unanswered customer message.
  // The customer's latest message still needs a person's answer (AI holding replies and system notes don't count).
  const msgs = conversation.messages;
  const lastIn = msgs.findLastIndex((m) => m.direction === "INBOUND");
  const answered = lastIn >= 0 && msgs.slice(lastIn + 1).some((m) => m.sender === "AGENT");
  const lastInboundId = lastIn >= 0 && !answered ? msgs[lastIn]!.id : null;
  const closedConv = conversation.status === "RESOLVED" || conversation.status === "CLOSED";
  const auto = useQuery({
    queryKey: ["suggestions", conversation.id, lastInboundId],
    queryFn: () => api<{ suggestions: string[] }>(`/api/conversations/${conversation.id}/suggestions`),
    enabled: conversation.aiMode === "SUGGEST" && !!lastInboundId && !closedConv && can("conversations.reply"),
    staleTime: Infinity,
    retry: false,
  });
  const shown = suggestions ?? (lastInboundId && dismissedFor !== lastInboundId ? (auto.data?.suggestions ?? null) : null);
  const dismiss = () => {
    setSuggestions(null);
    setDismissedFor(lastInboundId);
  };

  const suggest = useMutation({
    mutationFn: () => api<{ suggestions: string[] }>(`/api/conversations/${conversation.id}/suggestions`),
    onSuccess: (r) => {
      if (!r.suggestions.length) toast.info("No customer message to reply to yet");
      setSuggestions(r.suggestions);
    },
    onError: (e) => toast.error("Couldn't get suggestions", { description: errorMessage(e) }),
  });

  const submit = () => {
    const body = text.trim();
    if (!body || actions.send.isPending) return;
    actions.send.mutate(body, { onSuccess: dismiss });
    setText("");
    requestAnimationFrame(() => ref.current?.focus());
  };

  if (!canReply) {
    return (
      <div className="flex items-center gap-2 border-t bg-card px-4 py-3.5 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" />
        Your role can view conversations but not reply. Ask an admin for the “Reply to conversations” permission.
      </div>
    );
  }

  const aiHandling = conversation.aiMode === "AUTO";
  const manual = conversation.aiMode === "MANUAL";
  const showSimulate = store.demoMode && conversation.channel === "WHATSAPP";

  return (
    <div className="border-t bg-card px-3 pt-2.5 pb-3 sm:px-4">
      {aiHandling && !closedConv && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Sparkles className="size-3 text-ai" /> The Customer Assistant replies automatically to approved topics. Typing here switches this chat to Suggestions.
        </p>
      )}
      {auto.isFetching && !shown && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-ai">
          <Loader2 className="size-3 animate-spin" /> Drafting a reply from live store data…
        </p>
      )}
      {shown && shown.length > 0 && (
        <div className="mb-2 animate-slide-in">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="flex items-center gap-1 text-[11.5px] font-medium text-ai">
              <Sparkles className="size-3" /> Suggested replies · grounded in live store data
            </p>
            <Button variant="ghost" size="icon-xs" onClick={dismiss} aria-label="Dismiss suggestions">
              <X />
            </Button>
          </div>
          <ul className="scrollbar-thin flex max-h-44 flex-col gap-1.5 overflow-y-auto">
            {shown.map((s, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-ai/20 bg-ai-soft/50 py-1.5 pr-1.5 pl-3">
                <p className="min-w-0 flex-1 py-0.5 text-[13px] leading-snug">{s}</p>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setText(s);
                      ref.current?.focus();
                    }}
                    aria-label="Edit this reply"
                  >
                    <Pencil /> Edit
                  </Button>
                  <Button type="button" size="xs" disabled={actions.send.isPending} onClick={() => actions.send.mutate(s, { onSuccess: dismiss })} aria-label="Send this reply">
                    <SendHorizontal /> Send
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-xl border bg-background shadow-xs transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
        <label htmlFor={`composer-${conversation.id}`} className="sr-only">
          Reply to {conversation.contactName}
        </label>
        <textarea
          id={`composer-${conversation.id}`}
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={4096}
          placeholder={aiHandling ? "Type a reply — sending switches this chat to Suggestions…" : `Reply to ${conversation.contactName}…`}
          className="field-sizing-content block max-h-40 min-h-[52px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-1.5 px-2 pb-2">
          {!manual && (
            <Button type="button" variant="ghost" size="sm" className="text-ai hover:bg-ai-soft hover:text-ai" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
              {suggest.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Suggest replies
            </Button>
          )}
          {showSimulate && <SimulateControl actions={actions} />}
          <span className="ml-auto hidden text-[11px] whitespace-nowrap text-muted-foreground @3xl:inline">
            <kbd className="rounded border bg-muted px-1">Enter</kbd> send · <kbd className="rounded border bg-muted px-1">Shift</kbd>+<kbd className="rounded border bg-muted px-1">Enter</kbd> new line
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" onClick={submit} disabled={!text.trim() || actions.send.isPending} aria-label="Send message" className="ml-auto @3xl:ml-1">
                {actions.send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{aiHandling ? "Send (AI switches to suggestions)" : "Send"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function SimulateControl({ actions }: { actions: ReturnType<typeof useConversationActions> }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const run = (t: string) => {
    if (!t.trim()) return;
    actions.simulate.mutate(t.trim(), {
      onSuccess: () => {
        setOpen(false);
        setCustom("");
      },
    });
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
          <FlaskConical /> <span className="hidden @xl:inline">Simulate customer</span>
          <span className="@xl:hidden">Simulate</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="text-sm font-semibold">Simulate a customer message</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Demo mode: send a message as this customer and watch the WhatsApp agent answer from live inventory.</p>
        <div className="mt-3 flex flex-col gap-1.5">
          {SIMULATE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={actions.simulate.isPending}
              onClick={() => run(p)}
              className="rounded-lg border bg-card px-2.5 py-1.5 text-left text-[13px] transition hover:bg-muted disabled:opacity-50"
            >
              “{p}”
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(custom);
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Or type your own…"
            aria-label="Custom customer message"
            maxLength={1000}
            className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
          <Button type="submit" size="sm" className="h-8" disabled={!custom.trim() || actions.simulate.isPending}>
            {actions.simulate.isPending ? <Loader2 className="animate-spin" /> : "Send"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
