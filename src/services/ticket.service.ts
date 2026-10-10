import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { ServiceContext } from "@/lib/service-context";
import { notify } from "./notification.service";

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum(["EXCHANGE", "RETURN", "DELIVERY", "PRODUCT", "PAYMENT", "OTHER"]).default("OTHER"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  customerId: z.string().optional(),
  orderId: z.string().optional(),
  conversationId: z.string().optional(),
});

export async function createTicket(ctx: ServiceContext, input: z.infer<typeof ticketCreateSchema>) {
  // Sequential ticket numbers per store; retry on the rare concurrent collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await db.supportTicket.findFirst({ where: { storeId: ctx.storeId }, orderBy: { number: "desc" }, select: { number: true } });
    try {
      const ticket = await db.supportTicket.create({
        data: {
          storeId: ctx.storeId,
          number: (last?.number ?? 1000) + 1,
          subject: input.subject,
          description: input.description ?? null,
          category: input.category,
          priority: input.priority,
          customerId: input.customerId ?? null,
          orderId: input.orderId ?? null,
          conversationId: input.conversationId ?? null,
          createdByType: ctx.actor.type,
        },
      });
      await audit(ctx, { action: "ticket.create", resourceType: "ticket", resourceId: ticket.id, resourceLabel: `#${ticket.number} ${ticket.subject}` });
      if (input.priority === "HIGH" || input.priority === "URGENT") {
        await notify(ctx.storeId, {
          type: "CUSTOMER",
          severity: "WARNING",
          title: `Ticket #${ticket.number}: ${ticket.subject}`,
          body: input.description?.slice(0, 200),
          href: `/conversations?view=tickets&ticket=${ticket.id}`,
          roles: ["OWNER", "ADMIN", "MANAGER", "SUPPORT_AGENT"],
        });
      }
      return ticket;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error("Could not allocate ticket number");
}

export const ticketListQuery = z.object({
  status: z.enum(["open", "resolved", "all"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function listTickets(storeId: string, q: z.infer<typeof ticketListQuery>) {
  return db.supportTicket.findMany({
    where: {
      storeId,
      ...(q.status === "open" ? { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } } : q.status === "resolved" ? { status: { in: ["RESOLVED", "CLOSED"] } } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: q.limit,
    include: {
      customer: { select: { id: true, name: true } },
      order: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
}

/** Counts for the tickets view status tabs. */
export async function ticketCounts(storeId: string) {
  const rows = await db.supportTicket.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } });
  const n = (s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
  return { open: n(["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"]), resolved: n(["RESOLVED", "CLOSED"]), all: n(["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"]) };
}

export const ticketUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function updateTicket(ctx: ServiceContext, id: string, input: z.infer<typeof ticketUpdateSchema>) {
  const before = await db.supportTicket.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!before) throw notFound("Ticket");
  const resolving = input.status && ["RESOLVED", "CLOSED"].includes(input.status) && !before.resolvedAt;
  const after = await db.supportTicket.update({ where: { id }, data: { ...input, ...(resolving ? { resolvedAt: new Date() } : {}) } });
  await audit(ctx, {
    action: "ticket.update",
    resourceType: "ticket",
    resourceId: id,
    resourceLabel: `#${before.number}`,
    oldValue: { status: before.status, priority: before.priority, assignedToId: before.assignedToId },
    newValue: input,
  });
  return after;
}
