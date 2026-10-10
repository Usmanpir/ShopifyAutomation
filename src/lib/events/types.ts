/**
 * Domain event catalogue. Events are persisted (DomainEvent), shown in the
 * live activity feed and used as automation triggers.
 */
export const EVENT_TYPES = {
  ORDER_CREATED: { label: "New order", category: "Orders", entity: "order" },
  ORDER_CONFIRMED: { label: "Order confirmed", category: "Orders", entity: "order" },
  ORDER_DECLINED: { label: "Customer declined order", category: "Orders", entity: "order" },
  ORDER_CANCELLED: { label: "Order cancelled", category: "Orders", entity: "order" },
  ORDER_FULFILLED: { label: "Order fulfilled", category: "Orders", entity: "order" },
  ORDER_DELIVERED: { label: "Order delivered", category: "Orders", entity: "order" },
  ORDER_RETURNED: { label: "Order returned", category: "Orders", entity: "order" },
  ORDER_HIGH_RISK: { label: "High-risk order detected", category: "Orders", entity: "order" },

  CUSTOMER_CREATED: { label: "New customer", category: "Customers", entity: "customer" },
  CUSTOMER_INACTIVE: { label: "Customer became inactive", category: "Customers", entity: "customer" },
  CUSTOMER_MESSAGE_RECEIVED: { label: "Customer message received", category: "Conversations", entity: "conversation" },
  HUMAN_HANDOFF_REQUESTED: { label: "Human assistance required", category: "Conversations", entity: "conversation" },

  INVENTORY_LOW: { label: "Inventory below threshold", category: "Inventory", entity: "variant" },
  INVENTORY_OUT: { label: "Variant out of stock", category: "Inventory", entity: "variant" },

  SHIPMENT_CREATED: { label: "Shipment created", category: "Shipping", entity: "shipment" },
  SHIPMENT_UPDATED: { label: "Shipment status updated", category: "Shipping", entity: "shipment" },

  META_LEAD_RECEIVED: { label: "Meta lead received", category: "Meta", entity: "lead" },
  CAMPAIGN_UPDATED: { label: "Campaign updated", category: "Meta", entity: "campaign" },

  AUTOMATION_TRIGGERED: { label: "Automation triggered", category: "System", entity: "automation" },
  AI_DECISION_CREATED: { label: "AI recommendation created", category: "AI", entity: "decision" },
  SCHEDULED: { label: "On a schedule", category: "System", entity: "store" },
} as const;

export type EventType = keyof typeof EVENT_TYPES;

export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES) as EventType[];

export type EventTone = "success" | "info" | "warning" | "danger" | "ai";

export function isEventType(value: string): value is EventType {
  return value in EVENT_TYPES;
}
