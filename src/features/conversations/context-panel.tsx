"use client";
import { TimeAgo } from "@/components/shared/time-ago";

import { cn } from "cn";
import { ArrowUpRight, Check, Loader2, Package, Phone, Plus, StickyNote, Tag, Ticket, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS, Pill, PRIORITY, TICKET_STATUS } from "@/components/shared/status";
import { useCan, useFormat } from "@/components/store-context";

import { CHANNEL_LABEL, ChannelIcon } from "./channel-icon";
import { ContactAvatar } from "./conversation-list";
import { NewTicketDialog } from "./new-ticket-dialog";
import type { ChannelKey, ConversationDetail } from "./types";
import type { useConversationActions } from "./use-conversation";

function Section({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b px-4 py-4 last:border-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase [&_svg]:size-3.5">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ContextPanel({ conversation: c, actions, className }: { conversation: ConversationDetail; actions: ReturnType<typeof useConversationActions>; className?: string }) {
  const f = useFormat();
  const can = useCan();
  const canManage = can("conversations.manage");
  const canReply = can("conversations.reply");
  const cust = c.customer;
  const openTickets = c.tickets.filter((t) => t.status !== "RESOLVED" && t.status !== "CLOSED");

  return (
    <div className={cn("scrollbar-thin overflow-y-auto bg-card", className)}>
      {/* Customer */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <ContactAvatar name={c.contactName} className="[&>div]:size-12 [&>div]:text-base" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{cust?.name ?? c.contactName}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <ChannelIcon channel={c.channel} className="size-3" />
              {c.channel === "WHATSAPP" ? `+${c.contactHandle}` : (CHANNEL_LABEL[c.channel as ChannelKey] ?? c.channel)}
            </p>
            {cust?.city && <p className="truncate text-xs text-muted-foreground">{cust.city}</p>}
            {c.channel === "WHATSAPP" && (
              <a href={`tel:+${c.contactHandle}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Phone className="size-3" /> Call
              </a>
            )}
          </div>
        </div>
        {cust ? (
          <>
            <dl className="mt-4 grid grid-cols-3 divide-x rounded-xl border bg-surface-2/60 text-center">
              <div className="px-2 py-2.5">
                <dt className="text-[11px] text-muted-foreground">Orders</dt>
                <dd className="tabular text-sm font-semibold">{cust.totalOrders}</dd>
              </div>
              <div className="px-2 py-2.5">
                <dt className="text-[11px] text-muted-foreground">Spent</dt>
                <dd className="tabular truncate text-sm font-semibold" title={f.money(cust.totalSpent)}>
                  {f.money(cust.totalSpent, { compact: true })}
                </dd>
              </div>
              <div className="px-2 py-2.5">
                <dt className="text-[11px] text-muted-foreground">Returns</dt>
                <dd className="tabular text-sm font-semibold">{cust.returnedCount}</dd>
              </div>
            </dl>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link href={`/customers/${cust.id}`}>
                <UserRound /> View customer profile <ArrowUpRight className="ml-auto" />
              </Link>
            </Button>
          </>
        ) : (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Not matched to a Shopify customer yet. They&apos;ll be linked automatically when they order with this {c.channel === "WHATSAPP" ? "number" : "account"}.</p>
        )}
      </div>

      {c.order && (
        <Section title="Linked order" icon={<Package />}>
          <Link href={`/orders/${c.order.id}`} className="block rounded-xl border p-3 transition hover:border-foreground/15 hover:bg-muted/40">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{c.order.name}</span>
              <Pill map={ORDER_STATUS} value={c.order.status} />
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {c.order.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}
            </p>
            <p className="tabular mt-1.5 text-sm font-medium">{f.money(c.order.total)}</p>
          </Link>
        </Section>
      )}

      {c.recentOrders.length > 0 && (
        <Section title="Recent orders" icon={<Package />}>
          <ul className="-mx-1.5 space-y-0.5">
            {c.recentOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm transition hover:bg-muted">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-xs text-muted-foreground"><TimeAgo date={o.placedAt} /></span>
                  <span className="tabular ml-auto text-xs font-medium">{f.money(o.total, { compact: true })}</span>
                  <Pill map={ORDER_STATUS} value={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Tickets"
        icon={<Ticket />}
        action={
          canManage && (
            <NewTicketDialog
              link={{ conversationId: c.id, customerId: c.customerId, orderId: c.orderId ?? c.recentOrders[0]?.id ?? null, label: `${c.contactName}'s conversation` }}
              defaultSubject={c.attentionReason ?? ""}
              trigger={
                <Button variant="ghost" size="xs">
                  <Plus /> New
                </Button>
              }
            />
          )
        }
      >
        {c.tickets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tickets for this conversation.</p>
        ) : (
          <ul className="space-y-1.5">
            {c.tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/conversations?view=tickets&ticket=${t.id}`} className="block rounded-lg border px-2.5 py-2 transition hover:bg-muted/50">
                  <p className="truncate text-[13px] font-medium">
                    <span className="text-muted-foreground">#{t.number}</span> {t.subject}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Pill map={TICKET_STATUS} value={t.status} />
                    <Pill map={PRIORITY} value={t.priority} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {openTickets.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{openTickets.length} open</p>}
      </Section>

      <Section title="Tags" icon={<Tag />}>
        <TagsEditor key={c.id} tags={c.tags.map((t) => t.name)} canEdit={canManage} actions={actions} />
      </Section>

      <Section title="Internal notes" icon={<StickyNote />}>
        <NotesEditor key={c.id} notes={c.notes} canEdit={canReply} actions={actions} />
      </Section>

    </div>
  );
}

function TagsEditor({ tags, canEdit, actions }: { tags: string[]; canEdit: boolean; actions: ReturnType<typeof useConversationActions> }) {
  const [value, setValue] = useState("");
  const save = (next: string[]) => actions.update.mutate({ tags: next });
  const add = () => {
    const t = value.trim().slice(0, 40);
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase()) || tags.length >= 10) return setValue("");
    save([...tags, t]);
    setValue("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && !canEdit && <p className="text-xs text-muted-foreground">No tags.</p>}
        {tags.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted pr-1 pl-2.5 text-xs font-medium">
            {t}
            {canEdit && (
              <button type="button" onClick={() => save(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground" disabled={actions.update.isPending}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Add a tag…"
            aria-label="Add tag"
            maxLength={40}
            className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
          <Button type="submit" variant="outline" size="icon-sm" className="size-8" disabled={!value.trim() || actions.update.isPending} aria-label="Add tag">
            {actions.update.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </form>
      )}
    </div>
  );
}

function NotesEditor({ notes, canEdit, actions }: { notes: string | null; canEdit: boolean; actions: ReturnType<typeof useConversationActions> }) {
  const [value, setValue] = useState(notes ?? "");
  const [saved, setSaved] = useState(false);
  const [base, setBase] = useState(notes);
  // Pick up remote edits while the field is untouched.
  if (notes !== base) {
    setBase(notes);
    if (value === (base ?? "")) setValue(notes ?? "");
  }
  const dirty = (value.trim() || null) !== (notes?.trim() || null);
  if (!canEdit) return <p className="text-sm whitespace-pre-wrap text-muted-foreground">{notes || "No notes."}</p>;
  return (
    <div>
      <label htmlFor="conv-notes" className="sr-only">
        Internal notes
      </label>
      <textarea
        id="conv-notes"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={3}
        maxLength={5000}
        placeholder="Visible to your team only…"
        className="field-sizing-content block max-h-48 min-h-20 w-full resize-none rounded-lg border bg-warning-soft/30 px-2.5 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
      />
      <div className="mt-1.5 flex h-7 items-center justify-end gap-2">
        {saved && !dirty && (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check className="size-3.5" /> Saved
          </span>
        )}
        {dirty && (
          <Button size="sm" onClick={() => actions.update.mutate({ notes: value.trim() || null }, { onSuccess: () => setSaved(true) })} disabled={actions.update.isPending}>
            {actions.update.isPending && <Loader2 className="animate-spin" />} Save note
          </Button>
        )}
      </div>
    </div>
  );
}
