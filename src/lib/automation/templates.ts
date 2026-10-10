import type { AutomationGraph } from "./types";

export type AutomationTemplate = {
  key: string;
  name: string;
  description: string;
  category: string;
  triggerType: string;
  graph: AutomationGraph;
};

const col = (i: number) => ({ x: 280, y: 40 + i * 130 });

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: "cod-confirmation",
    name: "COD order confirmation",
    description: "Confirm every COD order over WhatsApp, remind after 2 hours and send unconfirmed orders to manual review.",
    category: "Orders",
    triggerType: "ORDER_CREATED",
    graph: {
      nodes: [
        { key: "trigger", type: "TRIGGER", label: "New Shopify order", config: { event: "ORDER_CREATED", filters: [] }, position: col(0) },
        { key: "is_cod", type: "CONDITION", label: "Payment method is COD", config: { match: "all", rules: [{ field: "order.paymentMethod", operator: "eq", value: "COD" }] }, position: col(1) },
        { key: "send_confirm", type: "ACTION", label: "Send WhatsApp confirmation", config: { action: "request_order_confirmation", params: {} }, position: col(2) },
        { key: "wait_2h", type: "WAIT", label: "Wait 2 hours", config: { amount: 2, unit: "hours" }, position: col(3) },
        { key: "not_confirmed", type: "CONDITION", label: "Not confirmed yet", config: { match: "all", rules: [{ field: "order.confirmationStatus", operator: "eq", value: "PENDING" }] }, position: col(4) },
        { key: "reminder", type: "ACTION", label: "Send reminder", config: { action: "send_confirmation_reminder", params: {} }, position: col(5) },
        { key: "wait_12h", type: "WAIT", label: "Wait 12 hours", config: { amount: 12, unit: "hours" }, position: col(6) },
        { key: "still_pending", type: "CONDITION", label: "Still not confirmed", config: { match: "all", rules: [{ field: "order.confirmationStatus", operator: "eq", value: "PENDING" }] }, position: col(7) },
        { key: "manual_review", type: "ACTION", label: "Create manual review", config: { action: "create_manual_review", params: { reason: "Customer did not confirm COD order within 14 hours" } }, position: col(8) },
      ],
      edges: [
        { source: "trigger", target: "is_cod", handle: "next" },
        { source: "is_cod", target: "send_confirm", handle: "true" },
        { source: "send_confirm", target: "wait_2h", handle: "next" },
        { source: "wait_2h", target: "not_confirmed", handle: "next" },
        { source: "not_confirmed", target: "reminder", handle: "true" },
        { source: "reminder", target: "wait_12h", handle: "next" },
        { source: "wait_12h", target: "still_pending", handle: "next" },
        { source: "still_pending", target: "manual_review", handle: "true" },
      ],
    },
  },
  {
    key: "delivery-notification",
    name: "Shipment tracking notification",
    description: "Send the customer their tracking details on WhatsApp as soon as a shipment is booked.",
    category: "Shipping",
    triggerType: "SHIPMENT_CREATED",
    graph: {
      nodes: [
        { key: "trigger", type: "TRIGGER", label: "Shipment created", config: { event: "SHIPMENT_CREATED", filters: [] }, position: col(0) },
        { key: "send_tracking", type: "ACTION", label: "Send tracking on WhatsApp", config: { action: "send_tracking_update", params: {} }, position: col(1) },
      ],
      edges: [{ source: "trigger", target: "send_tracking", handle: "next" }],
    },
  },
  {
    key: "review-request",
    name: "Post-delivery review request",
    description: "Three days after delivery, ask happy customers for a review.",
    category: "Customers",
    triggerType: "ORDER_DELIVERED",
    graph: {
      nodes: [
        { key: "trigger", type: "TRIGGER", label: "Order delivered", config: { event: "ORDER_DELIVERED", filters: [] }, position: col(0) },
        { key: "wait_3d", type: "WAIT", label: "Wait 3 days", config: { amount: 3, unit: "days" }, position: col(1) },
        { key: "not_returned", type: "CONDITION", label: "Order not returned", config: { match: "all", rules: [{ field: "order.status", operator: "eq", value: "DELIVERED" }] }, position: col(2) },
        { key: "review", type: "ACTION", label: "Request review", config: { action: "send_review_request", params: {} }, position: col(3) },
      ],
      edges: [
        { source: "trigger", target: "wait_3d", handle: "next" },
        { source: "wait_3d", target: "not_returned", handle: "next" },
        { source: "not_returned", target: "review", handle: "true" },
      ],
    },
  },
  {
    key: "low-inventory",
    name: "Low inventory alert",
    description: "When a variant drops below its threshold, the Inventory Agent analyzes velocity and alerts admins.",
    category: "Inventory",
    triggerType: "INVENTORY_LOW",
    graph: {
      nodes: [
        { key: "trigger", type: "TRIGGER", label: "Inventory below threshold", config: { event: "INVENTORY_LOW", filters: [] }, position: col(0) },
        { key: "analyze", type: "ACTION", label: "AI inventory analysis", config: { action: "analyze_inventory", params: {} }, position: col(1) },
        { key: "notify", type: "NOTIFICATION", label: "Notify admins", config: { title: "Low stock: {{variant.displayName}}", body: "{{variant.inventoryQuantity}} units left. Review replenishment.", severity: "WARNING", roles: ["OWNER", "ADMIN", "MANAGER"] }, position: col(2) },
      ],
      edges: [
        { source: "trigger", target: "analyze", handle: "next" },
        { source: "analyze", target: "notify", handle: "next" },
      ],
    },
  },
  {
    key: "inactive-customer",
    name: "Inactive customer win-back",
    description: "Customers with no purchase for 60 days are segmented and the Marketing Agent recommends a campaign.",
    category: "Marketing",
    triggerType: "CUSTOMER_INACTIVE",
    graph: {
      nodes: [
        { key: "trigger", type: "TRIGGER", label: "No purchase for 60 days", config: { event: "CUSTOMER_INACTIVE", filters: [] }, position: col(0) },
        { key: "segment", type: "ACTION", label: "Add to Inactive segment", config: { action: "add_customer_to_segment", params: { segmentKey: "inactive" } }, position: col(1) },
        { key: "recommend", type: "ACTION", label: "Recommend win-back campaign", config: { action: "recommend_marketing_campaign", params: {} }, position: col(2) },
      ],
      edges: [
        { source: "trigger", target: "segment", handle: "next" },
        { source: "segment", target: "recommend", handle: "next" },
      ],
    },
  },
  {
    key: "high-risk-review",
    name: "High-risk order review",
    description: "AI decides whether a high-risk order needs a call; a manager approves before cancelling anything.",
    category: "Orders",
    triggerType: "ORDER_HIGH_RISK",
    graph: {
      nodes: [
        { key: "trigger", type: "TRIGGER", label: "High-risk order detected", config: { event: "ORDER_HIGH_RISK", filters: [] }, position: col(0) },
        { key: "ai", type: "AI_DECISION", label: "AI: Is this likely fraudulent?", config: { question: "Based on the risk signals, is this order likely fake or fraudulent?", outcomes: ["likely_fraud", "needs_confirmation"], defaultOutcome: "needs_confirmation" }, position: col(1) },
        { key: "approval", type: "APPROVAL", label: "Manager approval to hold order", config: { title: "Hold high-risk order {{order.name}}", summary: "AI flagged this order as likely fraudulent.", risk: "HIGH" }, position: { x: 80, y: 300 } },
        { key: "tag", type: "ACTION", label: "Tag as on-hold", config: { action: "add_order_tag", params: { tag: "on-hold-risk" } }, position: { x: 80, y: 430 } },
        { key: "confirm", type: "ACTION", label: "Request WhatsApp confirmation", config: { action: "request_order_confirmation", params: {} }, position: { x: 480, y: 300 } },
      ],
      edges: [
        { source: "trigger", target: "ai", handle: "next" },
        { source: "ai", target: "approval", handle: "likely_fraud" },
        { source: "ai", target: "confirm", handle: "needs_confirmation" },
        { source: "approval", target: "tag", handle: "approved" },
        { source: "approval", target: "confirm", handle: "rejected" },
      ],
    },
  },
];

export const TEMPLATES_BY_KEY = new Map(AUTOMATION_TEMPLATES.map((t) => [t.key, t]));
