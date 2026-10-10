"use client";

import { cn } from "cn";
import { AlertCircle, ArrowDown, Check, CheckCheck, Clock, FileText, Headset, Info, Sparkles } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFormat, useStore } from "@/components/store-context";
import { titleCase } from "@/lib/format";
import { readAiMeta, type ConversationDetail, type ThreadMessage } from "./types";

function dayKey(d: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

function dayLabel(key: string, timeZone: string, f: ReturnType<typeof useFormat>, iso: string) {
  const today = dayKey(new Date().toISOString(), timeZone);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString(), timeZone);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return f.date(iso);
}

/** Messages with day separators, sticky auto-scroll and a "jump to latest" pill. */
export function MessageList({ conversation, aiTyping }: { conversation: ConversationDetail; aiTyping: boolean }) {
  const { store, user } = useStore();
  const f = useFormat();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const msgs = conversation.messages;
  const lastId = msgs[msgs.length - 1]?.id;

  // Jump to the bottom when switching conversations.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
  }, [conversation.id]);

  // Follow new messages if the reader is at the bottom (or just sent one).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const last = msgs[msgs.length - 1];
    const mine = last?.direction === "OUTBOUND" && last.sender === "AGENT";
    if (atBottom.current || mine) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else setShowJump(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, aiTyping]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setShowJump(false);
  };

  const senderNames = (conversation as { senderNames?: Record<string, string> }).senderNames ?? {};
  const agentName = (m: ThreadMessage) =>
    m.senderUserId && m.senderUserId === user.id ? "You" : (m.senderUserId && senderNames[m.senderUserId]) || (m.senderUserId && m.senderUserId === conversation.assignedTo?.id ? conversation.assignedTo.name : "Team");

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="scrollbar-thin h-full overflow-y-auto bg-surface-2/60 px-3 py-4 sm:px-6"
        role="log"
        aria-live="polite"
        aria-label={`Messages with ${conversation.contactName}`}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {msgs.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p>}
          {msgs.map((m, i) => {
            const key = dayKey(m.createdAt, store.timezone);
            const prev = msgs[i - 1];
            const sep = !prev || dayKey(prev.createdAt, store.timezone) !== key;
            const grouped = !sep && prev && prev.sender === m.sender && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
            return (
              <Fragment key={m.id}>
                {sep && (
                  <div className="sticky top-0 z-10 my-2 flex justify-center" role="separator">
                    <span className="rounded-full border bg-card/95 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-xs backdrop-blur">{dayLabel(key, store.timezone, f, m.createdAt)}</span>
                  </div>
                )}
                <MessageBubble m={m} grouped={!!grouped} time={f.time(m.createdAt)} agentName={agentName(m)} />
              </Fragment>
            );
          })}
          {aiTyping && (
            <div className="mt-1 flex animate-fade-in justify-end">
              <div className="flex items-center gap-2 rounded-2xl rounded-br-md bg-ai-soft px-3 py-2 text-xs text-ai">
                <Sparkles className="size-3.5" />
                <span>AI agent is replying</span>
                <span className="flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="size-1 animate-pulse rounded-full bg-ai" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      {showJump && (
        <button
          type="button"
          onClick={() => {
            scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
            setShowJump(false);
          }}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 animate-fade-in items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs font-medium shadow-md hover:bg-muted"
        >
          <ArrowDown className="size-3.5" /> New messages
        </button>
      )}
    </div>
  );
}

function DeliveryTick({ m }: { m: ThreadMessage }) {
  const map = {
    QUEUED: { Icon: Clock, label: "Queued", cls: "" },
    SENT: { Icon: Check, label: "Sent", cls: "" },
    DELIVERED: { Icon: CheckCheck, label: "Delivered", cls: "" },
    READ: { Icon: CheckCheck, label: "Read", cls: "text-info" },
    FAILED: { Icon: AlertCircle, label: "Failed", cls: "text-danger" },
  } as const;
  const s = map[m.status as keyof typeof map];
  if (!s) return null;
  return (
    <span className={cn("inline-flex items-center", s.cls)} title={m.status === "FAILED" && m.error ? `Failed: ${m.error}` : s.label}>
      <s.Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{s.label}</span>
    </span>
  );
}

function MessageBubble({ m, grouped, time, agentName }: { m: ThreadMessage; grouped: boolean; time: string; agentName: string }) {
  // System notices (take-overs, hand-backs) — centered, quiet.
  if (m.sender === "SYSTEM" && !m.templateName) {
    return (
      <div className="my-1.5 flex justify-center">
        <span className="inline-flex max-w-[85%] items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-center text-[11.5px] text-muted-foreground">
          <Info className="size-3 shrink-0" /> {m.body} <span className="opacity-70">· {time}</span>
        </span>
      </div>
    );
  }

  const inbound = m.direction === "INBOUND";
  const isAi = m.sender === "AI";
  const isTemplate = !!m.templateName;
  const meta = isAi ? readAiMeta(m.aiMeta) : null;
  const failed = m.status === "FAILED";

  return (
    <div className={cn("flex animate-fade-in flex-col", inbound ? "items-start" : "items-end", !grouped && "mt-2")}>
      {!inbound && !grouped && (
        <span className={cn("mb-1 flex items-center gap-1 px-1 text-[11px] font-medium", isAi ? "text-ai" : isTemplate ? "text-muted-foreground" : "text-brand")}>
          {isTemplate ? (
            <>
              <FileText className="size-3" /> Template
            </>
          ) : isAi ? (
            <>
              <Sparkles className="size-3" /> AI
            </>
          ) : (
            <>
              <Headset className="size-3" /> {agentName}
            </>
          )}
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-[0_1px_1px_rgba(16,24,40,0.04)] sm:max-w-[72%]",
          inbound && "rounded-bl-md border bg-card text-card-foreground",
          !inbound && isAi && "rounded-br-md border border-ai/15 bg-ai-soft text-foreground",
          !inbound && !isAi && !isTemplate && "rounded-br-md bg-primary text-primary-foreground",
          !inbound && isTemplate && "rounded-br-md border border-dashed bg-card text-card-foreground",
          failed && "ring-1 ring-danger/50",
        )}
      >
        {isTemplate && (
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
            <FileText className="size-3" /> {m.templateName}
          </span>
        )}
        {isTemplate && <br />}
        {m.body}
        <span
          className={cn(
            "float-right mt-1.5 ml-3 inline-flex translate-y-0.5 items-center gap-1 text-[10.5px] leading-none",
            !inbound && !isAi && !isTemplate ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {time}
          {!inbound && <DeliveryTick m={m} />}
        </span>
      </div>
      {meta && (meta.intent || typeof meta.confidence === "number") && (
        <span className="mt-1 px-1 text-[10.5px] text-muted-foreground">
          {meta.intent && meta.intent !== "AUTO" ? titleCase(meta.intent) : "Auto-reply"}
          {typeof meta.confidence === "number" && <> · {Math.round(meta.confidence * 100)}% confident</>}
          {meta.handoff && <> · handed off</>}
        </span>
      )}
      {failed && (
        <span role="alert" className="mt-1 px-1 text-[11px] text-danger">
          Not delivered{m.error ? ` — ${m.error.slice(0, 120)}` : ""}
        </span>
      )}
    </div>
  );
}
