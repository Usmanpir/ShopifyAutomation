import {
  ArrowRight,
  CalendarClock,
  CircleCheckBig,
  LifeBuoy,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Receipt,
  ShoppingBag,
  Sparkles,
  Undo2,
  UserPlus,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { StatTile } from "@/features/customers/stat-tile";
import { DefinitionList, PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { ProductImage } from "@/components/shared/product-image";
import { PRIORITY, Pill, RiskBadge, SegmentBadge, StatusPill, TICKET_STATUS } from "@/components/shared/status";
import { EmptyState } from "@/components/shared/states";
import { BlockCustomerButton, CustomerNotesTags } from "@/features/customers/customer-controls";
import { CustomerActions } from "@/features/customers/customer-actions";
import { CustomerInsight } from "@/features/customers/customer-insight";
import { CustomerOrdersTable } from "@/features/customers/customer-orders-table";
import { ChatThread } from "@/features/orders/order-detail-sections";
import { requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { initials, timeAgo, titleCase } from "@/lib/format";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { getCustomerProfile, type CustomerSummary } from "@/services/customer.service";
import { TimeAgo } from "@/components/shared/time-ago";

export const metadata = { title: "Customer" };

async function load(storeId: string, id: string) {
  try {
    return await getCustomerProfile(storeId, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}

const CHANNEL: Record<string, string> = { WHATSAPP: "WhatsApp", FACEBOOK: "Messenger", INSTAGRAM: "Instagram" };

/** Calendar-day difference in the store timezone: "Today", "Yesterday", "18 days ago". */
function daysAgo(d: Date | null, timeZone: string) {
  if (!d) return "Never";
  const day = (x: Date) => new Date(new Intl.DateTimeFormat("en-CA", { timeZone }).format(x)).getTime();
  const days = Math.round((day(new Date()) - day(new Date(d))) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

/** Bigger nudge the longer since the last purchase (lapsed buyers need more to come back). */
function suggestedOffer(last: Date | null) {
  if (!last) return 10;
  const days = (Date.now() - new Date(last).getTime()) / 86_400_000;
  return days > 60 ? 15 : days > 30 ? 10 : 5;
}

type Activity = { id: string; at: Date; title: string; icon: typeof ShoppingBag; tone: string; href?: string };

export default async function CustomerProfilePage({ params }: PageProps<"/customers/[id]">) {
  const auth = await requireAuth("customers.view");
  const { id } = await params;
  const c = await load(auth.store.id, id);
  const f = makeFormatter(auth.store);
  const canUpdate = can(auth.role, "customers.update");
  const blocked = c.status === "BLOCKED";

  const segments = c.segments.map((s) => s.segment);
  const since = new Intl.DateTimeFormat(auth.store.locale, { month: "long", year: "numeric", timeZone: auth.store.timezone }).format(c.firstOrderAt ?? c.createdAt);
  const addr = (c.address ?? {}) as { address1?: string; address2?: string; city?: string; country?: string };
  const latestConversation = c.conversations[0] ?? null;

  // Unified activity feed: orders, tickets, customer events.
  const activity: Activity[] = [];
  for (const o of c.orders) {
    activity.push({ id: `${o.id}-p`, at: o.placedAt, title: `Placed order ${o.name} · ${f.money(o.total)}`, icon: ShoppingBag, tone: "bg-brand-soft text-brand", href: `/orders/${o.id}` });
    if (o.deliveredAt) activity.push({ id: `${o.id}-d`, at: o.deliveredAt, title: `Order ${o.name} delivered`, icon: CircleCheckBig, tone: "bg-success-soft text-success", href: `/orders/${o.id}` });
    if (o.cancelledAt) activity.push({ id: `${o.id}-c`, at: o.cancelledAt, title: `Order ${o.name} cancelled`, icon: XCircle, tone: "bg-muted text-muted-foreground", href: `/orders/${o.id}` });
    if (o.returnedAt) activity.push({ id: `${o.id}-r`, at: o.returnedAt, title: `Order ${o.name} returned`, icon: Undo2, tone: "bg-danger-soft text-danger", href: `/orders/${o.id}` });
  }
  for (const t of c.tickets) activity.push({ id: t.id, at: t.createdAt, title: `Opened ticket #${t.number}: ${t.subject}`, icon: LifeBuoy, tone: "bg-warning-soft text-warning" });
  for (const conv of c.conversations)
    activity.push({ id: conv.id, at: conv.lastMessageAt, title: `${(CHANNEL[conv.channel] ?? titleCase(conv.channel))} conversation`, icon: MessageCircle, tone: "bg-success-soft text-success", href: `/conversations?c=${conv.id}` });
  for (const e of c.events.filter((e) => e.type !== "order_placed")) activity.push({ id: e.id, at: e.createdAt, title: e.title, icon: Sparkles, tone: "bg-ai-soft text-ai" });
  activity.push({ id: "created", at: c.createdAt, title: "Became a customer", icon: UserPlus, tone: "bg-info-soft text-info" });
  activity.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <PageContainer>
      <PageHeader
        crumbs={[{ label: "Customers", href: "/customers" }, { label: c.name }]}
        title={
          <span className="flex items-center gap-3.5">
            <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft text-base font-semibold text-brand sm:size-14 sm:text-lg">
              {initials(c.name)}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                {c.name}
                {blocked && <StatusPill tone="danger">Blocked</StatusPill>}
              </span>
              <span className="mt-1 block text-sm font-normal tracking-normal text-muted-foreground">Customer since {since}</span>
            </span>
          </span>
        }
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {c.phone && (
              <a href={`tel:+${c.phone}`} className="tabular inline-flex items-center gap-1.5 hover:text-foreground">
                <Phone className="size-3.5" aria-hidden /> +{c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground">
                <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{c.email}</span>
              </a>
            )}
            {c.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden /> {c.city}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <CustomerActions
              customer={{ id: c.id, name: c.name, phone: c.phone, blocked }}
              conversationId={can(auth.role, "conversations.view") ? (latestConversation?.id ?? null) : null}
              canMessage={can(auth.role, "conversations.reply")}
              canOffer={can(auth.role, "marketing.manage")}
              suggestedPercent={suggestedOffer(c.lastOrderAt)}
            />
            {canUpdate && (
              <>
                <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-border sm:block" />
                <BlockCustomerButton customerId={c.id} name={c.name} blocked={blocked} />
              </>
            )}
          </>
        }
      />

      {(segments.length > 0 || c.riskLevel !== "LOW") && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5" aria-label="Segments">
          {c.riskLevel !== "LOW" && <RiskBadge level={c.riskLevel} score={c.riskScore} />}
          {segments.map((s) => (
            <SegmentBadge key={s.id} name={s.name} color={s.color} />
          ))}
        </div>
      )}

      <section aria-label="Customer metrics" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Total orders"
          value={f.number(c.totalOrders)}
          hint={`${c.deliveredCount} delivered · ${c.cancelledCount} cancelled · ${c.returnedCount} returned`}
          icon={<ShoppingBag className="size-4 text-muted-foreground" aria-hidden />}
        />
        <StatTile label="Total spend" value={f.money(c.totalSpent)} hint="Excludes cancelled & returned" icon={<Wallet className="size-4 text-muted-foreground" aria-hidden />} />
        <StatTile label="Average order" value={f.money(c.avgOrderValue)} hint="Per valid order" icon={<Receipt className="size-4 text-muted-foreground" aria-hidden />} />
        <StatTile
          label="Last purchase"
          value={daysAgo(c.lastOrderAt, auth.store.timezone)}
          hint={c.lastOrderAt ? f.date(c.lastOrderAt) : undefined}
          icon={<CalendarClock className="size-4 text-muted-foreground" aria-hidden />}
        />
      </section>

      <CustomerInsight customerId={c.id} initial={(c.aiSummary as CustomerSummary | null) ?? null} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <SectionCard
            title="Order history"
            description={c.totalOrders > 10 ? `Latest ${Math.min(10, c.orders.length)} of ${c.totalOrders}` : `${c.orders.length} order${c.orders.length === 1 ? "" : "s"}`}
            action={
              c.totalOrders > 10 ? (
                <Link href={`/orders?tab=all&customerId=${c.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  View all <ArrowRight className="size-3.5" />
                </Link>
              ) : null
            }
            contentClassName="px-0 pb-0"
          >
            <CustomerOrdersTable rows={JSON.parse(JSON.stringify(c.orders.slice(0, 10)))} />
          </SectionCard>

          <SectionCard title="Products purchased" description={c.productsPurchased.length ? `${c.productsPurchased.length} distinct products` : undefined}>
            {c.productsPurchased.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {c.productsPurchased.slice(0, 8).map((p) => {
                  const inner = (
                    <>
                      <ProductImage src={p.imageUrl} alt={p.title} className="size-11" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.quantity} unit{p.quantity === 1 ? "" : "s"} · <span className="tabular">{f.money(p.total)}</span>
                        </p>
                      </div>
                    </>
                  );
                  return (
                    <li key={p.productId ?? p.title}>
                      {p.productId ? (
                        <Link href={`/products/${p.productId}`} className="flex items-center gap-3 rounded-lg border p-2.5 transition hover:border-foreground/15 hover:bg-muted/40">
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 rounded-lg border p-2.5">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No completed purchases yet.</p>
            )}
          </SectionCard>

          <SectionCard
            title="WhatsApp conversations"
            icon={
              <span className="grid size-8 place-items-center rounded-lg bg-success-soft text-success">
                <MessageCircle className="size-4" />
              </span>
            }
            description={latestConversation ? `Last message ${timeAgo(latestConversation.lastMessageAt)}` : undefined}
            action={
              latestConversation ? (
                <Link href={`/conversations?c=${latestConversation.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Open <ArrowRight className="size-3.5" />
                </Link>
              ) : null
            }
          >
            {latestConversation ? (
              <div className="space-y-3">
                <ChatThread messages={[...latestConversation.messages].reverse()} f={f} />
                {c.conversations.length > 1 && (
                  <ul className="divide-y rounded-lg border">
                    {c.conversations.slice(1).map((conv) => (
                      <li key={conv.id}>
                        <Link href={`/conversations?c=${conv.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/40">
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{(CHANNEL[conv.channel] ?? titleCase(conv.channel))}</span> <span className="text-muted-foreground">· {conv.lastMessagePreview ?? "—"}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground"><TimeAgo date={conv.lastMessageAt} /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <EmptyState compact icon={<MessageCircle />} title="No conversations yet" description="WhatsApp chats with this customer will show up here." />
            )}
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Returns" description={c.returnedCount ? `${c.returnedCount} returned order${c.returnedCount === 1 ? "" : "s"}` : undefined}>
              {c.returns.length ? (
                <ul className="divide-y">
                  {c.returns.map((o) => (
                    <li key={o.id}>
                      <Link href={`/orders/${o.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 hover:text-primary">
                        <ProductImage src={o.items[0]?.imageUrl} alt={o.items[0]?.title ?? o.name} className="size-9" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{o.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {o.items[0]?.title ?? "—"} · {f.date(o.returnedAt ?? o.placedAt)}
                          </p>
                        </div>
                        <span className="tabular text-sm font-medium">{f.money(o.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <CircleCheckBig className="size-4 text-success" aria-hidden /> No returns — every delivery was kept.
                </p>
              )}
            </SectionCard>

            <SectionCard title="Support tickets" description={c.tickets.length ? `${c.tickets.length} ticket${c.tickets.length === 1 ? "" : "s"}` : undefined}>
              {c.tickets.length ? (
                <ul className="divide-y">
                  {c.tickets.map((t) => (
                    <li key={t.id} className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm font-medium">
                          <span className="tabular text-muted-foreground">#{t.number}</span> {t.subject}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground"><TimeAgo date={t.createdAt} /></span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill map={TICKET_STATUS} value={t.status} />
                        <Pill map={PRIORITY} value={t.priority} />
                        <span className="text-xs text-muted-foreground">{titleCase(t.category)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <LifeBuoy className="size-4" aria-hidden /> No support tickets.
                </p>
              )}
            </SectionCard>
          </div>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Customer details">
          <SectionCard title="Details">
            <DefinitionList
              items={[
                { label: "Status", value: blocked ? <StatusPill tone="danger">Blocked</StatusPill> : <StatusPill tone="success">Active</StatusPill> },
                { label: "Risk", value: <RiskBadge level={c.riskLevel} score={c.riskScore} /> },
                { label: "Marketing", value: c.acceptsMarketing ? "Subscribed" : <span className="text-muted-foreground">Opted out</span> },
                { label: "First order", value: f.date(c.firstOrderAt) },
                {
                  label: "Address",
                  value: (
                    <address className="not-italic">
                      {[addr.address1, addr.address2].filter(Boolean).join(", ") || "—"}
                      {(addr.city ?? c.city) && <span className="block text-muted-foreground">{[addr.city ?? c.city, addr.country].filter(Boolean).join(", ")}</span>}
                    </address>
                  ),
                },
              ]}
            />
          </SectionCard>

          <SectionCard title="Notes & tags">
            <CustomerNotesTags customerId={c.id} notes={c.notes} tags={c.tags} canUpdate={canUpdate} />
          </SectionCard>

          <SectionCard title="Customer activity" description="Most recent first">
            <ol className="relative">
              {activity.slice(0, 12).map((a, i, arr) => {
                const body = (
                  <>
                    <p className="text-[13px] leading-snug font-medium">{a.title}</p>
                    <time className="text-xs text-muted-foreground" title={f.dateTime(a.at)}>
                      <TimeAgo date={a.at} />
                    </time>
                  </>
                );
                return (
                  <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < arr.length - 1 && <span aria-hidden className="absolute top-7 bottom-0 left-[13px] w-px bg-border" />}
                    <span className={cn("relative grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-card", a.tone)}>
                      <a.icon className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      {a.href ? (
                        <Link href={a.href} className="block hover:text-primary">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </SectionCard>
        </aside>
      </div>
    </PageContainer>
  );
}
