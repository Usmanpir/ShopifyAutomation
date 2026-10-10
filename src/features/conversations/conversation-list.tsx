"use client";

import { cn } from "cn";
import { AlertTriangle, CornerDownLeft, Headset, Hourglass, Inbox, Loader2, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/shared/states";
import { initials, timeAgo } from "@/lib/format";
import { ChannelIcon } from "./channel-icon";
import { ConversationListSkeleton } from "./skeleton";
import type { ChannelKey, ConversationList as ListData, ConversationListItem, InboxFilter } from "./types";

/** Status views, in the order an owner works through them. */
const FILTERS: { value: InboxFilter; label: string; count?: "needs_reply" | "waiting" | "ai" | "human" }[] = [
  { value: "needs_reply", label: "Needs reply", count: "needs_reply" },
  { value: "waiting", label: "Waiting", count: "waiting" },
  { value: "ai", label: "AI handling", count: "ai" },
  { value: "human", label: "Human handling", count: "human" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All open" },
];
// Older views still reachable by link (?filter=unread|attention|mine) show as an extra chip.
const LEGACY: Partial<Record<InboxFilter, string>> = { unread: "Unread", attention: "Needs attention", mine: "Assigned to me" };

const CHANNELS: { value: ChannelKey | "all"; label: string }[] = [
  { value: "all", label: "All channels" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
];

const AVATAR_TONES = ["bg-brand-soft text-brand", "bg-ai-soft text-ai", "bg-info-soft text-info", "bg-success-soft text-success", "bg-warning-soft text-warning"];

export function avatarTone(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

export function ContactAvatar({ name, channel, className }: { name: string; channel?: string; className?: string }) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <div aria-hidden className={cn("grid size-10 place-items-center rounded-full text-[13px] font-semibold", avatarTone(name))}>
        {initials(name.replace(/[^\p{L}\p{N}\s]/gu, " ")) || "?"}
      </div>
      {channel && (
        <span className="absolute -right-0.5 -bottom-0.5 grid size-[18px] place-items-center rounded-full bg-card ring-2 ring-card">
          <ChannelIcon channel={channel} className="size-3" />
        </span>
      )}
    </div>
  );
}

export function ConversationListPanel({
  data,
  loading,
  fetching,
  selectedId,
  onSelect,
  filter,
  onFilter,
  channel,
  onChannel,
  showChannels,
  q,
  onQ,
  className,
}: {
  data: ListData | undefined;
  loading: boolean;
  fetching: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: InboxFilter;
  onFilter: (f: InboxFilter) => void;
  channel: ChannelKey | "all";
  onChannel: (c: ChannelKey | "all") => void;
  showChannels: boolean;
  q: string;
  onQ: (q: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(q);
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => onQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text, q, onQ]);

  const items = data?.items ?? [];
  const counts = data?.channelCounts ?? [];
  const countFor = (c: ChannelKey | "all") =>
    c === "all" ? counts.reduce((s, x) => s + x.unread, 0) : (counts.find((x) => x.channel === c)?.unread ?? 0);

  return (
    <div className={cn("flex min-h-0 flex-col bg-card", className)}>
      <div className="space-y-2.5 border-b px-3 pt-3 pb-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations by name, phone or message"
            className="h-9 w-full rounded-lg border bg-background pr-8 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
          {fetching && text ? (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            text && (
              <button type="button" onClick={() => setText("")} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )
          )}
        </div>
        {showChannels && (
          <div role="tablist" aria-label="Channel" className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
            {CHANNELS.map((c) => {
              const active = channel === c.value;
              const n = countFor(c.value);
              return (
                <button
                  key={c.value}
                  role="tab"
                  aria-selected={active}
                  title={c.label}
                  onClick={() => onChannel(c.value)}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium whitespace-nowrap transition",
                    active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {c.value !== "all" && <ChannelIcon channel={c.value} tinted={active} />}
                  {c.value === "all" ? "All" : <span className={cn(!active && "sr-only")}>{c.label}</span>}
                  {n > 0 && <span className="tabular rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">{n}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div role="tablist" aria-label="Filter conversations" className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 md:flex-wrap md:overflow-visible">
          {LEGACY[filter] && (
            <button role="tab" aria-selected className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-foreground/10 bg-foreground px-2.5 text-[12.5px] font-medium text-background">
              {LEGACY[filter]}
            </button>
          )}
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const n = f.count ? data?.statusCounts?.[f.count] : undefined;
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={active}
                onClick={() => onFilter(f.value)}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-medium whitespace-nowrap transition",
                  active ? "border-foreground/10 bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.value === "needs_reply" && <CornerDownLeft className={cn("size-3", !active && "text-warning")} />}
                {f.value === "ai" && <Sparkles className={cn("size-3", !active && "text-ai")} />}
                {f.label}
                {!!n && (
                  <span className={cn("tabular rounded-full px-1 text-[10.5px] leading-4", active ? "bg-background/20" : f.value === "needs_reply" ? "bg-warning-soft text-warning" : "bg-muted")}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
        {loading ? (
          <ConversationListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={<Inbox />}
            title={q ? "No conversations match" : filter === "needs_reply" || filter === "attention" ? "No one is waiting for a reply" : "No conversations here"}
            description={
              q
                ? "Try another name, phone number or phrase."
                : filter === "needs_reply" || filter === "attention"
                  ? "The Customer Assistant is handling everything. Chats that need a person appear here."
                  : "When customers message you, their conversations show up here."
            }
          />
        ) : (
          <ul role="listbox" aria-label="Conversations" className="divide-y divide-border/60">
            {items.map((c) => (
              <ConversationRow key={c.id} c={c} active={c.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ c, active, onSelect }: { c: ConversationListItem; active: boolean; onSelect: (id: string) => void }) {
  const unread = c.unreadCount > 0;
  const closed = c.status === "RESOLVED" || c.status === "CLOSED";
  const order = c.order ?? c.customer?.orders?.[0] ?? null;
  const needsReply = !closed && (c.needsAttention || (c.handler === "HUMAN" && c.lastMessageDirection === "INBOUND"));
  const waiting = !closed && !needsReply && c.lastMessageDirection === "OUTBOUND";
  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        className={cn(
          "relative flex w-full gap-3 px-3 py-3 text-left transition outline-none focus-visible:bg-muted",
          active ? "bg-accent" : "hover:bg-muted/50",
          c.needsAttention && !active && "bg-warning-soft/40",
        )}
      >
        {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" />}
        <ContactAvatar name={c.contactName} channel={c.channel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{c.contactName}</p>
            <time suppressHydrationWarning dateTime={c.lastMessageAt} className={cn("shrink-0 text-[11px]", unread ? "font-medium text-primary" : "text-muted-foreground")}>
              {timeAgo(c.lastMessageAt).replace(" ago", "")}
            </time>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {c.handler === "AI" ? (
              <Sparkles className="size-3 shrink-0 text-ai" aria-label="AI handling" />
            ) : (
              <Headset className="size-3 shrink-0 text-brand" aria-label={`Human handling${c.assignedTo ? ` (${c.assignedTo.name})` : ""}`} />
            )}
            <p className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "text-foreground" : "text-muted-foreground")}>{c.lastMessagePreview ?? "No messages yet"}</p>
            {unread && (
              <span className="tabular grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-primary px-1 text-[10.5px] font-semibold text-primary-foreground" aria-label={`${c.unreadCount} unread`}>
                {c.unreadCount > 99 ? "99+" : c.unreadCount}
              </span>
            )}
          </div>
          {(needsReply || waiting || order || c.tags.length > 0 || closed) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {needsReply && (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-warning-soft px-1.5 text-[11px] font-medium text-warning">
                  <AlertTriangle className="size-3" /> Needs reply
                </span>
              )}
              {waiting && (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                  <Hourglass className="size-3" /> Waiting
                </span>
              )}
              {order && (
                <span className="tabular inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium text-foreground/80">
                  <ShoppingBag className="size-3 text-muted-foreground" /> {order.name}
                </span>
              )}
              {closed && <span className="inline-flex h-5 items-center rounded-full bg-success-soft px-1.5 text-[11px] font-medium text-success">{c.status === "CLOSED" ? "Closed" : "Resolved"}</span>}
              {c.tags.slice(0, 2).map((t) => (
                <span key={t.id} className="inline-flex h-5 items-center rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                  {t.name}
                </span>
              ))}
              {c.tags.length > 2 && <span className="text-[11px] text-muted-foreground">+{c.tags.length - 2}</span>}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}
