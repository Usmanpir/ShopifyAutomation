import { z } from "zod";
import { parseQuery, route } from "@/lib/api";
import { db } from "@/lib/db";

/** Live activity feed. Clients poll with ?after=<ISO> to fetch only new events. */
export const GET = route({ permission: "dashboard.view" }, async ({ req, auth }) => {
  const q = parseQuery(req, z.object({ after: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(50).default(15) }));
  return db.domainEvent.findMany({
    where: { storeId: auth.store.id, ...(q.after ? { createdAt: { gt: new Date(q.after) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: q.limit,
    select: { id: true, type: true, title: true, tone: true, href: true, createdAt: true },
  });
});
