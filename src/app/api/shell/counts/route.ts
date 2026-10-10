import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

/** Badge counts for sidebar & topbar (cheap indexed counts, polled every 30s). */
export const GET = route({}, async ({ auth }) => {
  const storeId = auth.store.id;
  const [approvals, inbox, whatsapp, orders, notifications, attention] = await Promise.all([
    can(auth.role, "approvals.view") ? db.aIDecision.count({ where: { storeId, status: "PENDING_APPROVAL" } }) : 0,
    can(auth.role, "conversations.view") ? db.conversation.count({ where: { storeId, status: { in: ["OPEN", "PENDING"] }, unreadCount: { gt: 0 } } }) : 0,
    can(auth.role, "conversations.view") ? db.conversation.count({ where: { storeId, channel: "WHATSAPP", status: { in: ["OPEN", "PENDING"] }, unreadCount: { gt: 0 } } }) : 0,
    can(auth.role, "orders.view") ? db.order.count({ where: { storeId, status: "PENDING_CONFIRMATION" } }) : 0,
    db.notification.count({ where: { storeId, userId: auth.user.id, readAt: null, archivedAt: null } }),
    db.conversation.count({ where: { storeId, needsAttention: true, status: { in: ["OPEN", "PENDING"] } } }),
  ]);
  return { approvals, inbox, whatsapp, orders, notifications, attention };
});
