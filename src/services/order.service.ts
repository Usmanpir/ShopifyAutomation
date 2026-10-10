import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ActorType, OrderStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { publishEvent } from "@/lib/events/bus";
import { formatMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { enqueue } from "@/lib/queue";
import { scoreOrderRisk, type RiskResult } from "@/lib/risk/score";
import type { ServiceContext } from "@/lib/service-context";
import type { NormalizedOrder } from "@/lib/shopify/mappers";
import { paginate, paginationSchema, sortDir } from "@/schemas/common";
import { findOrCreateCustomer, recomputeCustomerMetrics } from "./customer.service";
import { createDecision } from "./decision.service";
import { sendWhatsApp } from "./messaging.service";
import { notify } from "./notification.service";
import { getStore } from "./store.service";

// ───────────────────────── Listing ─────────────────────────

export const ORDER_TABS = [
  "all",
  "attention",
  "new",
  "pending_confirmation",
  "confirmed",
  "to_ship",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "high_risk",
] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

const OPEN: OrderStatus[] = ["NEW", "PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING"];
const LATE_MS = 48 * 3_600_000;

export const orderListQuery = paginationSchema.extend({
  tab: z.enum(ORDER_TABS).catch("all").default("all"),
  q: z.string().trim().max(100).optional(),
  payment: z.enum(["COD", "CARD", "BANK_TRANSFER", "WALLET"]).optional().catch(undefined),
  customerId: z.string().optional(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().catch(undefined),
  city: z.string().trim().max(60).optional(),
  /** Placed within the last N days (1 = today in store time is approximated as 24 h). */
  days: z.coerce.number().int().min(1).max(365).optional().catch(undefined),
  /** Order total bounds in major units (what people type). */
  min: z.coerce.number().int().min(0).optional().catch(undefined),
  max: z.coerce.number().int().min(0).optional().catch(undefined),
  late: z.enum(["1"]).optional().catch(undefined),
  confirmation: z.enum(["awaiting", "not_sent"]).optional().catch(undefined),
  sort: z.enum(["placedAt", "total", "riskScore", "orderNumber"]).default("placedAt"),
  dir: sortDir,
});
export type OrderListQuery = z.infer<typeof orderListQuery>;

function tabWhere(tab: OrderTab): Prisma.OrderWhereInput {
  switch (tab) {
    case "all":
      return {};
    case "high_risk":
      return { riskLevel: "HIGH", status: { notIn: ["CANCELLED", "DELIVERED", "RETURNED"] } };
    // Everything a person has to act on: unconfirmed, risky, or stuck before dispatch.
    case "attention":
      return {
        OR: [
          { status: { in: ["NEW", "PENDING_CONFIRMATION"] } },
          { riskLevel: "HIGH", status: { in: OPEN } },
          { status: { in: ["CONFIRMED", "PROCESSING"] }, confirmedAt: { lt: new Date(Date.now() - LATE_MS) } },
        ],
      };
    case "to_ship":
      return { status: { in: ["CONFIRMED", "PROCESSING"] } };
    default:
      return { status: tab.toUpperCase() as OrderStatus };
  }
}

export function orderSearchWhere(q: string): Prisma.OrderWhereInput {
  const digits = q.replace(/D/g, "");
  const or: Prisma.OrderWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { customerName: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
  ];
  if (digits.length >= 3) {
    or.push({ phone: { contains: digits.replace(/^0/, "") } });
    if (digits.length <= 7) or.push({ orderNumber: Number(digits) });
  }
  return { OR: or };
}

/** All list filters as one AND (so tab and search ORs never overwrite each other). */
export function orderListWhere(storeId: string, q: Partial<OrderListQuery>): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [tabWhere(q.tab ?? "all")];
  if (q.payment) and.push({ paymentMethod: q.payment });
  if (q.customerId) and.push({ customerId: q.customerId });
  if (q.q) and.push(orderSearchWhere(q.q));
  if (q.risk) and.push({ riskLevel: q.risk });
  if (q.city) and.push({ city: { equals: q.city, mode: "insensitive" } });
  if (q.days) and.push({ placedAt: { gte: new Date(Date.now() - q.days * 86_400_000) } });
  if (q.min !== undefined) and.push({ total: { gte: q.min * 100 } });
  if (q.max !== undefined) and.push({ total: { lte: q.max * 100 } });
  if (q.late) and.push({ status: { in: ["CONFIRMED", "PROCESSING"] }, confirmedAt: { lt: new Date(Date.now() - LATE_MS) } });
  if (q.confirmation === "awaiting") and.push({ confirmationStatus: "PENDING", status: { in: ["NEW", "PENDING_CONFIRMATION"] } });
  if (q.confirmation === "not_sent") and.push({ confirmationStatus: { not: "PENDING" }, status: { in: ["NEW", "PENDING_CONFIRMATION"] } });
  return { storeId, AND: and };
}

export async function listOrders(storeId: string, q: OrderListQuery) {
  const where = orderListWhere(storeId, q);
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { [q.sort]: q.dir },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { items: { select: { title: true, quantity: true, imageUrl: true, variantTitle: true } } },
    }),
    db.order.count({ where }),
  ]);
  return paginate(items, total, q.page, q.pageSize);
}

/** Counts per tab for the filter bar (single grouped query). */
export async function orderTabCounts(storeId: string): Promise<Record<OrderTab, number>> {
  const [byStatus, highRisk, attention] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }),
    db.order.count({ where: { storeId, ...tabWhere("high_risk") } }),
    db.order.count({ where: { storeId, ...tabWhere("attention") } }),
  ]);
  const counts = Object.fromEntries(ORDER_TABS.map((t) => [t, 0])) as Record<OrderTab, number>;
  for (const row of byStatus) {
    counts[row.status.toLowerCase() as OrderTab] = row._count._all;
    counts.all += row._count._all;
  }
  counts.high_risk = highRisk;
  counts.attention = attention;
  counts.to_ship = counts.confirmed + counts.processing;
  return counts;
}

/** Today's work at a glance (store timezone) for the Orders header. */
export async function ordersToday(storeId: string) {
  const store = await getStore(storeId);
  const { startOfDayTz } = await import("@/lib/dates");
  const start = startOfDayTz(new Date(), store.timezone);
  const [placed, toConfirm, toShip, shipped, delivered] = await Promise.all([
    db.order.count({ where: { storeId, placedAt: { gte: start } } }),
    db.order.count({ where: { storeId, status: { in: ["NEW", "PENDING_CONFIRMATION"] } } }),
    db.order.count({ where: { storeId, status: { in: ["CONFIRMED", "PROCESSING"] } } }),
    db.order.count({ where: { storeId, shippedAt: { gte: start } } }),
    db.order.count({ where: { storeId, deliveredAt: { gte: start } } }),
  ]);
  return { placed, toConfirm, toShip, shipped, delivered };
}

export async function getOrderDetail(storeId: string, id: string) {
  const order = await db.order.findFirst({
    where: { id, storeId },
    include: {
      items: { include: { product: { select: { id: true, imageUrl: true, handle: true } } } },
      customer: true,
      events: { orderBy: { createdAt: "asc" } },
      shipments: { include: { events: { orderBy: { occurredAt: "asc" } } }, orderBy: { createdAt: "desc" } },
      conversations: { include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } }, orderBy: { lastMessageAt: "desc" }, take: 1 },
      tickets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) throw notFound("Order");

  // If no conversation is linked to the order, show the customer's WhatsApp thread.
  let conversation: (typeof order.conversations)[number] | null = order.conversations[0] ?? null;
  if (!conversation && order.phone) {
    conversation = await db.conversation.findFirst({
      where: { storeId, channel: "WHATSAPP", externalThreadId: order.phone },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
    });
  }
  const [decisions, auditTrail] = await Promise.all([
    db.aIDecision.findMany({ where: { storeId, relatedType: "order", relatedId: id }, orderBy: { createdAt: "desc" }, include: { agent: { select: { name: true } } } }),
    db.auditLog.findMany({ where: { storeId, resourceType: "order", resourceId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { ...order, conversation, decisions, auditTrail };
}

// ───────────────────────── Ingestion ─────────────────────────

async function addEvent(
  storeId: string,
  orderId: string,
  type: string,
  title: string,
  opts: { description?: string; actorType?: ActorType; actorId?: string | null; actorName?: string; data?: unknown; at?: Date } = {},
) {
  await db.orderEvent.create({
    data: {
      storeId,
      orderId,
      type,
      title,
      description: opts.description ?? null,
      actorType: opts.actorType ?? "SYSTEM",
      actorId: opts.actorId ?? null,
      actorName: opts.actorName ?? null,
      data: (opts.data ?? undefined) as Prisma.InputJsonValue | undefined,
      ...(opts.at ? { createdAt: opts.at } : {}),
    },
  });
}

/**
 * Idempotently ingests an order from Shopify (webhook/sync) or the demo
 * simulator: links/creates the customer, maps line items to catalog
 * variants, records the timeline and kicks off risk analysis + automations.
 */
export async function ingestOrder(storeId: string, input: NormalizedOrder, opts: { source: "shopify" | "demo"; adjustInventory?: boolean } = { source: "shopify" }) {
  const existing = await db.order.findUnique({ where: { storeId_externalId: { storeId, externalId: input.externalId } } });
  if (existing) return { order: existing, created: false };

  const customer = await findOrCreateCustomer(storeId, {
    externalId: input.customerExternalId,
    name: input.customerName,
    email: input.email,
    phone: input.phone,
    city: input.city,
    address: input.shippingAddress,
  });

  const externalVariantIds = input.items.map((i) => i.externalVariantId).filter(Boolean) as string[];
  const skus = input.items.map((i) => i.sku).filter(Boolean) as string[];
  const variants = await db.productVariant.findMany({
    where: { storeId, OR: [{ externalId: { in: externalVariantIds } }, { sku: { in: skus } }] },
    include: { product: { select: { id: true, imageUrl: true } } },
  });
  const findVariant = (i: NormalizedOrder["items"][number]) =>
    variants.find((v) => (i.externalVariantId && v.externalId === i.externalVariantId) || (i.sku && v.sku === i.sku));

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        storeId,
        externalId: input.externalId,
        orderNumber: input.orderNumber,
        name: input.name,
        customerId: customer.id,
        customerName: input.customerName,
        email: input.email,
        phone: normalizePhone(input.phone),
        city: input.city,
        shippingAddress: (input.shippingAddress ?? undefined) as Prisma.InputJsonValue | undefined,
        currency: input.currency,
        subtotal: input.subtotal,
        shippingTotal: input.shippingTotal,
        discountTotal: input.discountTotal,
        total: input.total,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        status: input.cancelledAt ? "CANCELLED" : "NEW",
        cancelledAt: input.cancelledAt,
        cancelReason: input.cancelReason,
        tags: input.tags,
        note: input.note,
        source: input.source ?? opts.source,
        placedAt: input.placedAt,
        items: {
          create: input.items.map((i) => {
            const v = findVariant(i);
            return {
              productId: v?.productId ?? null,
              variantId: v?.id ?? null,
              title: i.title,
              variantTitle: i.variantTitle,
              sku: i.sku,
              imageUrl: v?.product.imageUrl ?? null,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              unitCost: v?.costPrice ?? null,
              total: i.unitPrice * i.quantity,
            };
          }),
        },
      },
    });
    if (opts.adjustInventory) {
      for (const i of input.items) {
        const v = findVariant(i);
        if (!v) continue;
        await tx.productVariant.update({ where: { id: v.id }, data: { inventoryQuantity: { decrement: i.quantity }, unitsSold: { increment: i.quantity } } });
        await tx.product.update({
          where: { id: v.productId },
          data: { totalInventory: { decrement: i.quantity }, unitsSold: { increment: i.quantity }, revenue: { increment: i.unitPrice * i.quantity } },
        });
      }
    }
    return created;
  });

  await addEvent(storeId, order.id, "placed", "Order placed", {
    description: `${input.items.reduce((s, i) => s + i.quantity, 0)} item(s) via ${input.source ?? opts.source}`,
    at: input.placedAt,
  });
  await recomputeCustomerMetrics(customer.id);
  // A purchase immediately ends "inactive"/"at risk" status (full segmentation runs on a schedule).
  await db.customerSegmentMember.deleteMany({ where: { customerId: customer.id, segment: { key: { in: ["inactive", "at_risk"] } } } });
  await db.customerEvent.create({
    data: { storeId, customerId: customer.id, type: "order_placed", title: `Placed order ${order.name}`, data: { orderId: order.id } },
  });

  const store = await getStore(storeId);
  await publishEvent(storeId, "ORDER_CREATED", {
    title: `New order ${order.name} · ${formatMoney(order.total, { currency: store.currency, locale: store.locale })}`,
    tone: "success",
    href: `/orders/${order.id}`,
    payload: { orderId: order.id, customerId: customer.id },
  });
  await enqueue("order.analyze", { orderId: order.id });
  if (opts.adjustInventory) {
    const { checkLowStockForVariants } = await import("./inventory.service");
    await checkLowStockForVariants(storeId, input.items.map((i) => findVariant(i)?.id).filter(Boolean) as string[]);
  }
  return { order, created: true };
}

// ───────────────────────── Risk ─────────────────────────

export async function computeOrderRisk(orderId: string): Promise<RiskResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order) throw notFound("Order");
  const store = await getStore(order.storeId);
  const since = new Date(order.placedAt.getTime() - 86_400_000);

  const [samePhoneOrders, recentSamePhone, previousCities] = await Promise.all([
    order.phone
      ? db.order.findMany({ where: { storeId: order.storeId, phone: order.phone, id: { not: order.id } }, select: { customerName: true, status: true } })
      : Promise.resolve([]),
    order.phone
      ? db.order.count({ where: { storeId: order.storeId, phone: order.phone, id: { not: order.id }, placedAt: { gte: since, lte: order.placedAt } } })
      : Promise.resolve(0),
    order.customerId
      ? db.order.findMany({ where: { customerId: order.customerId, id: { not: order.id }, city: { not: null } }, select: { city: true }, distinct: ["city"] })
      : Promise.resolve([]),
  ]);

  const c = order.customer;
  // Customer metrics include this order; risk looks at history before it.
  const history = c
    ? {
        totalOrders: Math.max(0, c.totalOrders - 1),
        deliveredCount: c.deliveredCount,
        cancelledCount: c.cancelledCount - (order.status === "CANCELLED" ? 1 : 0),
        returnedCount: c.returnedCount - (order.status === "RETURNED" ? 1 : 0),
      }
    : null;
  const addr = (order.shippingAddress ?? {}) as { address1?: string; address2?: string };

  return scoreOrderRisk(
    {
      orderTotal: order.total,
      paymentMethod: order.paymentMethod,
      customer: history,
      phone: {
        normalized: order.phone,
        distinctNames: new Set([order.customerName, ...samePhoneOrders.map((o) => o.customerName)].map((n) => n.toLowerCase())).size,
        cancelledOrders: samePhoneOrders.filter((o) => o.status === "CANCELLED").length,
      },
      address: {
        line: [addr.address1, addr.address2].filter(Boolean).join(" "),
        city: order.city,
        previousCities: previousCities.map((p) => p.city!).filter(Boolean),
      },
      recentOrdersSamePhone: recentSamePhone,
    },
    store.settings.risk,
  );
}

/** Scores the order, records the result and recommends an action. Never cancels automatically. */
export async function analyzeOrderRisk(orderId: string) {
  const risk = await computeOrderRisk(orderId);
  const order = await db.order.update({
    where: { id: orderId },
    data: { riskScore: risk.score, riskLevel: risk.level, riskSignals: risk as unknown as Prisma.InputJsonValue },
  });
  await addEvent(order.storeId, order.id, "risk_analyzed", `AI risk analyzed · ${risk.level.toLowerCase()} risk (${risk.score}/100)`, {
    actorType: "AI",
    actorName: "Order Agent",
    description: risk.signals.filter((s) => s.points > 0).slice(0, 3).map((s) => s.detail).join(" · ") || "No risk signals",
    data: { score: risk.score, level: risk.level },
  });

  if (risk.level === "HIGH" && !["CANCELLED", "DELIVERED", "RETURNED"].includes(order.status)) {
    const top = risk.signals.filter((s) => s.points > 0).slice(0, 4);
    await createDecision(order.storeId, {
      agentKey: "ORDER",
      title: `High-risk COD order ${order.name}`,
      summary: `Order ${order.name} from ${order.customerName} scored ${risk.score}/100.`,
      reasoning: `High-risk orders are more likely to be refused at the door, costing shipping both ways. ${risk.recommendation.label}.`,
      evidence: top.map((s) => ({ label: s.label, value: s.detail, points: s.points })),
      action: "requestOrderConfirmation",
      actionInput: { orderId: order.id },
      expectedImpact: "Reduces failed deliveries and return shipping costs.",
      riskLevel: "MEDIUM",
      requiresApproval: true,
      relatedType: "order",
      relatedId: order.id,
    });
    await publishEvent(order.storeId, "ORDER_HIGH_RISK", {
      title: `High-risk COD order ${order.name} detected`,
      tone: "danger",
      href: `/orders/${order.id}`,
      payload: { orderId: order.id, customerId: order.customerId, score: risk.score },
    });
    await notify(order.storeId, {
      type: "ORDER",
      severity: "WARNING",
      title: `High-risk order ${order.name}`,
      body: `Risk score ${risk.score}/100 — ${top[0]?.detail ?? "review recommended"}`,
      href: `/orders/${order.id}`,
      roles: ["OWNER", "ADMIN", "MANAGER", "SUPPORT_AGENT"],
    });
  }
  return risk;
}

// ───────────────────────── Status transitions ─────────────────────────

export const ORDER_ACTIONS = ["confirm", "process", "ship", "deliver", "cancel", "return", "request_confirmation"] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "CANCELLED"],
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED", "PROCESSING"],
  CONFIRMED: ["PROCESSING", "SHIPPED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

const ACTION_TARGET: Record<Exclude<OrderAction, "request_confirmation">, OrderStatus> = {
  confirm: "CONFIRMED",
  process: "PROCESSING",
  ship: "SHIPPED",
  deliver: "DELIVERED",
  cancel: "CANCELLED",
  return: "RETURNED",
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return TRANSITIONS[from].includes(to);
}

export function availableActions(status: OrderStatus): OrderAction[] {
  const actions = (Object.keys(ACTION_TARGET) as Exclude<OrderAction, "request_confirmation">[]).filter((a) =>
    canTransition(status, ACTION_TARGET[a]),
  ) as OrderAction[];
  if (status === "NEW" || status === "PENDING_CONFIRMATION") actions.unshift("request_confirmation");
  return actions;
}

export const transitionSchema = z.object({
  action: z.enum(ORDER_ACTIONS),
  reason: z.string().trim().max(500).optional(),
});

/** Single entry point for status changes by humans, AI tools and automations. */
export async function transitionOrder(ctx: ServiceContext, orderId: string, action: OrderAction, reason?: string) {
  if (action === "request_confirmation") return requestOrderConfirmation(ctx, orderId);

  const order = await db.order.findFirst({ where: { id: orderId, storeId: ctx.storeId } });
  if (!order) throw notFound("Order");
  const target = ACTION_TARGET[action];
  if (order.status === target) return order;
  if (!canTransition(order.status, target)) {
    throw conflict(`Can't ${action} an order that is ${order.status.replace(/_/g, " ").toLowerCase()}`);
  }
  if (action === "cancel" && !reason) throw badRequest("A cancellation reason is required");

  const now = new Date();
  const data: Prisma.OrderUpdateInput = { status: target };
  if (target === "CONFIRMED") {
    data.confirmedAt = now;
    if (order.confirmationStatus === "PENDING" || order.confirmationStatus === "NO_RESPONSE") data.confirmationStatus = "CONFIRMED";
  }
  if (target === "SHIPPED") {
    data.shippedAt = now;
    data.fulfillmentStatus = "FULFILLED";
  }
  if (target === "DELIVERED") {
    data.deliveredAt = now;
    if (order.paymentMethod === "COD") data.paymentStatus = "PAID";
  }
  if (target === "CANCELLED") {
    data.cancelledAt = now;
    data.cancelReason = reason ?? null;
  }
  if (target === "RETURNED") data.returnedAt = now;

  const updated = await db.order.update({ where: { id: orderId }, data });

  const titles: Record<OrderStatus, string> = {
    NEW: "Order reopened",
    PENDING_CONFIRMATION: "Awaiting confirmation",
    CONFIRMED: "Order confirmed",
    PROCESSING: "Order processed",
    SHIPPED: "Order shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Order cancelled",
    RETURNED: "Order returned",
  };
  await addEvent(ctx.storeId, orderId, target.toLowerCase(), titles[target], {
    description: reason,
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
  });
  await audit(ctx, {
    action: `order.${action}`,
    resourceType: "order",
    resourceId: orderId,
    resourceLabel: order.name,
    oldValue: { status: order.status },
    newValue: { status: target },
    reason,
  });

  // Mirror to Shopify (best effort — failures are recorded, not fatal).
  try {
    const commerce = await getCommerceProvider(ctx.storeId);
    if (target === "CANCELLED") await commerce.cancelOrder(order.externalId, { reason: reason ?? "other", restock: true, notify: false });
    else await commerce.addOrderTags(order.externalId, [`commerceai-${target.toLowerCase().replace(/_/g, "-")}`]);
  } catch (err) {
    await addEvent(ctx.storeId, orderId, "sync_failed", "Shopify sync failed", { description: (err as Error).message });
  }

  if (order.customerId) await recomputeCustomerMetrics(order.customerId);

  const eventMap: Partial<Record<OrderStatus, Parameters<typeof publishEvent>[1]>> = {
    CONFIRMED: "ORDER_CONFIRMED",
    CANCELLED: "ORDER_CANCELLED",
    SHIPPED: "ORDER_FULFILLED",
    DELIVERED: "ORDER_DELIVERED",
    RETURNED: "ORDER_RETURNED",
  };
  const tones: Partial<Record<OrderStatus, "success" | "info" | "warning" | "danger">> = {
    CONFIRMED: "success",
    SHIPPED: "info",
    DELIVERED: "success",
    CANCELLED: "danger",
    RETURNED: "warning",
  };
  const ev = eventMap[target];
  if (ev) {
    await publishEvent(ctx.storeId, ev, {
      title: `Order ${order.name} ${target === "SHIPPED" ? "shipped" : titles[target].replace("Order ", "").toLowerCase()}`,
      tone: tones[target],
      href: `/orders/${orderId}`,
      payload: { orderId, customerId: order.customerId, by: ctx.actor.type },
    });
  }
  return updated;
}

/** Bulk status change for humans (each order validated individually). */
export async function bulkTransition(ctx: ServiceContext, ids: string[], action: OrderAction, reason?: string) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids.slice(0, 100)) {
    try {
      await transitionOrder(ctx, id, action, reason);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  return results;
}

// ───────────────────────── WhatsApp confirmation ─────────────────────────

export async function requestOrderConfirmation(ctx: ServiceContext, orderId: string, opts: { reminder?: boolean } = {}) {
  const order = await db.order.findFirst({ where: { id: orderId, storeId: ctx.storeId } });
  if (!order) throw notFound("Order");
  if (!["NEW", "PENDING_CONFIRMATION"].includes(order.status)) {
    throw conflict(`Order is already ${order.status.replace(/_/g, " ").toLowerCase()}`);
  }
  const store = await getStore(ctx.storeId);
  const firstName = order.customerName.split(" ")[0];
  await sendWhatsApp({
    storeId: ctx.storeId,
    phone: order.phone,
    name: order.customerName,
    customerId: order.customerId,
    orderId: order.id,
    sender: ctx.actor.type === "USER" ? "AGENT" : ctx.actor.type === "AI" ? "AI" : "SYSTEM",
    senderUserId: ctx.actor.type === "USER" ? ctx.actor.id : null,
    template: {
      name: opts.reminder ? "order_confirmation_reminder" : "order_confirmation",
      variables: [firstName, order.name, formatMoney(order.total, { currency: store.currency, locale: store.locale }), store.name],
    },
  });
  const updated = await db.order.update({
    where: { id: orderId },
    data: { status: "PENDING_CONFIRMATION", confirmationStatus: "PENDING" },
  });
  await addEvent(ctx.storeId, orderId, opts.reminder ? "confirmation_reminder" : "confirmation_sent", opts.reminder ? "Confirmation reminder sent" : "WhatsApp confirmation sent", {
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
  });
  await audit(ctx, {
    action: opts.reminder ? "order.confirmation_reminder" : "order.request_confirmation",
    resourceType: "order",
    resourceId: orderId,
    resourceLabel: order.name,
    oldValue: { status: order.status, confirmationStatus: order.confirmationStatus },
    newValue: { status: "PENDING_CONFIRMATION", confirmationStatus: "PENDING" },
  });
  return updated;
}

/** Applies a customer's YES/NO reply to a pending confirmation. */
export async function applyConfirmationReply(ctx: ServiceContext, orderId: string, reply: "CONFIRM" | "DECLINE", quote: string) {
  const order = await db.order.findFirst({ where: { id: orderId, storeId: ctx.storeId } });
  if (!order || order.confirmationStatus !== "PENDING") return null;
  if (reply === "CONFIRM") {
    await db.order.update({ where: { id: orderId }, data: { confirmationStatus: "CONFIRMED" } });
    await addEvent(ctx.storeId, orderId, "customer_confirmed", "Customer confirmed", { actorType: "CUSTOMER", actorName: order.customerName, description: `“${quote}”` });
    return transitionOrder(ctx, orderId, "confirm", `Customer replied "${quote}"`);
  }
  await db.order.update({ where: { id: orderId }, data: { confirmationStatus: "DECLINED" } });
  await addEvent(ctx.storeId, orderId, "customer_declined", "Customer declined", { actorType: "CUSTOMER", actorName: order.customerName, description: `“${quote}”` });
  await publishEvent(ctx.storeId, "ORDER_DECLINED", {
    title: `Customer declined order ${order.name}`,
    tone: "warning",
    href: `/orders/${orderId}`,
    payload: { orderId, customerId: order.customerId },
  });
  return transitionOrder(ctx, orderId, "cancel", `Customer declined via WhatsApp: "${quote}"`);
}

export async function addOrderTag(ctx: ServiceContext, orderId: string, tag: string) {
  const order = await db.order.findFirst({ where: { id: orderId, storeId: ctx.storeId } });
  if (!order) throw notFound("Order");
  const clean = tag.trim().toLowerCase().slice(0, 40);
  if (order.tags.includes(clean)) return order;
  const updated = await db.order.update({ where: { id: orderId }, data: { tags: { push: clean } } });
  await addEvent(ctx.storeId, orderId, "tagged", `Tagged “${clean}”`, { actorType: ctx.actor.type, actorName: ctx.actor.name });
  await audit(ctx, { action: "order.tag", resourceType: "order", resourceId: orderId, resourceLabel: order.name, newValue: { tag: clean } });
  try {
    await (await getCommerceProvider(ctx.storeId)).addOrderTags(order.externalId, [clean]);
  } catch {
    // tag stays local; Shopify sync retried on next update
  }
  return updated;
}

export async function addOrderNote(ctx: ServiceContext, orderId: string, note: string) {
  const order = await db.order.findFirst({ where: { id: orderId, storeId: ctx.storeId } });
  if (!order) throw notFound("Order");
  await addEvent(ctx.storeId, orderId, "note", "Note added", { description: note.slice(0, 1000), actorType: ctx.actor.type, actorId: ctx.actor.id, actorName: ctx.actor.name });
  await audit(ctx, { action: "order.note", resourceType: "order", resourceId: orderId, resourceLabel: order.name, newValue: { note } });
}

/**
 * Records a refund. Refunds are ALWAYS approval-gated when initiated by AI
 * (see tools); the Shopify refund itself is issued from Shopify admin or via
 * the refundCreate mutation once payment gateways are configured.
 */
export async function refundOrder(ctx: ServiceContext, orderId: string, amount: number, reason: string) {
  const order = await db.order.findFirst({ where: { id: orderId, storeId: ctx.storeId } });
  if (!order) throw notFound("Order");
  if (amount <= 0 || amount > order.total) throw badRequest("Refund amount must be between 0 and the order total");
  const full = amount >= order.total;
  const updated = await db.order.update({ where: { id: orderId }, data: { paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
  const store = await getStore(ctx.storeId);
  await addEvent(ctx.storeId, orderId, "refunded", `${full ? "Refunded" : "Partially refunded"} ${formatMoney(amount, { currency: store.currency, locale: store.locale })}`, {
    description: reason,
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
  });
  await audit(ctx, {
    action: "order.refund",
    resourceType: "order",
    resourceId: orderId,
    resourceLabel: order.name,
    oldValue: { paymentStatus: order.paymentStatus },
    newValue: { paymentStatus: updated.paymentStatus, amount },
    reason,
  });
  return updated;
}

export async function findOrderByReference(storeId: string, ref: string) {
  const digits = ref.replace(/\D/g, "");
  return db.order.findFirst({
    where: { storeId, OR: [{ id: ref }, { name: ref.startsWith("#") ? ref : `#${ref}` }, ...(digits ? [{ orderNumber: Number(digits) }] : [])] },
    include: { items: true, shipments: { orderBy: { createdAt: "desc" }, take: 1 }, customer: { select: { id: true, name: true, totalOrders: true } } },
  });
}

export { addEvent as addOrderEvent };
