import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import type { EventTone, EventType } from "./types";

export type PublishInput = {
  title: string;
  tone?: EventTone;
  href?: string;
  payload?: Record<string, unknown>;
  /** Skip automation dispatch (e.g. for seeded/historical events). */
  silent?: boolean;
};

/**
 * Persist a domain event and fan it out to the automation engine.
 * Payload should carry entity ids (orderId, customerId…) — automations
 * re-load fresh entity state rather than trusting stale snapshots.
 */
export async function publishEvent(storeId: string, type: EventType, input: PublishInput) {
  const event = await db.domainEvent.create({
    data: {
      storeId,
      type,
      title: input.title,
      tone: input.tone ?? "info",
      href: input.href ?? null,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
    },
  });
  if (!input.silent) {
    await enqueue("automation.dispatch", { eventId: event.id });
  }
  return event;
}
