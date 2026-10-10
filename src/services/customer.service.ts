import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getAIProvider } from "@/lib/ai/factory";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { daysBetween } from "@/lib/dates";
import { notFound } from "@/lib/errors";
import { publishEvent } from "@/lib/events/bus";
import { formatMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import type { ServiceContext } from "@/lib/service-context";
import { paginate, paginationSchema, sortDir } from "@/schemas/common";
import { SEGMENT_PRIORITY } from "./segment.service";
import { getStore } from "./store.service";

export const customerListQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  segment: z.string().max(50).optional(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  sort: z.enum(["name", "totalOrders", "totalSpent", "avgOrderValue", "lastOrderAt", "createdAt"]).default("lastOrderAt"),
  dir: sortDir,
});
export type CustomerListQuery = z.infer<typeof customerListQuery>;

export async function listCustomers(storeId: string, q: CustomerListQuery) {
  const where: Prisma.CustomerWhereInput = {
    storeId,
    deletedAt: null,
    ...(q.risk ? { riskLevel: q.risk } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.segment ? { segments: { some: { segment: { key: q.segment } } } } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: "insensitive" } },
            { email: { contains: q.q, mode: "insensitive" } },
            { phone: { contains: q.q.replace(/\D/g, "") || q.q } },
            { city: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      // `nulls` is only valid on nullable columns (Prisma rejects it on Int/String fields).
      orderBy: q.sort === "lastOrderAt" ? { lastOrderAt: { sort: q.dir, nulls: "last" } } : [{ [q.sort]: q.dir }, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { segments: { include: { segment: { select: { key: true, name: true, color: true } } } } },
    }),
    db.customer.count({ where }),
  ]);
  const items = rows.map(({ segments, ...c }) => {
    const keys = segments.map((s) => s.segment);
    const primary = SEGMENT_PRIORITY.map((k) => keys.find((s) => s.key === k)).find(Boolean) ?? keys[0] ?? null;
    return { ...c, primarySegment: primary, segmentCount: keys.length };
  });
  return paginate(items, total, q.page, q.pageSize);
}

/** Header stats for the CRM list: totals, VIPs, repeat-purchase rate and average lifetime value. */
export async function customerStats(storeId: string) {
  const where: Prisma.CustomerWhereInput = { storeId, deletedAt: null };
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [total, buyers, repeat, agg, vip, newThisMonth] = await Promise.all([
    db.customer.count({ where }),
    db.customer.count({ where: { ...where, totalOrders: { gte: 1 } } }),
    db.customer.count({ where: { ...where, totalOrders: { gte: 2 } } }),
    db.customer.aggregate({ where: { ...where, totalOrders: { gte: 1 } }, _avg: { totalSpent: true } }),
    db.customerSegmentMember.count({ where: { segment: { storeId, key: "vip" }, customer: { deletedAt: null } } }),
    db.customer.count({ where: { ...where, firstOrderAt: { gte: since } } }),
  ]);
  return {
    total,
    buyers,
    vip,
    newThisMonth,
    repeatRate: buyers ? (repeat / buyers) * 100 : 0,
    avgLtv: Math.round(agg._avg.totalSpent ?? 0),
  };
}

export async function getCustomerProfile(storeId: string, id: string) {
  const customer = await db.customer.findFirst({
    where: { id, storeId, deletedAt: null },
    include: {
      segments: { include: { segment: true } },
      orders: { orderBy: { placedAt: "desc" }, take: 25, include: { items: true } },
      conversations: { orderBy: { lastMessageAt: "desc" }, take: 5, include: { messages: { orderBy: { createdAt: "desc" }, take: 3 } } },
      tickets: { orderBy: { createdAt: "desc" }, take: 10 },
      events: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
  if (!customer) throw notFound("Customer");

  // Products purchased, aggregated
  const products = new Map<string, { productId: string | null; title: string; imageUrl: string | null; quantity: number; total: number }>();
  for (const o of customer.orders) {
    if (o.status === "CANCELLED") continue;
    for (const it of o.items) {
      const key = it.productId ?? it.title;
      const p = products.get(key) ?? { productId: it.productId, title: it.title, imageUrl: it.imageUrl, quantity: 0, total: 0 };
      p.quantity += it.quantity;
      p.total += it.total;
      products.set(key, p);
    }
  }
  return {
    ...customer,
    productsPurchased: [...products.values()].sort((a, b) => b.quantity - a.quantity),
    returns: customer.orders.filter((o) => o.status === "RETURNED"),
  };
}

/** Recomputes denormalized metrics from the customer's orders. */
export async function recomputeCustomerMetrics(customerId: string) {
  const orders = await db.order.findMany({
    where: { customerId },
    select: { total: true, status: true, placedAt: true, city: true },
    orderBy: { placedAt: "asc" },
  });
  const valid = orders.filter((o) => o.status !== "CANCELLED");
  const totalSpent = valid.filter((o) => o.status !== "RETURNED").reduce((s, o) => s + o.total, 0);
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const cancelled = orders.filter((o) => o.status === "CANCELLED").length;
  const returned = orders.filter((o) => o.status === "RETURNED").length;
  const counted = valid.length;
  const riskScore = Math.min(100, cancelled * 25 + returned * 15 + (delivered === 0 && orders.length > 0 ? 15 : 0));
  await db.customer.update({
    where: { id: customerId },
    data: {
      totalOrders: orders.length,
      totalSpent,
      avgOrderValue: counted ? Math.round(totalSpent / counted) : 0,
      deliveredCount: delivered,
      cancelledCount: cancelled,
      returnedCount: returned,
      firstOrderAt: orders[0]?.placedAt ?? null,
      lastOrderAt: orders[orders.length - 1]?.placedAt ?? null,
      riskScore,
      riskLevel: riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW",
    },
  });
}

export type CustomerIdentity = {
  externalId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: Record<string, unknown> | null;
};

/** Matches by external id, then phone, then email; creates when no match. */
export async function findOrCreateCustomer(storeId: string, input: CustomerIdentity) {
  const phone = normalizePhone(input.phone);
  const email = input.email?.toLowerCase().trim() || null;
  const existing = await db.customer.findFirst({
    where: {
      storeId,
      deletedAt: null,
      OR: [
        ...(input.externalId ? [{ externalId: input.externalId }] : []),
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
  });
  if (existing) {
    return db.customer.update({
      where: { id: existing.id },
      data: {
        externalId: existing.externalId ?? input.externalId ?? null,
        email: existing.email ?? email,
        phone: existing.phone ?? phone,
        city: input.city ?? existing.city,
        address: (input.address ?? existing.address ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
  const created = await db.customer.create({
    data: {
      storeId,
      externalId: input.externalId ?? null,
      name: input.name,
      email,
      phone,
      city: input.city ?? null,
      address: (input.address ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  await publishEvent(storeId, "CUSTOMER_CREATED", {
    title: `New customer ${created.name}`,
    tone: "info",
    href: `/customers/${created.id}`,
    payload: { customerId: created.id },
  });
  return created;
}

export const customerUpdateSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  acceptsMarketing: z.boolean().optional(),
});

export async function updateCustomer(ctx: ServiceContext, id: string, input: z.infer<typeof customerUpdateSchema>) {
  const before = await db.customer.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!before) throw notFound("Customer");
  const after = await db.customer.update({ where: { id }, data: input });
  await audit(ctx, {
    action: "customer.update",
    resourceType: "customer",
    resourceId: id,
    resourceLabel: after.name,
    oldValue: { notes: before.notes, tags: before.tags, status: before.status, acceptsMarketing: before.acceptsMarketing },
    newValue: input,
  });
  return after;
}

const summarySchema = z.object({
  headline: z.string(),
  bullets: z.array(z.string()).max(5),
  likelyInterestedIn: z.array(z.string()).max(4),
  nextBestAction: z.string(),
  churnRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
export type CustomerSummary = z.infer<typeof summarySchema> & { generatedAt: string };

/** AI customer insight, grounded in the customer's actual orders. Rule-based fallback when no LLM. */
export async function generateCustomerSummary(storeId: string, customerId: string): Promise<CustomerSummary> {
  const store = await getStore(storeId);
  const profile = await getCustomerProfile(storeId, customerId);
  const fmt = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const days = profile.lastOrderAt ? daysBetween(profile.lastOrderAt, new Date()) : null;

  const categoryCounts = new Map<string, number>();
  const productIds = profile.productsPurchased.map((p) => p.productId).filter(Boolean) as string[];
  const products = await db.product.findMany({ where: { id: { in: productIds } }, include: { category: true } });
  for (const p of profile.productsPurchased) {
    const cat = products.find((x) => x.id === p.productId)?.category?.name ?? "Other";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + p.quantity);
  }
  const topCats = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const allCats = await db.productCategory.findMany({ where: { storeId }, orderBy: { position: "asc" } });
  const notBought = allCats.map((c) => c.name).filter((c) => !categoryCounts.has(c));

  const facts = {
    name: profile.name,
    totalOrders: profile.totalOrders,
    totalSpent: fmt(profile.totalSpent),
    averageOrder: fmt(profile.avgOrderValue),
    daysSinceLastOrder: days,
    returned: profile.returnedCount,
    cancelled: profile.cancelledCount,
    topCategories: topCats.slice(0, 3),
    topProducts: profile.productsPurchased.slice(0, 5).map((p) => `${p.title} ×${p.quantity}`),
    categoriesNotYetBought: notBought.slice(0, 4),
  };

  const fallback = (): z.infer<typeof summarySchema> => {
    const churn = days === null ? "MEDIUM" : days > 60 ? "HIGH" : days > 30 ? "MEDIUM" : "LOW";
    const freq = profile.totalOrders >= 5 ? "Frequent buyer" : profile.totalOrders >= 2 ? "Repeat buyer" : "New buyer";
    return {
      headline: `${freq}${topCats.length ? ` of ${topCats.slice(0, 2).join(" and ").toLowerCase()}` : ""}.`,
      bullets: [
        `${profile.totalOrders} orders · ${facts.totalSpent} lifetime spend · ${facts.averageOrder} average order`,
        days === null ? "No purchases yet" : days < 1 ? "Purchased within the last day" : `Last purchase ${days} day${days === 1 ? "" : "s"} ago`,
        ...(profile.returnedCount ? [`${profile.returnedCount} returned order(s) — check sizing preferences`] : []),
      ],
      likelyInterestedIn: [...(store.settings && notBought.includes("Winter Collection") ? ["Winter Collection"] : []), ...notBought].slice(0, 3),
      nextBestAction:
        churn === "HIGH"
          ? "Send a personalised win-back offer on WhatsApp."
          : profile.totalOrders >= 3
            ? "Invite to early access of the next collection."
            : "Recommend complementary items to their last purchase.",
      churnRisk: churn,
    };
  };

  const ai = await getAIProvider(storeId);
  const { data } = await ai.generateObject({
    system:
      "You are a CRM analyst for a fashion ecommerce store. Write a concise customer insight using ONLY the facts provided. Never invent numbers.",
    prompt: `Customer facts (JSON):\n${JSON.stringify(facts)}`,
    schema: summarySchema,
    schemaName: "customer_summary",
    fallback,
  });
  const summary: CustomerSummary = { ...data, generatedAt: new Date().toISOString() };
  await db.customer.update({ where: { id: customerId }, data: { aiSummary: summary as unknown as Prisma.InputJsonValue } });
  return summary;
}

/** Emits CUSTOMER_INACTIVE for customers that crossed the inactivity threshold today. */
export async function detectInactiveCustomers(storeId: string, thresholdDays = 60) {
  const now = Date.now();
  const crossed = await db.customer.findMany({
    where: {
      storeId,
      deletedAt: null,
      lastOrderAt: { lt: new Date(now - thresholdDays * 86_400_000), gte: new Date(now - (thresholdDays + 1) * 86_400_000) },
    },
    select: { id: true, name: true },
    take: 500,
  });
  for (const c of crossed) {
    await publishEvent(storeId, "CUSTOMER_INACTIVE", {
      title: `${c.name} has been inactive for ${thresholdDays} days`,
      tone: "warning",
      href: `/customers/${c.id}`,
      payload: { customerId: c.id },
    });
  }
  return crossed.length;
}
