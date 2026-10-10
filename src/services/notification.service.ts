import type { NotificationType, Role, Severity } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  severity?: Severity;
  /** Limit to members with these roles. Empty = everyone in the store. */
  roles?: Role[];
  /** Or target specific users. */
  userIds?: string[];
};

/** Fans a notification out to each recipient (read/archive state is per user). */
export async function notify(storeId: string, input: NotifyInput) {
  const members = await db.membership.findMany({
    where: {
      storeId,
      ...(input.userIds?.length ? { userId: { in: input.userIds } } : {}),
      ...(input.roles?.length ? { role: { in: input.roles } } : {}),
    },
    select: { userId: true },
  });
  if (!members.length) return 0;
  // Suppress repeats: skip people who still have the same unread notification from the last 6 hours.
  const dupes = await db.notification.findMany({
    where: { storeId, userId: { in: members.map((m) => m.userId) }, title: input.title.slice(0, 200), readAt: null, archivedAt: null, createdAt: { gte: new Date(Date.now() - 6 * 3_600_000) } },
    select: { userId: true },
  });
  const skip = new Set(dupes.map((d) => d.userId));
  const recipients = members.filter((m) => !skip.has(m.userId));
  if (!recipients.length) return 0;
  const { count } = await db.notification.createMany({
    data: recipients.map((m) => ({
      storeId,
      userId: m.userId,
      type: input.type,
      severity: input.severity ?? "INFO",
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 1000) ?? null,
      href: input.href ?? null,
    })),
  });
  return count;
}

export type NotificationFilter = { type?: NotificationType; status?: "unread" | "all" | "archived"; cursor?: string; limit?: number };

export async function listNotifications(storeId: string, userId: string, f: NotificationFilter = {}) {
  const limit = Math.min(f.limit ?? 30, 100);
  const items = await db.notification.findMany({
    where: {
      storeId,
      userId,
      ...(f.type ? { type: f.type } : {}),
      ...(f.status === "archived" ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...(f.status === "unread" ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  return { items: items.slice(0, limit), nextCursor: hasMore ? items[limit - 1].id : null };
}

export async function unreadCount(storeId: string, userId: string) {
  return db.notification.count({ where: { storeId, userId, readAt: null, archivedAt: null } });
}

export async function markRead(storeId: string, userId: string, ids: string[] | "all") {
  await db.notification.updateMany({
    where: { storeId, userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

export async function archive(storeId: string, userId: string, ids: string[]) {
  await db.notification.updateMany({
    where: { storeId, userId, id: { in: ids } },
    data: { archivedAt: new Date(), readAt: new Date() },
  });
}

/** Counts for the notification center tabs and per-type sidebar. */
export async function notificationCounts(storeId: string, userId: string) {
  const [unread, all, archived, byType] = await Promise.all([
    db.notification.count({ where: { storeId, userId, readAt: null, archivedAt: null } }),
    db.notification.count({ where: { storeId, userId, archivedAt: null } }),
    db.notification.count({ where: { storeId, userId, archivedAt: { not: null } } }),
    db.notification.groupBy({ by: ["type"], where: { storeId, userId, readAt: null, archivedAt: null }, _count: { _all: true } }),
  ]);
  return { unread, all, archived, unreadByType: Object.fromEntries(byType.map((t) => [t.type, t._count._all])) as Partial<Record<NotificationType, number>> };
}
