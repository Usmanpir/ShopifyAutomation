import { z } from "zod";
import { db } from "@/lib/db";
import { daysBetween } from "@/lib/dates";
import { notFound } from "@/lib/errors";
import { formatMoney, percentChange, toMinor } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import type { ServiceContext } from "@/lib/service-context";
import { dashboardKpis, revenueDrivers, topProductsWithGrowth } from "@/services/analytics.service";
import { searchCatalog, searchKnowledge } from "@/services/catalog-search.service";
import { inventoryOverview } from "@/services/inventory.service";
import { createMarketingCampaign, sendMarketingCampaign } from "@/services/marketing.service";
import { sendWhatsApp } from "@/services/messaging.service";
import { adsOverview, campaignDetail, changeCampaignBudget, setCampaignStatus } from "@/services/meta.service";
import { notify } from "@/services/notification.service";
import {
  addOrderTag,
  findOrderByReference,
  listOrders,
  ORDER_TABS,
  refundOrder,
  requestOrderConfirmation,
  transitionOrder,
} from "@/services/order.service";
import { changeVariantPrice } from "@/services/product.service";
import { createShipment } from "@/services/shipment.service";
import { getStore } from "@/services/store.service";
import { createTicket } from "@/services/ticket.service";
import { defineTool, type ToolDefinition } from "./types";

const rangeEnum = z.enum(["today", "7d", "30d", "90d"]).default("7d");

async function money(ctx: ServiceContext) {
  const s = await getStore(ctx.storeId);
  return (n: number) => formatMoney(n, { currency: s.currency, locale: s.locale });
}

// ───────────────────────── Read tools ─────────────────────────

const getOrder = defineTool({
  name: "getOrder",
  description: "Get one order by order number (e.g. #10452 or 10452) or id: status, items, totals, risk, shipment.",
  input: z.object({ reference: z.string().min(1).describe("Order number like #10452, or order id") }),
  permission: "orders.view",
  kind: "read",
  handler: async (ctx, { reference }) => {
    const o = await findOrderByReference(ctx.storeId, reference);
    if (!o) throw notFound(`Order ${reference}`);
    const m = await money(ctx);
    return {
      id: o.id,
      name: o.name,
      customer: o.customerName,
      status: o.status,
      confirmation: o.confirmationStatus,
      payment: o.paymentMethod,
      total: m(o.total),
      risk: `${o.riskLevel} (${o.riskScore}/100)`,
      city: o.city,
      placedAt: o.placedAt.toISOString(),
      items: o.items.map((i) => `${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ""} ×${i.quantity}`),
      shipment: o.shipments[0] ? { courier: o.shipments[0].courier, tracking: o.shipments[0].trackingNumber, status: o.shipments[0].status } : null,
      link: `/orders/${o.id}`,
    };
  },
});

const listOrdersTool = defineTool({
  name: "listOrders",
  description: "List orders filtered by status tab (e.g. pending_confirmation, high_risk, shipped) or search text. Returns up to 20.",
  input: z.object({
    tab: z.enum(ORDER_TABS).default("all"),
    search: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  permission: "orders.view",
  kind: "read",
  handler: async (ctx, input) => {
    const res = await listOrders(ctx.storeId, { tab: input.tab, q: input.search, page: 1, pageSize: input.limit, sort: "placedAt", dir: "desc" });
    const m = await money(ctx);
    return {
      total: res.total,
      orders: res.items.map((o) => ({ id: o.id, name: o.name, customer: o.customerName, status: o.status, total: m(o.total), payment: o.paymentMethod, risk: o.riskLevel, placedAt: o.placedAt.toISOString() })),
    };
  },
});

const getOrderStatusByPhone = defineTool({
  name: "getOrderStatusByPhone",
  description: "Latest order status and tracking for a customer's phone number.",
  input: z.object({ phone: z.string().min(6) }),
  permission: "orders.view",
  kind: "read",
  handler: async (ctx, { phone }) => {
    const p = normalizePhone(phone);
    const o = await db.order.findFirst({ where: { storeId: ctx.storeId, phone: p }, orderBy: { placedAt: "desc" }, include: { shipments: { take: 1, orderBy: { createdAt: "desc" } } } });
    if (!o) return { found: false };
    return { found: true, name: o.name, status: o.status, tracking: o.shipments[0]?.trackingNumber ?? null, courierStatus: o.shipments[0]?.status ?? null };
  },
});

const getCustomer = defineTool({
  name: "getCustomer",
  description: "Get a customer profile by id, phone or exact name: orders, spend, last purchase, segments.",
  input: z.object({ reference: z.string().min(2) }),
  permission: "customers.view",
  kind: "read",
  handler: async (ctx, { reference }) => {
    const phone = normalizePhone(reference);
    const c = await db.customer.findFirst({
      where: {
        storeId: ctx.storeId,
        deletedAt: null,
        OR: [{ id: reference }, ...(phone ? [{ phone }] : []), { name: { equals: reference, mode: "insensitive" } }, { name: { contains: reference, mode: "insensitive" } }],
      },
      include: { segments: { include: { segment: { select: { name: true } } } } },
    });
    if (!c) throw notFound(`Customer ${reference}`);
    const m = await money(ctx);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      city: c.city,
      totalOrders: c.totalOrders,
      totalSpent: m(c.totalSpent),
      averageOrder: m(c.avgOrderValue),
      lastPurchase: c.lastOrderAt ? `${daysBetween(c.lastOrderAt, new Date())} days ago` : "never",
      returns: c.returnedCount,
      cancellations: c.cancelledCount,
      risk: c.riskLevel,
      segments: c.segments.map((s) => s.segment.name),
      link: `/customers/${c.id}`,
    };
  },
});

const searchCustomers = defineTool({
  name: "searchCustomers",
  description: "Search customers by name, phone, email or city.",
  input: z.object({ query: z.string().min(1).max(100), limit: z.number().int().min(1).max(20).default(10) }),
  permission: "customers.view",
  kind: "read",
  handler: async (ctx, { query, limit }) => {
    const rows = await db.customer.findMany({
      where: { storeId: ctx.storeId, deletedAt: null, OR: [{ name: { contains: query, mode: "insensitive" } }, { city: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { phone: { contains: query.replace(/\D/g, "") || "__" } }] },
      take: limit,
      orderBy: { totalSpent: "desc" },
    });
    const m = await money(ctx);
    return rows.map((c) => ({ id: c.id, name: c.name, city: c.city, orders: c.totalOrders, spent: m(c.totalSpent) }));
  },
});

const searchProducts = defineTool({
  name: "searchProducts",
  description: "Find products by description (e.g. 'black shirt') with LIVE stock per size/color and prices. Always use this before answering availability or price questions.",
  input: z.object({ query: z.string().min(2).max(100), size: z.string().max(10).nullish(), color: z.string().max(20).nullish() }),
  permission: "products.view",
  kind: "read",
  handler: async (ctx, input) => {
    const matches = await searchCatalog(ctx.storeId, { query: input.query, size: input.size, color: input.color, limit: 5 });
    const m = await money(ctx);
    return matches.map((p) => ({
      id: p.productId,
      title: p.title,
      price: m(p.price),
      totalStock: p.totalStock,
      variants: p.variants.map((v) => ({ title: v.title, stock: v.stock })),
      link: `/products/${p.productId}`,
    }));
  },
});

const getInventory = defineTool({
  name: "getInventory",
  description: "Inventory coverage for products matching a query: stock, average daily sales, days of coverage.",
  input: z.object({ query: z.string().min(2).max(100) }),
  permission: "inventory.view",
  kind: "read",
  handler: async (ctx, { query }) => {
    const ov = await inventoryOverview(ctx.storeId, { q: query.split(" ").slice(-1)[0] });
    const words = query.toLowerCase().split(/\s+/);
    return ov.rows
      .filter((r) => words.every((w) => r.title.toLowerCase().includes(w.replace(/s$/, "")) || r.variants.some((v) => v.color?.toLowerCase() === w)))
      .slice(0, 5)
      .map((r) => ({
        product: r.title,
        stock: r.stock,
        averageDailySales: r.coverage.averageDailySales,
        coverageDays: r.coverage.coverageDays,
        status: r.coverage.status,
        variants: r.variants.map((v) => `${v.title}: ${v.stock}`),
      }));
  },
});

const getLowStock = defineTool({
  name: "getLowStock",
  description: "Variants that are low or out of stock, ordered by urgency (days of coverage).",
  input: z.object({ limit: z.number().int().min(1).max(30).default(10) }),
  permission: "inventory.view",
  kind: "read",
  handler: async (ctx, { limit }) => {
    const ov = await inventoryOverview(ctx.storeId);
    return ov.rows
      .flatMap((r) => r.variants.filter((v) => v.stock <= v.threshold).map((v) => ({ product: r.title, variant: v.title, stock: v.stock, coverageDays: v.coverage.coverageDays, avgDailySales: v.coverage.averageDailySales, link: `/products/${r.id}` })))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, limit);
  },
});

const getSalesSummary = defineTool({
  name: "getSalesSummary",
  description: "Store KPIs for a period (revenue, orders, confirmed, conversion, ad spend, ROAS, profit, returns) with % change vs the previous period.",
  input: z.object({ range: rangeEnum }),
  permission: "analytics.view",
  kind: "read",
  handler: async (ctx, { range }) => {
    const { kpis, range: r } = await dashboardKpis(ctx.storeId, { range });
    const m = await money(ctx);
    return {
      period: r.label,
      comparison: r.comparisonLabel,
      metrics: kpis.map((k) => ({
        metric: k.label,
        value: k.format === "money" ? m(k.value) : k.format === "percent" ? `${k.value.toFixed(2)}%` : k.format === "ratio" ? `${k.value.toFixed(2)}×` : k.value,
        change: `${k.change >= 0 ? "+" : ""}${k.change.toFixed(1)}%`,
      })),
    };
  },
});

const compareRevenue = defineTool({
  name: "compareRevenue",
  description: "Explain revenue for a specific day vs the day before (daysAgo=1 is yesterday): drivers by product, city, orders, AOV, cancellations, ad spend, traffic.",
  input: z.object({ daysAgo: z.number().int().min(0).max(60).default(1) }),
  permission: "analytics.view",
  kind: "read",
  handler: async (ctx, { daysAgo }) => {
    const d = await revenueDrivers(ctx.storeId, daysAgo);
    const m = await money(ctx);
    return {
      date: d.date,
      revenue: m(d.revenue),
      previousDayRevenue: m(d.previousRevenue),
      sameDayLastWeek: m(d.sameDayLastWeek),
      change: `${d.change.toFixed(1)}%`,
      orders: `${d.orders} vs ${d.previousOrders}`,
      averageOrderValue: `${m(d.aov)} vs ${m(d.previousAov)}`,
      cancellations: `${d.cancelled} vs ${d.previousCancelled}`,
      adSpend: `${m(d.adSpend)} vs ${m(d.previousAdSpend)}`,
      sessions: `${d.sessions} vs ${d.previousSessions}`,
      productDrops: d.biggestProductDrops.map((p) => `${p.title}: ${m(p.revenue)} vs ${m(p.previous)}`),
      productGains: d.biggestProductGains.map((p) => `${p.title}: ${m(p.revenue)} vs ${m(p.previous)}`),
      cityDrops: d.biggestCityDrops.map((c) => `${c.city}: ${m(c.revenue)} vs ${m(c.previous)}`),
    };
  },
});

const getTopProducts = defineTool({
  name: "getTopProducts",
  description: "Best-selling products for a period by revenue, with units and growth vs the previous period.",
  input: z.object({ range: rangeEnum, limit: z.number().int().min(1).max(20).default(5) }),
  permission: "analytics.view",
  kind: "read",
  handler: async (ctx, { range, limit }) => {
    const rows = await topProductsWithGrowth(ctx.storeId, { range }, limit);
    const m = await money(ctx);
    return rows.map((r) => ({ product: r.title, units: r.units, revenue: m(r.revenue), growth: `${r.growth >= 0 ? "+" : ""}${r.growth.toFixed(1)}%`, link: `/products/${r.id}` }));
  },
});

const getInactiveCustomers = defineTool({
  name: "getInactiveCustomers",
  description: "Customers who haven't purchased in N days, highest lifetime value first.",
  input: z.object({ days: z.number().int().min(7).max(365).default(60), limit: z.number().int().min(1).max(50).default(15) }),
  permission: "customers.view",
  kind: "read",
  handler: async (ctx, { days, limit }) => {
    const where = { storeId: ctx.storeId, deletedAt: null, lastOrderAt: { lt: new Date(Date.now() - days * 86_400_000) } };
    const [count, rows] = await Promise.all([db.customer.count({ where }), db.customer.findMany({ where, orderBy: { totalSpent: "desc" }, take: limit })]);
    const m = await money(ctx);
    return {
      total: count,
      customers: rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, lastPurchase: `${daysBetween(c.lastOrderAt!, new Date())} days ago`, orders: c.totalOrders, spent: m(c.totalSpent) })),
    };
  },
});

const getAdPerformance = defineTool({
  name: "getAdPerformance",
  description: "Meta ads performance for a period: spend, revenue, purchases, ROAS, CPA, CTR, plus per-campaign breakdown.",
  input: z.object({ range: rangeEnum }),
  permission: "ads.view",
  kind: "read",
  handler: async (ctx, { range }) => {
    const ov = await adsOverview(ctx.storeId, { range });
    const m = await money(ctx);
    const t = ov.totals;
    return {
      period: ov.range.label,
      spend: m(t.spend),
      revenue: m(t.revenue),
      purchases: t.purchases,
      roas: `${t.roas.toFixed(2)}×`,
      cpa: m(t.cpa),
      ctr: `${t.ctr.toFixed(2)}%`,
      spendChange: `${ov.changes.spend.toFixed(1)}%`,
      campaigns: ov.campaigns.filter((c) => c.metrics.spend > 0).map((c) => ({ id: c.id, name: c.name, status: c.status, spend: m(c.metrics.spend), revenue: m(c.metrics.revenue), roas: `${c.metrics.roas.toFixed(2)}×`, purchases: c.metrics.purchases })),
    };
  },
});

const getCampaign = defineTool({
  name: "getCampaign",
  description: "Details for one Meta campaign by id or name: budget, 7-day metrics, ad sets and best ads.",
  input: z.object({ reference: z.string().min(2) }),
  permission: "ads.view",
  kind: "read",
  handler: async (ctx, { reference }) => {
    const c = await db.campaign.findFirst({ where: { storeId: ctx.storeId, OR: [{ id: reference }, { name: { contains: reference, mode: "insensitive" } }] } });
    if (!c) throw notFound(`Campaign ${reference}`);
    const d = await campaignDetail(ctx.storeId, c.id, { range: "7d" });
    const m = await money(ctx);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      dailyBudget: c.dailyBudget ? m(c.dailyBudget) : null,
      spend: m(d.totals.spend),
      revenue: m(d.totals.revenue),
      roas: `${d.totals.roas.toFixed(2)}×`,
      purchases: d.totals.purchases,
      topAds: d.ads.sort((a, b) => b.metrics.revenue - a.metrics.revenue).slice(0, 3).map((a) => ({ name: a.name, type: a.creativeType, roas: `${a.metrics.roas.toFixed(2)}×` })),
      link: `/ads/campaigns/${c.id}`,
    };
  },
});

const searchKnowledgeTool = defineTool({
  name: "searchKnowledge",
  description: "Search store policies & FAQs (shipping, exchange, returns, sizing).",
  input: z.object({ query: z.string().min(2).max(200) }),
  permission: "conversations.view",
  kind: "read",
  handler: async (ctx, { query }) => (await searchKnowledge(ctx.storeId, query)).map((a) => ({ title: a.title, content: a.content })),
});

// ───────────────────────── Write tools ─────────────────────────

const sendWhatsAppMessage = defineTool({
  name: "sendWhatsAppMessage",
  description: "Send a WhatsApp message to one customer.",
  input: z.object({ customerId: z.string().optional(), phone: z.string().optional(), text: z.string().min(1).max(1000) }),
  permission: "conversations.reply",
  kind: "write",
  agent: "WHATSAPP",
  handler: async (ctx, input) => {
    const c = input.customerId ? await db.customer.findFirst({ where: { id: input.customerId, storeId: ctx.storeId } }) : null;
    const { message } = await sendWhatsApp({
      storeId: ctx.storeId,
      phone: c?.phone ?? input.phone,
      name: c?.name ?? input.phone ?? "Customer",
      customerId: c?.id,
      sender: ctx.actor.type === "AI" ? "AI" : ctx.actor.type === "USER" ? "AGENT" : "SYSTEM",
      senderUserId: ctx.actor.type === "USER" ? ctx.actor.id : null,
      text: input.text,
    });
    return { sent: true, messageId: message.id };
  },
});

const requestOrderConfirmationTool = defineTool({
  name: "requestOrderConfirmation",
  description: "Send the WhatsApp COD confirmation request for an order.",
  input: z.object({ orderId: z.string().min(1) }),
  permission: "orders.update",
  kind: "write",
  agent: "ORDER",
  handler: async (ctx, { orderId }) => {
    const o = await requestOrderConfirmation(ctx, orderId);
    return { orderId: o.id, status: o.status };
  },
});

const updateOrderStatus = defineTool({
  name: "updateOrderStatus",
  description: "Move an order to a new status: confirm, process, ship, deliver, cancel or return. Cancellation by AI always needs human approval.",
  input: z.object({ orderId: z.string().min(1), action: z.enum(["confirm", "process", "ship", "deliver", "cancel", "return"]), reason: z.string().max(300).optional() }),
  permission: "orders.update",
  kind: "write",
  agent: "ORDER",
  requiresApproval: async (input, ctx) => {
    if (input.action !== "cancel" || ctx.actor.type === "USER") return null;
    const o = await db.order.findFirst({ where: { id: input.orderId, storeId: ctx.storeId } });
    return {
      title: `Cancel order ${o?.name ?? input.orderId}`,
      summary: input.reason ?? "AI suggests cancelling this order.",
      reasoning: "Cancellations are never automatic — a human confirms first.",
      evidence: o ? [{ label: "Customer", value: o.customerName }, { label: "Risk", value: `${o.riskLevel} (${o.riskScore}/100)` }] : [],
      riskLevel: "HIGH",
      relatedType: "order",
      relatedId: input.orderId,
    };
  },
  handler: async (ctx, input) => {
    const o = await transitionOrder(ctx, input.orderId, input.action, input.reason ?? (input.action === "cancel" ? "Cancelled after review" : undefined));
    return { orderId: o.id, status: o.status };
  },
});

const bulkCancelOrders = defineTool({
  name: "bulkCancelOrders",
  description: "Cancel several orders at once. Always requires approval.",
  input: z.object({ orderIds: z.array(z.string()).min(1).max(100), reason: z.string().min(3).max(300) }),
  permission: "orders.cancel",
  kind: "sensitive",
  agent: "ORDER",
  describeApproval: async (input) => ({
    title: `Bulk cancel ${input.orderIds.length} orders`,
    summary: input.reason,
    reasoning: "Bulk cancellation is irreversible and affects multiple customers.",
    evidence: [{ label: "Orders", value: String(input.orderIds.length) }],
    riskLevel: "HIGH",
  }),
  handler: async (ctx, input) => {
    const results = [];
    for (const id of input.orderIds) {
      try {
        await transitionOrder(ctx, id, "cancel", input.reason);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: (err as Error).message });
      }
    }
    return results;
  },
});

const refundOrderTool = defineTool({
  name: "refundOrder",
  description: "Refund all or part of an order. Always requires approval.",
  input: z.object({ orderId: z.string(), amountMajor: z.number().positive(), reason: z.string().min(3).max(300) }),
  permission: "orders.refund",
  kind: "sensitive",
  agent: "SUPPORT",
  describeApproval: async (input, ctx) => {
    const o = await db.order.findFirst({ where: { id: input.orderId, storeId: ctx.storeId } });
    const m = await money(ctx);
    return {
      title: `Refund ${m(toMinor(input.amountMajor))} on ${o?.name ?? "order"}`,
      summary: input.reason,
      reasoning: "Refunds move money and always need a human decision.",
      evidence: o ? [{ label: "Order total", value: m(o.total) }, { label: "Payment", value: o.paymentMethod }] : [],
      riskLevel: "HIGH",
      relatedType: "order",
      relatedId: input.orderId,
    };
  },
  handler: async (ctx, input) => {
    const o = await refundOrder(ctx, input.orderId, toMinor(input.amountMajor), input.reason);
    return { orderId: o.id, paymentStatus: o.paymentStatus };
  },
});

const addOrderTagTool = defineTool({
  name: "addOrderTag",
  description: "Add a tag to an order.",
  input: z.object({ orderId: z.string(), tag: z.string().min(1).max(40) }),
  permission: "orders.update",
  kind: "write",
  agent: "ORDER",
  handler: async (ctx, { orderId, tag }) => {
    const o = await addOrderTag(ctx, orderId, tag);
    return { orderId: o.id, tags: o.tags };
  },
});

const createShipmentTool = defineTool({
  name: "createShipment",
  description: "Book a shipment for a confirmed order with the configured courier.",
  input: z.object({ orderId: z.string() }),
  permission: "orders.update",
  kind: "write",
  agent: "ORDER",
  handler: async (ctx, { orderId }) => {
    const s = await createShipment(ctx, orderId);
    return { shipmentId: s.id, trackingNumber: s.trackingNumber };
  },
});

const createNotification = defineTool({
  name: "createNotification",
  description: "Notify the store team (owners, admins, managers).",
  input: z.object({ title: z.string().min(3).max(200), body: z.string().max(1000).optional(), severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]).default("INFO"), href: z.string().max(300).optional() }),
  permission: "dashboard.view",
  kind: "write",
  handler: async (ctx, input) => ({
    recipients: await notify(ctx.storeId, { type: "AI", ...input, roles: ["OWNER", "ADMIN", "MANAGER"] }),
  }),
});

const createSupportTicket = defineTool({
  name: "createSupportTicket",
  description: "Open a support ticket.",
  input: z.object({
    subject: z.string().min(3).max(200),
    description: z.string().max(2000).optional(),
    category: z.enum(["EXCHANGE", "RETURN", "DELIVERY", "PRODUCT", "PAYMENT", "OTHER"]).default("OTHER"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    customerId: z.string().optional(),
    orderId: z.string().optional(),
  }),
  permission: "conversations.manage",
  kind: "write",
  agent: "SUPPORT",
  handler: async (ctx, input) => {
    const t = await createTicket(ctx, input);
    return { ticketId: t.id, number: t.number };
  },
});

const changeCampaignBudgetTool = defineTool({
  name: "changeCampaignBudget",
  description: "Change a Meta campaign's daily budget (major units). Changes above the approval threshold need human approval.",
  input: z.object({ campaignId: z.string(), dailyBudget: z.number().int().positive().describe("New daily budget in MINOR units") }),
  permission: "ads.manage",
  kind: "write",
  agent: "ADS",
  requiresApproval: async (input, ctx) => {
    const c = await db.campaign.findFirst({ where: { id: input.campaignId, storeId: ctx.storeId } });
    if (!c) throw notFound("Campaign");
    const store = await getStore(ctx.storeId);
    const change = c.dailyBudget ? Math.abs(percentChange(input.dailyBudget, c.dailyBudget)) : 100;
    if (ctx.actor.type === "USER" || change <= store.settings.approvals.adBudgetChangePercent) return null;
    const m = await money(ctx);
    return {
      title: `Change “${c.name}” budget to ${m(input.dailyBudget)}/day`,
      summary: `A ${change.toFixed(0)}% budget change exceeds the ${store.settings.approvals.adBudgetChangePercent}% auto-approve limit.`,
      reasoning: "Large budget swings can reset Meta's learning phase and spend money quickly.",
      evidence: [{ label: "Current budget", value: c.dailyBudget ? m(c.dailyBudget) : "—" }, { label: "Proposed", value: m(input.dailyBudget) }],
      riskLevel: change > 50 ? "HIGH" : "MEDIUM",
      relatedType: "campaign",
      relatedId: c.id,
    };
  },
  handler: async (ctx, input) => {
    const c = await changeCampaignBudget(ctx, input.campaignId, input.dailyBudget);
    return { campaignId: c.id, dailyBudget: c.dailyBudget };
  },
});

const pauseCampaign = defineTool({
  name: "pauseCampaign",
  description: "Pause a Meta campaign. Requires approval when initiated by AI.",
  input: z.object({ campaignId: z.string() }),
  permission: "ads.manage",
  kind: "write",
  agent: "ADS",
  requiresApproval: async (input, ctx) => {
    if (ctx.actor.type === "USER") return null;
    const c = await db.campaign.findFirst({ where: { id: input.campaignId, storeId: ctx.storeId } });
    return {
      title: `Pause campaign “${c?.name ?? input.campaignId}”`,
      summary: "AI suggests pausing this campaign.",
      reasoning: "Pausing stops all delivery for the campaign.",
      evidence: [],
      riskLevel: "MEDIUM",
      relatedType: "campaign",
      relatedId: input.campaignId,
    };
  },
  handler: async (ctx, { campaignId }) => {
    const c = await setCampaignStatus(ctx, campaignId, "PAUSED");
    return { campaignId: c.id, status: c.status };
  },
});

const sendMarketingCampaignTool = defineTool({
  name: "sendMarketingCampaign",
  description: "Send a WhatsApp broadcast: either an existing campaignId, or a new one to a segment (segmentKey + name + message). Mass messaging needs approval.",
  input: z.object({
    campaignId: z.string().optional(),
    segmentKey: z.string().optional(),
    name: z.string().max(120).optional(),
    message: z.string().max(1000).optional(),
  }),
  permission: "marketing.send",
  kind: "write",
  agent: "MARKETING",
  requiresApproval: async (input, ctx) => {
    if (ctx.actor.type === "USER") return null;
    const store = await getStore(ctx.storeId);
    let audience = 0;
    let label = input.name ?? "campaign";
    if (input.campaignId) {
      const c = await db.marketingCampaign.findFirst({ where: { id: input.campaignId, storeId: ctx.storeId } });
      audience = c?.audienceSize ?? 0;
      label = c?.name ?? label;
    } else if (input.segmentKey) {
      const s = await db.customerSegment.findUnique({ where: { storeId_key: { storeId: ctx.storeId, key: input.segmentKey } } });
      audience = s?.customerCount ?? 0;
    }
    if (audience < store.settings.approvals.massMessageThreshold) return null;
    return {
      title: `Send “${label}” to ${audience} customers`,
      summary: input.message?.slice(0, 200) ?? "WhatsApp broadcast",
      reasoning: `Messaging ${audience} customers exceeds the mass-messaging threshold.`,
      evidence: [{ label: "Audience", value: String(audience) }],
      riskLevel: "MEDIUM",
    };
  },
  handler: async (ctx, input) => {
    let campaignId = input.campaignId;
    if (!campaignId) {
      if (!input.segmentKey || !input.message) throw new Error("segmentKey and message are required for a new campaign");
      const segment = await db.customerSegment.findUnique({ where: { storeId_key: { storeId: ctx.storeId, key: input.segmentKey } } });
      if (!segment) throw notFound("Segment");
      // Approval (when required) already happened at the tool level before this handler ran.
      const created = await createMarketingCampaign(
        ctx,
        { name: input.name ?? "AI campaign", segmentId: segment.id, message: input.message, sendNow: false },
        { preApproved: true },
      );
      campaignId = created.id;
    }
    const sent = await sendMarketingCampaign(ctx, campaignId);
    return { campaignId: sent.id, sent: sent.sentCount };
  },
});

const changeProductPrice = defineTool({
  name: "changeProductPrice",
  description: "Change a variant's price (major units). Requires approval per store settings.",
  input: z.object({ variantId: z.string(), priceMajor: z.number().positive() }),
  permission: "products.update",
  kind: "write",
  agent: "INVENTORY",
  requiresApproval: async (input, ctx) => {
    const store = await getStore(ctx.storeId);
    if (ctx.actor.type === "USER" || !store.settings.approvals.priceChangeRequiresApproval) return null;
    const v = await db.productVariant.findFirst({ where: { id: input.variantId, storeId: ctx.storeId }, include: { product: true } });
    const m = await money(ctx);
    return {
      title: `Change price of ${v?.product.title ?? "variant"} to ${m(toMinor(input.priceMajor))}`,
      summary: v ? `From ${m(v.price)} to ${m(toMinor(input.priceMajor))}` : "Price change",
      reasoning: "Price changes affect margins and customer trust.",
      evidence: v ? [{ label: "Current price", value: m(v.price) }] : [],
      riskLevel: "MEDIUM",
      relatedType: "product",
      relatedId: v?.productId,
    };
  },
  handler: async (ctx, input) => changeVariantPrice(ctx, input.variantId, toMinor(input.priceMajor)),
});

export const TOOLS: ToolDefinition<never>[] = [
  getOrder,
  listOrdersTool,
  getOrderStatusByPhone,
  getCustomer,
  searchCustomers,
  searchProducts,
  getInventory,
  getLowStock,
  getSalesSummary,
  compareRevenue,
  getTopProducts,
  getInactiveCustomers,
  getAdPerformance,
  getCampaign,
  searchKnowledgeTool,
  sendWhatsAppMessage,
  requestOrderConfirmationTool,
  updateOrderStatus,
  bulkCancelOrders,
  refundOrderTool,
  addOrderTagTool,
  createShipmentTool,
  createNotification,
  createSupportTicket,
  changeCampaignBudgetTool,
  pauseCampaign,
  sendMarketingCampaignTool,
  changeProductPrice,
] as unknown as ToolDefinition<never>[];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export const TOOL_NAMES = TOOLS.map((t) => t.name);

export function toolCatalog() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, permission: t.permission, kind: t.kind }));
}
