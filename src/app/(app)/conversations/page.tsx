import { Inbox as InboxIcon, MessageCircle, Ticket } from "lucide-react";
import { z } from "zod";
import { Inbox, type InboxInitial } from "@/features/conversations/inbox";
import { SegmentedNav } from "@/features/conversations/segmented-nav";
import { TicketsView } from "@/features/conversations/tickets-view";
import { requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { conversationListQuery, getConversation, inboxCounts, listConversations } from "@/services/conversation.service";
import { listTickets, ticketCounts } from "@/services/ticket.service";

export const metadata = { title: "Inbox" };

const pageQuery = z.object({
  view: z.enum(["inbox", "tickets"]).catch("inbox").default("inbox"),
  c: z.string().max(64).optional().catch(undefined),
  status: z.enum(["open", "resolved", "all"]).catch("open").default("open"),
});

const toJson = <T,>(x: T) => JSON.parse(JSON.stringify(x));

export default async function ConversationsPage({ searchParams }: PageProps<"/conversations">) {
  const auth = await requireAuth("conversations.view");
  const sp = await searchParams;
  const page = pageQuery.parse(sp);
  const storeId = auth.store.id;
  const tickets = page.view === "tickets";

  const [counts, status] = await Promise.all([ticketCounts(storeId), inboxCounts(storeId)]);
  // Open on the people waiting for a reply when there are any.
  const defaultFilter = status.needs_reply > 0 ? "needs_reply" : "all";

  let content: React.ReactNode;
  if (tickets) {
    const rows = await listTickets(storeId, { status: page.status, limit: 100 });
    content = (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
          <TicketsView initial={toJson(rows)} initialStatus={page.status} counts={counts} />
        </div>
      </div>
    );
  } else {
    const parsed = conversationListQuery.safeParse({ ...sp, filter: sp.filter ?? defaultFilter });
    const q = parsed.success ? parsed.data : conversationListQuery.parse({});
    const [list, conversation] = await Promise.all([
      listConversations(storeId, auth.user.id, q),
      page.c
        ? getConversation(storeId, page.c).catch((e) => {
            if (e instanceof AppError && e.status === 404) return null;
            throw e;
          })
        : Promise.resolve(null),
    ]);
    const initial: InboxInitial = {
      list: toJson(list),
      conversation: conversation ? toJson(conversation) : null,
      params: { channel: q.channel ?? null, filter: q.filter, q: q.q ?? "" },
    };
    content = <Inbox initial={initial} defaultFilter={defaultFilter} className="min-h-0 flex-1" />;
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem-5rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2.5 sm:px-5">
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-semibold tracking-tight sm:text-xl">Inbox</h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">WhatsApp, Messenger and Instagram in one place — the Customer Assistant answers first, you step in when needed.</p>
        </div>
        <SegmentedNav
          label="Conversations view"
          items={[
            { href: "/conversations", label: "Chats", active: !tickets, icon: <InboxIcon />, count: status.needs_reply, tone: "warning" },
            { href: "/conversations?view=tickets", label: "Tickets", active: tickets, icon: <Ticket />, count: counts.open },
            { href: "/whatsapp", label: "WhatsApp setup", active: false, icon: <MessageCircle /> },
          ]}
        />
      </div>
      {content}
    </div>
  );
}
