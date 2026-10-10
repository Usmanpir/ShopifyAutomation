"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { MessagesSquare } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/client/api";
import { ConversationListPanel } from "./conversation-list";
import { ContextPanel } from "./context-panel";
import { ThreadSkeleton } from "./skeleton";
import { Thread } from "./thread";
import type { ChannelKey, ConversationDetail, ConversationList, InboxFilter } from "./types";
import { useConversation, useConversationActions } from "./use-conversation";

const FILTERS: InboxFilter[] = ["all", "needs_reply", "waiting", "ai", "human", "resolved", "unread", "attention", "mine"];
const CHANNELS: ChannelKey[] = ["WHATSAPP", "FACEBOOK", "INSTAGRAM"];
const CONTEXT_KEY = "cai.inbox.context";

// Context-panel visibility, remembered per browser.
const contextListeners = new Set<() => void>();
function readContext() {
  try {
    return localStorage.getItem(CONTEXT_KEY) !== "0";
  } catch {
    return true;
  }
}
function writeContext(open: boolean) {
  try {
    localStorage.setItem(CONTEXT_KEY, open ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  contextListeners.forEach((l) => l());
}
function subscribeContext(l: () => void) {
  contextListeners.add(l);
  return () => contextListeners.delete(l);
}

/** Updates the URL without a server round-trip (Next syncs useSearchParams with the History API). */
function writeUrl(updates: Record<string, string | null>, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(updates)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  const next = `${url.pathname}${url.search}`;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

export type InboxInitial = {
  list: ConversationList;
  conversation: ConversationDetail | null;
  params: { channel: ChannelKey | null; filter: InboxFilter; q: string };
};

/**
 * Omnichannel inbox: conversation list | thread | customer context.
 * URL state: ?c= (selected), ?filter=, ?channel=, ?q=.
 */
export function Inbox({ initial, fixedChannel, className, defaultFilter = "all" }: { initial: InboxInitial; fixedChannel?: ChannelKey; className?: string; defaultFilter?: InboxFilter }) {
  const sp = useSearchParams();
  const selectedId = sp.get("c");
  const filterParam = sp.get("filter") as InboxFilter | null;
  const filter: InboxFilter = filterParam && FILTERS.includes(filterParam) ? filterParam : defaultFilter;
  const channelParam = sp.get("channel") as ChannelKey | null;
  const channel: ChannelKey | null = fixedChannel ?? (channelParam && CHANNELS.includes(channelParam) ? channelParam : null);
  const q = sp.get("q")?.trim() ?? "";

  const matchesInitial = initial.params.filter === filter && initial.params.channel === channel && initial.params.q === q;
  const list = useQuery({
    queryKey: ["conversations", { channel, filter, q }],
    queryFn: () => {
      const s = new URLSearchParams({ filter });
      if (channel) s.set("channel", channel);
      if (q) s.set("q", q);
      return api<ConversationList>(`/api/conversations?${s}`);
    },
    initialData: matchesInitial ? initial.list : undefined,
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const detail = useConversation(selectedId, initial.conversation);
  const actions = useConversationActions(selectedId ?? "none");

  // Context panel: inline on xl (remembered), a sheet below xl.
  const contextOpen = useSyncExternalStore(subscribeContext, readContext, () => true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const toggleContext = useCallback(() => {
    if (window.matchMedia("(min-width: 1280px)").matches) writeContext(!readContext());
    else setSheetOpen(true);
  }, []);

  // Desktop: open the first conversation when nothing is selected.
  const firstId = list.data?.items[0]?.id;
  useEffect(() => {
    if (!selectedId && firstId && window.matchMedia("(min-width: 768px)").matches) writeUrl({ c: firstId });
  }, [selectedId, firstId]);

  // Mark read on open, and again whenever new inbound messages land while open.
  const unread = detail.data?.id === selectedId ? detail.data.unreadCount : 0;
  const markRead = actions.markRead.mutate;
  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    const key = `${selectedId}:${unread}`;
    if (unread > 0 && lastMarked.current !== key) {
      lastMarked.current = key;
      markRead();
    }
  }, [selectedId, unread, markRead]);

  const select = useCallback((id: string) => writeUrl({ c: id }, "push"), []);
  const onQ = useCallback((v: string) => writeUrl({ q: v || null, c: null }), []);
  const onFilter = useCallback((f: InboxFilter) => writeUrl({ filter: f === defaultFilter ? null : f, c: null }), [defaultFilter]);
  const onChannel = useCallback((c: ChannelKey | "all") => writeUrl({ channel: c === "all" ? null : c, c: null }), []);
  const back = useCallback(() => writeUrl({ c: null }, "push"), []);

  const conv = detail.data && detail.data.id === selectedId ? detail.data : null;

  return (
    <div className={cn("flex min-h-0 overflow-hidden", className)}>
      <ConversationListPanel
        data={list.data}
        loading={list.isPending}
        fetching={list.isFetching}
        selectedId={selectedId}
        onSelect={select}
        filter={filter}
        onFilter={onFilter}
        channel={channel ?? "all"}
        onChannel={onChannel}
        showChannels={!fixedChannel}
        q={q}
        onQ={onQ}
        className={cn("w-full border-r md:w-[300px] md:shrink-0 2xl:w-[340px]", selectedId ? "hidden md:flex" : "flex")}
      />

      <div className={cn("min-w-0 flex-1", selectedId ? "fixed inset-x-0 top-14 bottom-0 z-[45] flex bg-background md:static md:z-auto" : "hidden md:flex")}>
        {!selectedId ? (
          <div className="grid flex-1 place-items-center bg-surface-2/60">
            <EmptyState icon={<MessagesSquare />} title="Select a conversation" description="Pick a chat on the left to read the thread, take over from the AI or reply." />
          </div>
        ) : conv ? (
          <Thread conversation={conv} actions={actions} now={detail.dataUpdatedAt} onBack={back} contextOpen={contextOpen} onToggleContext={toggleContext} />
        ) : detail.isError ? (
          <div className="grid flex-1 place-items-center">
            <ErrorState title="Couldn't open this conversation" description="It may have been removed, or you lost your connection." onRetry={() => detail.refetch()} />
          </div>
        ) : (
          <ThreadSkeleton />
        )}
      </div>

      {conv && contextOpen && <ContextPanel conversation={conv} actions={actions} className="hidden w-[300px] shrink-0 border-l xl:block 2xl:w-[320px]" />}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[340px] gap-0 p-0 sm:max-w-[340px]">
          <SheetTitle className="sr-only">Customer details</SheetTitle>
          {conv && <ContextPanel conversation={conv} actions={actions} className="h-full" />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
