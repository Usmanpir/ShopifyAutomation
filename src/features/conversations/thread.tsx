"use client";

import { cn } from "cn";
import { AlertTriangle, ArrowLeft, CheckCircle2, Headset, Loader2, MoreHorizontal, PanelRight, RotateCcw, Sparkles, UserRound, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/shared/status";
import { useCan } from "@/components/store-context";
import { CHANNEL_LABEL, ChannelIcon } from "./channel-icon";
import { AI_MODES, AiModeControl } from "./ai-mode";
import { Composer } from "./composer";
import { ContactAvatar } from "./conversation-list";
import { MessageList } from "./message-list";
import type { ChannelKey, ConversationDetail } from "./types";
import type { ConversationPatch, useConversationActions } from "./use-conversation";

export function Thread({
  conversation: c,
  actions,
  now,
  onBack,
  contextOpen,
  onToggleContext,
}: {
  conversation: ConversationDetail;
  actions: ReturnType<typeof useConversationActions>;
  now: number;
  onBack: () => void;
  contextOpen: boolean;
  onToggleContext: () => void;
}) {
  const can = useCan();
  const canReply = can("conversations.reply");
  const closed = c.status === "RESOLVED" || c.status === "CLOSED";
  const pending = actions.update.isPending ? actions.update.variables : null;
  const run = (p: ConversationPatch) => actions.update.mutate(p);
  const busy = (p: (v: ConversationPatch) => boolean) => !!pending && p(pending);

  const last = c.messages[c.messages.length - 1];
  const aiTyping = !!last && c.handler === "AI" && !closed && last.direction === "INBOUND" && now - new Date(last.createdAt).getTime() < 90_000;

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-2 border-b bg-card px-2 py-2.5 sm:gap-3 sm:px-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft className="size-5" />
        </Button>
        <ContactAvatar name={c.contactName} channel={c.channel} className="hidden sm:block" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold">{c.contactName}</h2>
            {c.handler === "AI" ? (
              <StatusPill tone="ai" dot={false} className="hidden @xl:inline-flex">
                <Sparkles className="size-3" /> AI handling
              </StatusPill>
            ) : (
              <StatusPill tone="brand" dot={false} className="hidden @xl:inline-flex">
                <Headset className="size-3" /> Human handling{c.assignedTo ? ` · ${c.assignedTo.name.split(" ")[0]}` : ""}
              </StatusPill>
            )}
            {(() => {
              const o = c.order ?? null;
              return o ? (
                <Link href={`/orders/${o.id}`} className="tabular hidden h-[22px] items-center rounded-full border px-2 text-[11.5px] font-medium hover:bg-muted @xl:inline-flex">
                  {o.name}
                </Link>
              ) : null;
            })()}
            {closed && (
              <StatusPill tone="success" className="hidden @xl:inline-flex">
                {c.status === "CLOSED" ? "Closed" : "Resolved"}
              </StatusPill>
            )}
          </div>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <ChannelIcon channel={c.channel} className="size-3" />
            {CHANNEL_LABEL[c.channel as ChannelKey] ?? c.channel}
            {c.channel === "WHATSAPP" && <span className="tabular">· +{c.contactHandle}</span>}
            <span className={cn("@xl:hidden", AI_MODES[c.aiMode].tone)}>· {AI_MODES[c.aiMode].short}</span>
          </p>
        </div>

        {canReply && !closed && (
          <div className="flex items-center gap-1.5">
            <AiModeControl mode={c.aiMode} onChange={(m) => run({ aiMode: m })} busy={busy((v) => !!v.aiMode || !!v.handler)} disabled={actions.update.isPending} />
            <Button size="sm" variant="outline" onClick={() => run({ status: "RESOLVED" })} disabled={actions.update.isPending} className="hidden @3xl:inline-flex">
              {busy((v) => v.status === "RESOLVED") ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="text-success" />} Resolve
            </Button>
          </div>
        )}
        {canReply && closed && (
          <Button size="sm" variant="outline" onClick={() => run({ status: "OPEN" })} disabled={actions.update.isPending}>
            {busy((v) => v.status === "OPEN") ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reopen
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {canReply && !closed && (
              <>
                <DropdownMenuItem onSelect={() => run({ status: "RESOLVED" })}>
                  <CheckCircle2 /> Resolve
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run({ status: "CLOSED" })}>
                  <XCircle /> Close conversation
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {c.customer && (
              <DropdownMenuItem asChild>
                <Link href={`/customers/${c.customer.id}`}>
                  <UserRound /> View customer
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onToggleContext}>
              <PanelRight /> {contextOpen ? "Hide details" : "Show details"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon-sm" onClick={onToggleContext} aria-label={contextOpen ? "Hide customer details" : "Show customer details"} aria-pressed={contextOpen} className={cn("hidden sm:inline-flex", contextOpen && "xl:bg-muted")}>
          <PanelRight />
        </Button>
      </header>

      {/* Attention banner */}
      {c.needsAttention && !closed && (
        <div role="alert" className="flex flex-col gap-2 border-b border-warning/25 bg-warning-soft px-4 py-2.5 @3xl:flex-row @3xl:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="min-w-0">
              <span className="font-semibold text-warning">Human assistance required</span>
              {c.attentionReason && <span className="text-foreground/80"> — Reason: {c.attentionReason}</span>}
            </p>
          </div>
          {canReply && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-6 @3xl:pl-0">
              {c.aiMode === "AUTO" && (
                <Button size="sm" onClick={() => run({ aiMode: "SUGGEST" })} disabled={actions.update.isPending}>
                  <Headset /> I&apos;ll reply
                </Button>
              )}
              <Button size="sm" variant="outline" className="bg-card" onClick={() => run({ dismissAttention: true })} disabled={actions.update.isPending}>
                {c.aiMode === "AUTO" ? (
                  <>
                    <Sparkles className="text-ai" /> Keep AI handling
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="text-success" /> No reply needed
                  </>
                )}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run({ status: "CLOSED" })} disabled={actions.update.isPending}>
                Close
              </Button>
            </div>
          )}
        </div>
      )}

      <MessageList conversation={c} aiTyping={aiTyping} />
      {closed && (
        <div className="flex items-center justify-center gap-2 border-t bg-success-soft/50 px-4 py-2 text-center text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 shrink-0 text-success" /> {c.status === "CLOSED" ? "Closed" : "Resolved"} — a new customer message reopens it with the AI agent.
        </div>
      )}
      <Composer key={c.id} conversation={c} actions={actions} />

    </div>
  );
}
