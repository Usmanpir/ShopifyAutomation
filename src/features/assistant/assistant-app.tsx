"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  ArrowUp,
  Banknote,
  Check,
  Copy,
  History,
  Loader2,
  Megaphone,
  MessageSquare,
  PackageX,
  RotateCcw,
  Sparkles,
  SquarePen,
  Target,
  TrendingDown,
  Trophy,
  TriangleAlert,
  UserX,
  Wrench,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bone } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/components/store-context";
import { providerLabel, toolLabel } from "@/features/agents/agent-meta";
import { api, errorMessage } from "@/lib/client/api";
import { type ChatBlock, ChatBlocks, RichText } from "./chat-blocks";
import { TimeAgo } from "@/components/shared/time-ago";

export type ThreadSummary = { id: string; title: string; updatedAt: string };

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: ChatBlock[];
  tools: string[];
  provider?: string | null;
  createdAt: string;
  error?: string;
};

type ChatResponse = {
  threadId: string;
  message: { id: string; role: string; content: string; blocks: ChatBlock[]; toolCalls: string[]; createdAt: string };
  provider: string;
};

type ThreadResponse = {
  id: string;
  title: string;
  messages: { id: string; role: string; content: string; blocks: unknown; toolCalls: unknown; createdAt: string }[];
};

const PROMPTS: { q: string; icon: typeof Trophy; hint: string }[] = [
  { q: "Which products sold the most this month?", icon: Trophy, hint: "Sales" },
  { q: "Show pending COD orders.", icon: Banknote, hint: "Orders" },
  { q: "Why did revenue drop yesterday?", icon: TrendingDown, hint: "Analysis" },
  { q: "Which products are low in stock?", icon: PackageX, hint: "Inventory" },
  { q: "Show customers who haven't purchased in 60 days.", icon: UserX, hint: "Customers" },
  { q: "How much did Meta ads spend yesterday?", icon: Target, hint: "Ads" },
  { q: "Which campaign generated the highest revenue?", icon: Megaphone, hint: "Ads" },
];

function toolNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => (typeof t === "string" ? t : t && typeof t === "object" && "name" in t ? String((t as { name: unknown }).name) : "")).filter(Boolean);
}

let tempId = 0;
const nextId = () => `tmp-${Date.now()}-${++tempId}`;

export function AssistantApp({ initialThreads }: { initialThreads: ThreadSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { user } = useStore();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");

  const threadRef = useRef<string | null>(null);
  const generation = useRef(0); // bumps on thread switch so stale responses are ignored
  const handledQ = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const { data: threads = initialThreads, isFetching: threadsFetching } = useQuery({
    queryKey: ["ai-threads"],
    queryFn: () => api<ThreadSummary[]>("/api/ai/threads"),
    initialData: initialThreads,
    staleTime: 60_000,
  });

  const setUrl = useCallback(
    (t: string | null) => {
      router.replace(t ? `${pathname}?t=${t}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const send = useCallback(
    async (text: string, opts: { retryOf?: string } = {}) => {
      const message = text.trim();
      if (!message || pending) return;
      const gen = generation.current;
      const userMsg: Msg = { id: nextId(), role: "user", content: message, blocks: [], tools: [], createdAt: new Date().toISOString() };
      setMessages((m) => [...m.filter((x) => x.id !== opts.retryOf), userMsg]);
      setPending(true);
      try {
        const res = await api<ChatResponse>("/api/ai/chat", { method: "POST", body: { threadId: threadRef.current ?? undefined, message } });
        if (gen !== generation.current) return;
        const isNew = threadRef.current !== res.threadId;
        threadRef.current = res.threadId;
        setThreadId(res.threadId);
        setMessages((m) => [
          ...m,
          {
            id: res.message.id,
            role: "assistant",
            content: res.message.content,
            blocks: res.message.blocks ?? [],
            tools: res.message.toolCalls ?? [],
            provider: res.provider,
            createdAt: String(res.message.createdAt),
          },
        ]);
        if (isNew) setUrl(res.threadId);
        qc.invalidateQueries({ queryKey: ["ai-threads"] });
      } catch (e) {
        if (gen !== generation.current) return;
        setMessages((m) => m.map((x) => (x.id === userMsg.id ? { ...x, error: errorMessage(e) } : x)));
      } finally {
        if (gen === generation.current) setPending(false);
      }
    },
    [pending, qc, setUrl],
  );

  const newChat = useCallback(
    (opts: { keepUrl?: boolean } = {}) => {
      generation.current++;
      threadRef.current = null;
      setThreadId(null);
      setMessages([]);
      setPending(false);
      setLoadingThread(false);
      setHistoryOpen(false);
      if (!opts.keepUrl) setUrl(null);
      requestAnimationFrame(() => composer.current?.focus());
    },
    [setUrl],
  );

  const openThread = useCallback(
    async (id: string, opts: { keepUrl?: boolean } = {}) => {
      setHistoryOpen(false);
      if (id === threadRef.current) return;
      const gen = ++generation.current;
      threadRef.current = id;
      setThreadId(id);
      setMessages([]);
      setPending(false);
      setLoadingThread(true);
      if (!opts.keepUrl) setUrl(id);
      try {
        const t = await api<ThreadResponse>(`/api/ai/threads/${id}`);
        if (gen !== generation.current) return;
        setMessages(
          t.messages.map((m) => ({
            id: m.id,
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
            blocks: Array.isArray(m.blocks) ? (m.blocks as ChatBlock[]) : [],
            tools: toolNames(m.toolCalls),
            createdAt: m.createdAt,
          })),
        );
      } catch (e) {
        if (gen !== generation.current) return;
        threadRef.current = null;
        setThreadId(null);
        setMessages([{ id: nextId(), role: "assistant", content: `I couldn't open that conversation: ${errorMessage(e)}`, blocks: [], tools: [], createdAt: new Date().toISOString() }]);
        setUrl(null);
      } finally {
        if (gen === generation.current) setLoadingThread(false);
      }
    },
    [setUrl],
  );

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // Initial URL state: ?q= auto-sends once (new chat), ?t= opens a thread.
  useEffect(() => {
    const q = params.get("q");
    const t = params.get("t");
    if (q && handledQ.current !== q) {
      handledQ.current = q;
      generation.current++;
      threadRef.current = null;
      setThreadId(null);
      setMessages([]);
      setPending(false);
      router.replace(pathname, { scroll: false });
      // Let state settle before sending.
      queueMicrotask(() => void sendRef.current(q));
      return;
    }
    if (!q && t && t !== threadRef.current && !pending) void openThread(t, { keepUrl: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Keep the latest message in view.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 2 ? "smooth" : "auto" });
  }, [messages.length, pending]);

  // Auto-size the composer.
  useLayoutEffect(() => {
    const el = composer.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const submit = () => {
    if (!input.trim() || pending) return;
    const text = input;
    setInput("");
    void send(text);
  };

  const activeTitle = threadId ? threads.find((t) => t.id === threadId)?.title : null;
  const empty = !messages.length && !loadingThread;

  const history = (
    <ThreadList
      threads={threads}
      activeId={threadId}
      onSelect={(id) => void openThread(id)}
      onNew={() => newChat()}
      refreshing={threadsFetching}
      disabled={pending}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem-5rem)] min-h-0 lg:h-[calc(100dvh-3.5rem)]">
      <aside className="hidden w-[272px] shrink-0 flex-col border-r bg-surface-2/40 lg:flex" aria-label="Conversation history">
        {history}
      </aside>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-[300px] gap-0 p-0">
          <SheetTitle className="sr-only">Conversation history</SheetTitle>
          {history}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setHistoryOpen(true)} aria-label="Show conversation history">
            <History />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-ai" aria-hidden />
            <h1 className="truncate text-sm font-semibold">{activeTitle ?? (threadId ? "Conversation" : "AI Business Assistant")}</h1>
          </div>
          {!empty && (
            <Button variant="outline" size="sm" onClick={() => newChat()} disabled={pending}>
              <SquarePen /> <span className="hidden sm:inline">New chat</span>
            </Button>
          )}
        </div>

        <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" aria-live="polite" aria-busy={pending}>
          {empty ? (
            <Welcome name={user.name.split(" ")[0]} onPick={(q) => void send(q)} disabled={pending} />
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6 sm:px-6">
              {loadingThread && <ThreadSkeleton />}
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserBubble key={m.id} msg={m} disabled={pending} onRetry={() => void send(m.content, { retryOf: m.id })} />
                ) : (
                  <AssistantMessage key={m.id} msg={m} />
                ),
              )}
              {pending && <Thinking />}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-background/80 px-3 pt-3 pb-3 backdrop-blur sm:px-6">
          <form
            className="mx-auto w-full max-w-3xl"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className={cn("flex items-end gap-2 rounded-2xl border bg-card p-2 pl-3.5 shadow-sm transition focus-within:border-ai/50 focus-within:ring-3 focus-within:ring-ai/15", pending && "opacity-90")}>
              <label htmlFor="assistant-input" className="sr-only">
                Ask about your business
              </label>
              <textarea
                id="assistant-input"
                ref={composer}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                maxLength={2000}
                disabled={pending}
                placeholder={pending ? "Analyzing your store data…" : "Ask about sales, orders, customers, stock or ads…"}
                className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[14.5px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
              <Button type="submit" size="icon" className="size-9 shrink-0 rounded-xl" disabled={!input.trim() || pending} aria-label="Send message">
                {pending ? <Loader2 className="animate-spin" /> : <ArrowUp className="size-[18px]" />}
              </Button>
            </div>
            <p className="mt-1.5 hidden text-center text-[11px] text-muted-foreground sm:block">
              Answers use live store data only. Actions that change your store go to the Approval Center first. <kbd className="rounded border bg-muted px-1">Enter</kbd> to send ·{" "}
              <kbd className="rounded border bg-muted px-1">Shift</kbd>+<kbd className="rounded border bg-muted px-1">Enter</kbd> for a new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Pieces ─────────────────────────

function ThreadList({
  threads,
  activeId,
  onSelect,
  onNew,
  refreshing,
  disabled,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshing: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <Button variant="outline" className="h-9 w-full justify-start bg-card" onClick={onNew} disabled={disabled}>
          <SquarePen /> New chat
        </Button>
      </div>
      <div className="flex items-center justify-between px-4 pb-1.5">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Recent</h2>
        {refreshing && <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
        {threads.length ? (
          <ul className="space-y-0.5">
            {threads.map((t) => {
              const active = t.id === activeId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    disabled={disabled && !active}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition disabled:opacity-60",
                      active ? "bg-card shadow-xs ring-1 ring-border" : "hover:bg-muted/70",
                    )}
                  >
                    <MessageSquare className={cn("mt-0.5 size-3.5 shrink-0", active ? "text-ai" : "text-muted-foreground")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] leading-[18px] font-medium">{t.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground"><TimeAgo date={t.updatedAt} /></span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">Your conversations will appear here.</p>
        )}
      </nav>
    </div>
  );
}

function Welcome({ name, onPick, disabled }: { name: string; onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-8 sm:px-6">
      <div className="animate-fade-in text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ai-gradient text-ai ring-1 ring-ai/20">
          <Sparkles className="size-7" aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-[28px]">
          <span className="text-ai-gradient">Ask anything</span> about your business
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Hi {name} — I answer from your live Shopify, WhatsApp and Meta Ads data, and show exactly which tools I used.
        </p>
      </div>
      <ul className="mt-8 grid gap-2.5 sm:grid-cols-2" aria-label="Suggested questions">
        {PROMPTS.map((p, i) => (
          <li key={p.q} className={cn(i === PROMPTS.length - 1 && PROMPTS.length % 2 === 1 && "sm:col-span-2")}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(p.q)}
              className="group flex h-full w-full items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition hover:border-ai/40 hover:bg-ai-soft/30 hover:shadow-sm focus-visible:outline-2 disabled:opacity-60"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground transition group-hover:bg-ai-soft group-hover:text-ai">
                <p.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-5 font-medium">{p.q}</span>
                <span className="text-[11px] text-muted-foreground">{p.hint}</span>
              </span>
              <ArrowUp className="size-4 shrink-0 rotate-45 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserBubble({ msg, onRetry, disabled }: { msg: Msg; onRetry: () => void; disabled: boolean }) {
  return (
    <div className="flex animate-fade-in flex-col items-end gap-1.5">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[14.5px] leading-6 whitespace-pre-wrap text-primary-foreground sm:max-w-[75%]">{msg.content}</div>
      {msg.error && (
        <div role="alert" className="flex max-w-[85%] items-center gap-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">{msg.error}</span>
          <Button size="xs" variant="outline" className="bg-card text-foreground" onClick={onRetry} disabled={disabled}>
            <RotateCcw /> Retry
          </Button>
        </div>
      )}
    </div>
  );
}

function AssistantAvatar({ thinking }: { thinking?: boolean }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-ai-gradient text-ai ring-1 ring-ai/20", thinking && "animate-pulse")} aria-hidden>
      <Sparkles className="size-4" />
    </span>
  );
}

function AssistantMessage({ msg }: { msg: Msg }) {
  const [copied, setCopied] = useState(false);
  const provider = providerLabel(msg.provider);
  return (
    <div className="flex animate-fade-in gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 space-y-4 pt-0.5">
        {msg.content && <RichText text={msg.content} />}
        <ChatBlocks blocks={msg.blocks} />
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {msg.tools.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1">
                <Wrench className="size-3" aria-hidden /> Used:
              </span>
              {[...new Set(msg.tools)].map((t) => (
                <Tooltip key={t}>
                  <TooltipTrigger asChild>
                    <code tabIndex={0} className="rounded-md border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
                      {t}
                    </code>
                  </TooltipTrigger>
                  <TooltipContent>{toolLabel(t)}</TooltipContent>
                </Tooltip>
              ))}
            </>
          )}
          {provider && (
            <span className="inline-flex items-center gap-1">
              {msg.tools.length > 0 && <span aria-hidden>·</span>}
              {provider}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto text-muted-foreground"
                aria-label="Copy answer"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(msg.content);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
              >
                {copied ? <Check className="text-success" /> : <Copy />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? "Copied" : "Copy answer"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex animate-fade-in gap-3" role="status">
      <AssistantAvatar thinking />
      <div className="flex-1 space-y-3 pt-1.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="text-ai-gradient">Analyzing your store data…</span>
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-ai/60" style={{ animationDelay: `${i * 140}ms` }} />
            ))}
          </span>
        </p>
        <div className="max-w-md space-y-2">
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-4/5" />
        </div>
      </div>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="space-y-7" aria-label="Loading conversation">
      <div className="flex justify-end">
        <Bone className="h-10 w-2/3 rounded-2xl" />
      </div>
      <div className="flex gap-3">
        <Bone className="size-8 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Bone className="h-3.5 w-full" />
          <Bone className="h-3.5 w-3/4" />
          <Bone className="mt-3 h-28 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
