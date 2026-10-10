import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCourierProvider } from "@/lib/courier/registry";
import { db } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { publishEvent } from "@/lib/events/bus";
import type { ServiceContext } from "@/lib/service-context";
import { addOrderEvent, transitionOrder } from "./order.service";
import { getStore } from "./store.service";

export const createShipmentSchema = z.object({
  courier: z.string().max(40).optional(),
  trackingNumber: z.string().trim().max(60).optional(),
  weightKg: z.number().min(0.1).max(50).default(0.5),
});

/** Books a shipment with the configured courier and moves the order to SHIPPED. */
export async function createShipment(ctx: ServiceContext, orderId: string, input: Partial<z.infer<typeof createShipmentSchema>> = {}) {
  const order = await db.order.findFirst({ where: { id: orderId, storeId: ctx.storeId }, include: { items: true, shipments: true } });
  if (!order) throw notFound("Order");
  if (order.shipments.some((s) => !["CANCELLED", "RETURNED"].includes(s.status))) throw conflict("This order already has an active shipment");
  if (!["CONFIRMED", "PROCESSING"].includes(order.status)) throw conflict("Only confirmed or processing orders can be shipped");

  const store = await getStore(ctx.storeId);
  const courierKey = input.courier ?? store.settings.courier.provider;
  const courier = getCourierProvider(courierKey);
  const addr = (order.shippingAddress ?? {}) as { address1?: string; address2?: string };
  const booking = input.trackingNumber
    ? { trackingNumber: input.trackingNumber, trackingUrl: null, status: "BOOKED" as const, estimatedDelivery: null }
    : await courier.createShipment({
        orderName: order.name,
        consignee: { name: order.customerName, phone: order.phone ?? "", address: [addr.address1, addr.address2].filter(Boolean).join(", "), city: order.city ?? "" },
        codAmount: order.paymentMethod === "COD" ? order.total : 0,
        weightKg: input.weightKg ?? 0.5,
        pieces: order.items.reduce((s, i) => s + i.quantity, 0),
        serviceType: store.settings.courier.defaultServiceType,
      });

  const shipment = await db.shipment.create({
    data: {
      storeId: ctx.storeId,
      orderId,
      courier: courier.key,
      trackingNumber: booking.trackingNumber,
      trackingUrl: booking.trackingUrl,
      status: booking.status,
      codAmount: order.paymentMethod === "COD" ? order.total : 0,
      estimatedDelivery: booking.estimatedDelivery,
      events: { create: { status: "BOOKED", description: `Booked with ${courier.name}`, occurredAt: new Date() } },
    },
  });
  await addOrderEvent(ctx.storeId, orderId, "shipment_created", "Shipment created", {
    description: `${courier.name} · ${booking.trackingNumber}`,
    actorType: ctx.actor.type,
    actorName: ctx.actor.name,
  });
  await audit(ctx, { action: "shipment.create", resourceType: "order", resourceId: orderId, resourceLabel: order.name, newValue: { courier: courier.key, trackingNumber: booking.trackingNumber } });
  await transitionOrder(ctx, orderId, "ship");
  await publishEvent(ctx.storeId, "SHIPMENT_CREATED", {
    title: `Order ${order.name} shipped via ${courier.name}`,
    tone: "info",
    href: `/orders/${orderId}`,
    payload: { orderId, shipmentId: shipment.id, customerId: order.customerId },
  });
  return shipment;
}

/** Polls courier tracking for active shipments and applies status changes. */
export async function refreshTracking(storeId: string, limit = 100) {
  const active = await db.shipment.findMany({
    where: { storeId, status: { in: ["BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] }, trackingNumber: { not: null } },
    take: limit,
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    include: { order: true },
  });
  let updated = 0;
  for (const s of active) {
    const courier = getCourierProvider(s.courier);
    try {
      const info = await courier.getTracking(s.trackingNumber!, { bookedAt: s.createdAt });
      const known = await db.trackingEvent.findMany({ where: { shipmentId: s.id }, select: { status: true } });
      const fresh = info.events.filter((e) => !known.some((k) => k.status === e.status));
      if (fresh.length) await db.trackingEvent.createMany({ data: fresh.map((e) => ({ shipmentId: s.id, ...e })) });
      await db.shipment.update({ where: { id: s.id }, data: { status: info.status, lastSyncedAt: new Date() } });
      if (info.status !== s.status) {
        updated++;
        await publishEvent(storeId, "SHIPMENT_UPDATED", {
          title: `Order ${s.order.name}: ${info.status.replace(/_/g, " ").toLowerCase()}`,
          tone: info.status === "DELIVERED" ? "success" : "info",
          href: `/orders/${s.orderId}`,
          payload: { orderId: s.orderId, shipmentId: s.id, status: info.status },
        });
        if (info.status === "DELIVERED" && s.order.status === "SHIPPED") {
          await transitionOrder({ storeId, actor: { type: "SYSTEM", name: courier.name } }, s.orderId, "deliver");
        }
        if (info.status === "OUT_FOR_DELIVERY") {
          await addOrderEvent(storeId, s.orderId, "out_for_delivery", "Out for delivery", { actorName: courier.name });
        }
      }
    } catch (err) {
      console.warn(`[tracking] ${s.trackingNumber}:`, (err as Error).message);
    }
  }
  return { checked: active.length, updated };
}
