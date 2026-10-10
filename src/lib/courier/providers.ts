import type { ShipmentStatus } from "@/generated/prisma/enums";
import type { CourierProvider, ShipmentBooking, ShipmentRequest, TrackingInfo } from "./types";

const FLOW: ShipmentStatus[] = ["BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
const DESCRIPTIONS: Record<string, string> = {
  BOOKED: "Shipment booked",
  PICKED_UP: "Picked up from warehouse",
  IN_TRANSIT: "In transit to destination city",
  OUT_FOR_DELIVERY: "Out for delivery with rider",
  DELIVERED: "Delivered to consignee",
};

/**
 * Demo courier: deterministic tracking progression derived from the tracking
 * number's embedded booking timestamp (advances one stage every ~8 hours).
 */
export class DemoCourierProvider implements CourierProvider {
  readonly key = "demo";
  readonly name = "Demo Express";
  readonly isDemo = true;

  async createShipment(req: ShipmentRequest): Promise<ShipmentBooking> {
    const ts = Date.now();
    const trackingNumber = `DX${ts.toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
    void req;
    return {
      trackingNumber,
      trackingUrl: null,
      status: "BOOKED",
      estimatedDelivery: new Date(ts + 2 * 86_400_000),
    };
  }

  private bookedAt(trackingNumber: string, known?: Date): number {
    if (known) return known.getTime();
    const parsed = parseInt(trackingNumber.slice(2, -2), 36);
    // Guard against ids that don't embed a millisecond timestamp.
    return Number.isFinite(parsed) && parsed > Date.UTC(2020, 0, 1) && parsed <= Date.now() ? parsed : Date.now();
  }

  async getTracking(trackingNumber: string, opts: { bookedAt?: Date } = {}): Promise<TrackingInfo> {
    const start = this.bookedAt(trackingNumber, opts.bookedAt);
    const stage = Math.min(FLOW.length - 1, Math.floor((Date.now() - start) / (8 * 3_600_000)));
    const events = FLOW.slice(0, stage + 1).map((status, i) => ({
      status,
      description: DESCRIPTIONS[status],
      location: i < 2 ? "Origin hub" : i < 4 ? "Destination hub" : null,
      occurredAt: new Date(start + i * 8 * 3_600_000),
    }));
    return { status: FLOW[stage], events };
  }

  async getStatus(trackingNumber: string) {
    return (await this.getTracking(trackingNumber)).status;
  }

  async cancelShipment() {}
}

/** Manual courier: staff enter tracking numbers; statuses are updated by hand or via webhook. */
export class ManualCourierProvider implements CourierProvider {
  readonly key = "manual";
  readonly name = "Manual / Self-delivery";
  readonly isDemo = false;

  async createShipment(req: ShipmentRequest): Promise<ShipmentBooking> {
    return { trackingNumber: `MAN-${req.orderName.replace("#", "")}`, trackingUrl: null, status: "BOOKED", estimatedDelivery: null };
  }
  async getTracking(): Promise<TrackingInfo> {
    return { status: "BOOKED", events: [] };
  }
  async getStatus(): Promise<ShipmentStatus> {
    return "BOOKED";
  }
  async cancelShipment() {}
}
