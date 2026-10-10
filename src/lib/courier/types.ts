import type { ShipmentStatus } from "@/generated/prisma/enums";

/**
 * Generic courier abstraction. Add a provider by implementing this interface
 * and registering it in ./registry.ts — no other code changes required.
 */
export type ShipmentRequest = {
  orderName: string;
  consignee: { name: string; phone: string; address: string; city: string };
  codAmount: number; // minor units
  weightKg: number;
  pieces: number;
  serviceType?: string;
  notes?: string;
};

export type ShipmentBooking = {
  trackingNumber: string;
  trackingUrl: string | null;
  status: ShipmentStatus;
  estimatedDelivery: Date | null;
};

export type TrackingInfo = {
  status: ShipmentStatus;
  events: { status: ShipmentStatus; description: string; location: string | null; occurredAt: Date }[];
};

export interface CourierProvider {
  readonly key: string;
  readonly name: string;
  readonly isDemo: boolean;
  createShipment(req: ShipmentRequest): Promise<ShipmentBooking>;
  /** `bookedAt` lets providers without a lookup API (demo/manual) derive progress. */
  getTracking(trackingNumber: string, opts?: { bookedAt?: Date }): Promise<TrackingInfo>;
  getStatus(trackingNumber: string): Promise<ShipmentStatus>;
  cancelShipment(trackingNumber: string): Promise<void>;
}
