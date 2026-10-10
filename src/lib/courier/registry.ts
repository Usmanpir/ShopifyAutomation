import { DemoCourierProvider, ManualCourierProvider } from "./providers";
import type { CourierProvider } from "./types";

type Factory = (config: Record<string, unknown>) => CourierProvider;

/** Register courier providers here. Keys are stored on Shipment.courier. */
const REGISTRY: Record<string, { name: string; description: string; factory: Factory }> = {
  demo: {
    name: "Demo Express",
    description: "Simulated courier with realistic tracking progression.",
    factory: () => new DemoCourierProvider(),
  },
  manual: {
    name: "Manual / Self-delivery",
    description: "Enter tracking numbers manually or use your own riders.",
    factory: () => new ManualCourierProvider(),
  },
};

export function getCourierProvider(key: string, config: Record<string, unknown> = {}): CourierProvider {
  const entry = REGISTRY[key] ?? REGISTRY.demo;
  return entry.factory(config);
}

export function listCourierProviders() {
  return Object.entries(REGISTRY).map(([key, v]) => ({ key, name: v.name, description: v.description }));
}
