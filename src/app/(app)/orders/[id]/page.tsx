import { ArrowRight, Bot, Mail, MapPin, MessageCircle, Package, Phone, Sparkles, Truck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DefinitionList, PageContainer, PageHeader, SectionCard } from "@/components/shared/page";
import { ProductImage } from "@/components/shared/product-image";
import { CONFIRMATION_STATUS, DECISION_STATUS, FULFILLMENT_STATUS, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, Pill } from "@/components/shared/status";
import { EmptyState } from "@/components/shared/states";
import { OrderActions } from "@/features/orders/order-actions";
import { AuditLogList, ChatThread, expectedSteps, OrderTimeline, ShipmentPanel, ShipmentStatusPill } from "@/features/orders/order-detail-sections";
import { OrderNoteForm, OrderTags } from "@/features/orders/order-tags-notes";
import { RiskCard, type RiskSignalView } from "@/features/orders/risk-card";
import { AiOrderSummary } from "@/features/orders/ai-order-summary";
import { summarizeOrder } from "@/lib/order-summary";
import { requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { initials, timeAgo, titleCase } from "@/lib/format";
import { makeFormatter } from "@/lib/formatter";
import { can } from "@/lib/rbac";
import { availableActions, getOrderDetail } from "@/services/order.service";
import { TimeAgo } from "@/components/shared/time-ago";

export const metadata = { title: "Order details" };

const FINAL = ["CANCELLED", "DELIVERED", "RETURNED"];

async function load(storeId: string, id: string) {
  try {
    return await getOrderDetail(storeId, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const auth = await requireAuth("orders.view");
  const { id } = await params;
  const order = await load(auth.store.id, id);
  const f = makeFormatter(auth.store);

  const canUpdate = can(auth.role, "orders.update");
  const canCancel = can(auth.role, "orders.cancel");
  const canDecide = can(auth.role, "approvals.decide");
  const actions = availableActions(order.status);
  const isFinal = FINAL.includes(order.status);

  const risk = (order.riskSignals ?? null) as { signals?: RiskSignalView[]; recommendation?: { action: string; label: string } } | null;
  const lastRiskEvent = [...order.events].reverse().find((e) => e.type === "risk_analyzed");
  const pendingDecision = order.decisions.find((d) => d.status === "PENDING_APPROVAL" && d.action === "requestOrderConfirmation");

  const shipment = order.shipments[0] ?? null;
  const expected = expectedSteps(order.status, shipment?.status ?? null, new Set(order.events.map((e) => e.type)));
  const messages = order.conversation?.messages ?? [];
  const addr = (order.shippingAddress ?? {}) as { address1?: string; address2?: string; city?: string; province?: string; zip?: string; country?: string };
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const c = order.customer;
  const lastInbound = [...messages].reverse().find((m) => m.direction === "INBOUND");
  const confirmationSent = [...order.events].reverse().find((e) => e.type === "confirmation_sent" || e.type === "confirmation_reminder");
  const summary = summarizeOrder(
    {
      ...order,
      customer: c,
      topSignal: risk?.signals?.filter((s) => s.points > 0).sort((a, b) => b.points - a.points)[0]?.detail ?? null,
      confirmationSentAt: confirmationSent?.createdAt ?? null,
      shipment: shipment ? { status: shipment.status, courier: shipment.courier, trackingNumber: shipment.trackingNumber } : null,
      openTicket: order.tickets.find((t) => !["RESOLVED", "CLOSED"].includes(t.status))?.subject ?? null,
      lastInbound: lastInbound ? { text: lastInbound.body, at: lastInbound.createdAt } : null,
    },
    (n) => f.money(n),
  );

  return (
    <PageContainer>
      <PageHeader
        crumbs={[{ label: "Orders", href: "/orders" }, { label: order.name }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            Order {order.name}
            <Pill map={ORDER_STATUS} value={order.status} className="translate-y-px" />
          </span>
        }
        description={
          <>
            Placed {f.dateTime(order.placedAt)}
            {order.source && <> · via {titleCase(order.source)}</>} · {itemCount} item{itemCount === 1 ? "" : "s"} · <span className="tabular font-medium text-foreground">{f.money(order.total)}</span>
          </>
        }
        actions={
          <OrderActions
            orderId={order.id}
            orderName={order.name}
            actions={actions}
            confirmationPending={order.confirmationStatus === "PENDING"}
            canUpdate={canUpdate}
            canCancel={canCancel}
            recommended={summary.next.action ?? null}
          />
        }
      />

      {order.status === "CANCELLED" && order.cancelReason && (
        <div role="status" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm">
          <span className="font-medium text-danger">Cancelled {order.cancelledAt ? timeAgo(order.cancelledAt) : ""}</span>
          <span className="text-foreground/80"> — {order.cancelReason}</span>
        </div>
      )}

      <AiOrderSummary summary={summary} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ───── Main column ───── */}
        <div className="min-w-0 space-y-4">
          <SectionCard
            title="Products"
            description={`${itemCount} item${itemCount === 1 ? "" : "s"}`}
            action={
              <div className="flex flex-wrap justify-end gap-1.5">
                <Pill map={FULFILLMENT_STATUS} value={order.fulfillmentStatus} />
              </div>
            }
            contentClassName="px-0 pb-0"
          >
            <ul className="divide-y border-t">
              {order.items.map((it) => {
                const title = it.productId ? (
                  <Link href={`/products/${it.productId}`} className="hover:text-primary hover:underline">
                    {it.title}
                  </Link>
                ) : (
                  it.title
                );
                return (
                  <li key={it.id} className="flex items-center gap-3 px-5 py-3.5">
                    <ProductImage src={it.imageUrl ?? it.product?.imageUrl} alt={it.title} className="size-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[it.variantTitle, it.sku && `SKU ${it.sku}`].filter(Boolean).join(" · ") || "Default"}
                      </p>
                      <p className="tabular mt-0.5 text-xs text-muted-foreground sm:hidden">
                        {f.money(it.unitPrice)} × {it.quantity}
                      </p>
                    </div>
                    <p className="tabular hidden w-32 text-right text-sm text-muted-foreground sm:block">
                      {f.money(it.unitPrice)} × {it.quantity}
                    </p>
                    <p className="tabular w-24 text-right text-sm font-semibold">{f.money(it.total)}</p>
                  </li>
                );
              })}
            </ul>
            <dl className="space-y-2 border-t bg-surface-2/50 px-5 py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular">{f.money(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="tabular">{order.shippingTotal ? f.money(order.shippingTotal) : "Free"}</dd>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="tabular text-success">−{f.money(order.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-[15px] font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{f.money(order.total)}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Timeline" description="Every step, by AI, your team, the customer and the courier">
            <OrderTimeline events={order.events} expected={expected} f={f} />
            {canUpdate && (
              <div className="mt-5 border-t pt-4">
                <OrderNoteForm orderId={order.id} />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="WhatsApp conversation"
            description={order.conversation ? `${order.conversation.contactName} · last message ${timeAgo(order.conversation.lastMessageAt)}` : undefined}
            icon={
              <span className="grid size-8 place-items-center rounded-lg bg-success-soft text-success">
                <MessageCircle className="size-4" />
              </span>
            }
            action={
              order.conversation ? (
                <Link href={`/conversations?c=${order.conversation.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Open <ArrowRight className="size-3.5" />
                </Link>
              ) : null
            }
          >
            {messages.length ? (
              <>
                <ChatThread messages={messages.slice(-8)} f={f} />
                {messages.length > 8 && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Showing the latest 8 of {messages.length} messages ·{" "}
                    <Link href={`/conversations?c=${order.conversation!.id}`} className="text-primary hover:underline">
                      view all
                    </Link>
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                compact
                icon={<MessageCircle />}
                title="No WhatsApp messages yet"
                description={
                  actions.includes("request_confirmation")
                    ? "Request a confirmation to start the conversation — the AI agent handles the replies."
                    : "Messages with this customer will appear here."
                }
              />
            )}
          </SectionCard>

          <SectionCard
            title="Shipment"
            icon={
              <span className="grid size-8 place-items-center rounded-lg bg-info-soft text-info">
                <Truck className="size-4" />
              </span>
            }
            action={shipment ? <ShipmentStatusPill status={shipment.status} /> : null}
          >
            {shipment ? (
              <ShipmentPanel shipment={shipment} f={f} />
            ) : (
              <EmptyState
                compact
                icon={<Package />}
                title={isFinal ? "No shipment" : "Not shipped yet"}
                description={
                  actions.includes("ship")
                    ? "Book a shipment from the header — the courier, tracking number and COD amount are filled in for you."
                    : isFinal
                      ? "This order was closed without a shipment."
                      : "A shipment can be booked once the order is confirmed."
                }
              />
            )}
          </SectionCard>

          <SectionCard title="Activity log" description="Who changed what, and when">
            {order.auditTrail.length ? (
              <AuditLogList entries={order.auditTrail} f={f} />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No changes recorded yet.</p>
            )}
          </SectionCard>
        </div>

        {/* ───── Sidebar ───── */}
        <aside className="min-w-0 space-y-4" aria-label="Order summary">
          <SectionCard title="Customer">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{initials(order.customerName)}</span>
              <div className="min-w-0">
                {c ? (
                  <Link href={`/customers/${c.id}`} className="block truncate text-sm font-semibold hover:text-primary hover:underline">
                    {c.name}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-semibold">{order.customerName}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {c ? (c.totalOrders <= 1 ? "First order" : `${c.totalOrders} orders · customer since ${f.date(c.firstOrderAt ?? c.createdAt)}`) : "Guest checkout"}
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {order.phone ? (
                  <a href={`tel:+${order.phone}`} className="tabular hover:text-primary">
                    +{order.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">No phone</span>
                )}
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {order.email || c?.email ? (
                  <a href={`mailto:${order.email ?? c?.email}`} className="truncate hover:text-primary">
                    {order.email ?? c?.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">No email</span>
                )}
              </li>
              <li className="flex items-center gap-2.5">
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{order.city ?? c?.city ?? "—"}</span>
              </li>
            </ul>
            {c && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-surface-2 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Orders</p>
                    <p className="tabular text-sm font-semibold">{f.number(c.totalOrders)}</p>
                  </div>
                  <div className="rounded-lg bg-surface-2 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Total spent</p>
                    <p className="tabular truncate text-sm font-semibold">{f.money(c.totalSpent, { compact: c.totalSpent >= 10_000_000 })}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 divide-x rounded-lg border text-center">
                  <div className="px-2 py-2">
                    <p className="tabular text-sm font-semibold text-success">{c.deliveredCount}</p>
                    <p className="text-[11px] text-muted-foreground">Delivered</p>
                  </div>
                  <div className="px-2 py-2">
                    <p className="tabular text-sm font-semibold text-warning">{c.cancelledCount}</p>
                    <p className="text-[11px] text-muted-foreground">Cancelled</p>
                  </div>
                  <div className="px-2 py-2">
                    <p className="tabular text-sm font-semibold text-danger">{c.returnedCount}</p>
                    <p className="text-[11px] text-muted-foreground">Returned</p>
                  </div>
                </div>
              </>
            )}
          </SectionCard>

          <RiskCard
            orderId={order.id}
            score={order.riskScore}
            level={order.riskLevel}
            signals={risk?.signals ?? []}
            recommendation={risk?.recommendation ?? null}
            analyzedAt={lastRiskEvent ? new Date(lastRiskEvent.createdAt).toISOString() : null}
            isFinal={isFinal}
            canRequestConfirmation={actions.includes("request_confirmation") && order.confirmationStatus !== "PENDING"}
            pendingDecisionId={pendingDecision?.id ?? null}
            canUpdate={canUpdate}
            canDecide={canDecide}
          />

          <SectionCard title="Payment">
            <DefinitionList
              items={[
                { label: "Method", value: PAYMENT_METHOD[order.paymentMethod] === "COD" ? "Cash on delivery" : PAYMENT_METHOD[order.paymentMethod] },
                { label: "Status", value: <Pill map={PAYMENT_STATUS} value={order.paymentStatus} /> },
                ...(order.paymentMethod === "COD"
                  ? [{ label: order.paymentStatus === "PAID" ? "COD collected" : "COD to collect", value: <span className="tabular">{f.money(order.total)}</span> }]
                  : [{ label: "Amount", value: <span className="tabular">{f.money(order.total)}</span> }]),
                { label: "Confirmation", value: <Pill map={CONFIRMATION_STATUS} value={order.confirmationStatus} /> },
              ]}
            />
          </SectionCard>

          <SectionCard title="Shipping address">
            <address className="space-y-0.5 text-sm not-italic">
              <p className="font-medium">{order.customerName}</p>
              {addr.address1 && <p>{addr.address1}</p>}
              {addr.address2 && <p>{addr.address2}</p>}
              <p>{[addr.city ?? order.city, addr.province, addr.zip].filter(Boolean).join(", ") || "—"}</p>
              {addr.country && <p className="text-muted-foreground">{addr.country}</p>}
            </address>
          </SectionCard>

          <SectionCard
            title="AI insights"
            icon={
              <span className="grid size-8 place-items-center rounded-lg bg-ai-soft text-ai">
                <Bot className="size-4" />
              </span>
            }
            action={
              order.decisions.length ? (
                <Link href="/approvals" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                  Approvals <ArrowRight className="size-3.5" />
                </Link>
              ) : null
            }
          >
            {order.decisions.length ? (
              <ul className="space-y-3">
                {order.decisions.map((d) => (
                  <li key={d.id} className="space-y-1.5 rounded-lg border p-3">
                    <p className="text-sm leading-snug font-medium">{d.title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill map={DECISION_STATUS} value={d.status} />
                      <span className="text-xs text-muted-foreground">
                        {d.agent?.name ?? "AI"} · <TimeAgo date={d.createdAt} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden />
                No AI recommendations for this order — nothing needs your attention.
              </p>
            )}
          </SectionCard>

          <SectionCard title="Tags">
            <OrderTags orderId={order.id} tags={order.tags} canUpdate={canUpdate} />
            {order.note && (
              <div className="mt-4 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Customer note</p>
                <p className="mt-1 text-sm">{order.note}</p>
              </div>
            )}
          </SectionCard>
        </aside>
      </div>
    </PageContainer>
  );
}
