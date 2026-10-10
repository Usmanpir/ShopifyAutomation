import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import type { ServiceContext } from "@/lib/service-context";

export type AuditEntry = {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

const toJson = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/** Records who did what, when, to which resource — for humans and AI alike. */
export async function audit(ctx: ServiceContext, entry: AuditEntry, tx?: Tx) {
  const client = tx ?? db;
  await client.auditLog.create({
    data: {
      storeId: ctx.storeId,
      actorType: ctx.actor.type,
      actorId: ctx.actor.id ?? null,
      actorName: ctx.actor.name,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      resourceLabel: entry.resourceLabel ?? null,
      oldValue: toJson(entry.oldValue),
      newValue: toJson(entry.newValue),
      reason: entry.reason ?? null,
      ip: ctx.actor.ip ?? null,
      userAgent: ctx.actor.userAgent ?? null,
      metadata: toJson(entry.metadata),
    },
  });
}
