import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";
import { orderSearchWhere } from "./order.service";

export type SearchResult = { id: string; type: "order" | "customer" | "product" | "conversation" | "campaign" | "automation" | "insight"; title: string; subtitle: string; href: string };

/** Global ⌘K search across entities the user can see. Each group is capped for speed. */
export async function globalSearch(storeId: string, role: Role, query: string, currency: string, locale: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const money = (n: number) => formatMoney(n, { currency, locale });
  const take = 5;
  const tasks: Promise<SearchResult[]>[] = [];

  if (can(role, "orders.view")) {
    tasks.push(
      db.order
        .findMany({ where: { storeId, ...orderSearchWhere(q) }, take, orderBy: { placedAt: "desc" } })
        .then((rows) => rows.map((o) => ({ id: o.id, type: "order" as const, title: `Order ${o.name}`, subtitle: `${o.customerName} · ${money(o.total)} · ${o.status.replace(/_/g, " ").toLowerCase()}`, href: `/orders/${o.id}` }))),
    );
  }
  if (can(role, "customers.view")) {
    tasks.push(
      db.customer
        .findMany({ where: { storeId, deletedAt: null, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || "__none__" } }] }, take, orderBy: { totalSpent: "desc" } })
        .then((rows) => rows.map((c) => ({ id: c.id, type: "customer" as const, title: c.name, subtitle: `${c.totalOrders} orders · ${money(c.totalSpent)}${c.city ? ` · ${c.city}` : ""}`, href: `/customers/${c.id}` }))),
    );
  }
  if (can(role, "products.view")) {
    tasks.push(
      db.product
        .findMany({ where: { storeId, deletedAt: null, OR: [{ title: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } }, { category: { name: { contains: q, mode: "insensitive" } } }] }, take, include: { category: true } })
        .then((rows) => rows.map((p) => ({ id: p.id, type: "product" as const, title: p.title, subtitle: `${p.category?.name ?? "Product"} · ${money(p.price)} · ${p.totalInventory} in stock`, href: `/products/${p.id}` }))),
    );
  }
  if (can(role, "conversations.view")) {
    tasks.push(
      db.conversation
        .findMany({ where: { storeId, OR: [{ contactName: { contains: q, mode: "insensitive" } }, { lastMessagePreview: { contains: q, mode: "insensitive" } }] }, take, orderBy: { lastMessageAt: "desc" } })
        .then((rows) => rows.map((c) => ({ id: c.id, type: "conversation" as const, title: c.contactName, subtitle: `${c.channel.toLowerCase()} · ${c.lastMessagePreview ?? ""}`.slice(0, 90), href: `/conversations?c=${c.id}` }))),
    );
  }
  if (can(role, "ads.view")) {
    tasks.push(
      db.campaign
        .findMany({ where: { storeId, name: { contains: q, mode: "insensitive" } }, take })
        .then((rows) => rows.map((c) => ({ id: c.id, type: "campaign" as const, title: c.name, subtitle: `Meta campaign · ${c.status.toLowerCase()}`, href: `/ads/campaigns/${c.id}` }))),
    );
  }
  if (can(role, "automations.view")) {
    tasks.push(
      db.automation
        .findMany({ where: { storeId, deletedAt: null, name: { contains: q, mode: "insensitive" } }, take })
        .then((rows) => rows.map((a) => ({ id: a.id, type: "automation" as const, title: a.name, subtitle: `Automation · ${a.status.toLowerCase()}`, href: `/automations/${a.id}` }))),
    );
  }
  tasks.push(
    db.aIInsight
      .findMany({ where: { storeId, dismissedAt: null, OR: [{ headline: { contains: q, mode: "insensitive" } }, { whatHappened: { contains: q, mode: "insensitive" } }] }, take: 3, orderBy: { generatedAt: "desc" } })
      .then((rows) => rows.map((i) => ({ id: i.id, type: "insight" as const, title: `${i.title}: ${i.headline}`, subtitle: i.whatHappened, href: i.actionHref ?? "/dashboard" }))),
  );
  return (await Promise.all(tasks)).flat();
}
