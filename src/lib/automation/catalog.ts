import type { NodeType } from "./types";

/**
 * Catalogue of automation building blocks, shared by the visual builder (UI)
 * and the executor (server). Each action maps to a service/AI-tool call.
 */
export type ActionParam = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
};

export type ActionDefinition = {
  key: string;
  label: string;
  description: string;
  category: "WhatsApp" | "Orders" | "Customers" | "Support" | "Marketing" | "Inventory" | "Shipping";
  /** Entity the action needs in context (resolved from the trigger payload). */
  requires?: "order" | "customer" | "conversation" | "variant" | "shipment";
  params: ActionParam[];
  /** Sensitive actions are routed through the approval center. */
  sensitive?: boolean;
};

export const ACTIONS: ActionDefinition[] = [
  {
    key: "request_order_confirmation",
    label: "Send order confirmation",
    description: "Sends the WhatsApp order confirmation template and marks the order as pending confirmation.",
    category: "WhatsApp",
    requires: "order",
    params: [],
  },
  {
    key: "send_confirmation_reminder",
    label: "Send confirmation reminder",
    description: "Reminds the customer to confirm their COD order.",
    category: "WhatsApp",
    requires: "order",
    params: [],
  },
  {
    key: "send_whatsapp_message",
    label: "Send WhatsApp message",
    description: "Sends a free-form message. Supports {{order.name}}, {{customer.name}} placeholders.",
    category: "WhatsApp",
    requires: "customer",
    params: [{ key: "text", label: "Message", type: "textarea", required: true, placeholder: "Hi {{customer.firstName}}, …" }],
  },
  {
    key: "send_tracking_update",
    label: "Send tracking update",
    description: "Sends shipment tracking details over WhatsApp.",
    category: "Shipping",
    requires: "order",
    params: [],
  },
  {
    key: "send_review_request",
    label: "Request a review",
    description: "Asks the customer for a review of their delivered order.",
    category: "WhatsApp",
    requires: "order",
    params: [],
  },
  {
    key: "update_order_status",
    label: "Update order status",
    description: "Moves the order to a new status (synced back to Shopify).",
    category: "Orders",
    requires: "order",
    params: [
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { value: "CONFIRMED", label: "Confirmed" },
          { value: "PROCESSING", label: "Processing" },
          { value: "CANCELLED", label: "Cancelled" },
        ],
      },
    ],
  },
  {
    key: "add_order_tag",
    label: "Tag order",
    description: "Adds a tag to the order (synced to Shopify).",
    category: "Orders",
    requires: "order",
    params: [{ key: "tag", label: "Tag", type: "text", required: true, placeholder: "needs-review" }],
  },
  {
    key: "create_manual_review",
    label: "Create manual review",
    description: "Flags the order and opens a support ticket for a human to review.",
    category: "Orders",
    requires: "order",
    params: [{ key: "reason", label: "Reason", type: "text", placeholder: "Customer did not confirm" }],
  },
  {
    key: "create_shipment",
    label: "Book shipment",
    description: "Books the order with the configured courier.",
    category: "Shipping",
    requires: "order",
    params: [],
  },
  {
    key: "create_support_ticket",
    label: "Create support ticket",
    description: "Opens a ticket for the support team.",
    category: "Support",
    params: [
      { key: "subject", label: "Subject", type: "text", required: true },
      {
        key: "priority",
        label: "Priority",
        type: "select",
        options: [
          { value: "LOW", label: "Low" },
          { value: "MEDIUM", label: "Medium" },
          { value: "HIGH", label: "High" },
          { value: "URGENT", label: "Urgent" },
        ],
      },
    ],
  },
  {
    key: "add_customer_to_segment",
    label: "Add customer to segment",
    description: "Adds the customer to a marketing segment.",
    category: "Customers",
    requires: "customer",
    params: [{ key: "segmentKey", label: "Segment key", type: "text", required: true, placeholder: "inactive" }],
  },
  {
    key: "recommend_marketing_campaign",
    label: "Recommend win-back campaign",
    description: "Asks the Marketing Agent to draft a campaign recommendation for approval.",
    category: "Marketing",
    requires: "customer",
    params: [],
  },
  {
    key: "analyze_inventory",
    label: "AI inventory analysis",
    description: "Inventory Agent analyzes velocity and coverage for the variant and publishes an insight.",
    category: "Inventory",
    requires: "variant",
    params: [],
  },
];

export const ACTIONS_BY_KEY = new Map(ACTIONS.map((a) => [a.key, a]));

/** Which AI agent performs each automation action (for agent stats and attribution). */
export const ACTION_AGENT: Record<string, "ORDER" | "WHATSAPP" | "SUPPORT" | "MARKETING" | "INVENTORY"> = {
  request_order_confirmation: "ORDER",
  send_confirmation_reminder: "ORDER",
  update_order_status: "ORDER",
  add_order_tag: "ORDER",
  create_manual_review: "ORDER",
  create_shipment: "ORDER",
  send_whatsapp_message: "WHATSAPP",
  send_tracking_update: "WHATSAPP",
  send_review_request: "WHATSAPP",
  create_support_ticket: "SUPPORT",
  add_customer_to_segment: "MARKETING",
  recommend_marketing_campaign: "MARKETING",
  analyze_inventory: "INVENTORY",
};

export const NODE_META: Record<NodeType, { label: string; description: string; color: string }> = {
  TRIGGER: { label: "Trigger", description: "Starts the workflow when an event happens", color: "violet" },
  CONDITION: { label: "Condition", description: "Branches on order, customer or message data", color: "sky" },
  ACTION: { label: "Action", description: "Does something: message, update, create", color: "indigo" },
  WAIT: { label: "Wait", description: "Pauses before the next step", color: "amber" },
  AI_DECISION: { label: "AI Decision", description: "Lets AI choose a branch, with reasoning", color: "fuchsia" },
  APPROVAL: { label: "Approval", description: "Waits for a human to approve", color: "emerald" },
  NOTIFICATION: { label: "Notification", description: "Notifies your team", color: "slate" },
};

/** Fields available to conditions, grouped by entity. */
export const CONDITION_FIELDS: { value: string; label: string; type: "string" | "number" | "enum" | "boolean"; options?: string[] }[] = [
  { value: "order.paymentMethod", label: "Order · Payment method", type: "enum", options: ["COD", "CARD", "BANK_TRANSFER", "WALLET"] },
  { value: "order.status", label: "Order · Status", type: "enum", options: ["NEW", "PENDING_CONFIRMATION", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"] },
  { value: "order.confirmationStatus", label: "Order · Confirmation", type: "enum", options: ["NOT_REQUIRED", "PENDING", "CONFIRMED", "DECLINED", "NO_RESPONSE"] },
  { value: "order.riskLevel", label: "Order · Risk level", type: "enum", options: ["LOW", "MEDIUM", "HIGH"] },
  { value: "order.riskScore", label: "Order · Risk score", type: "number" },
  { value: "order.totalMajor", label: "Order · Total (major units)", type: "number" },
  { value: "order.city", label: "Order · City", type: "string" },
  { value: "customer.totalOrders", label: "Customer · Total orders", type: "number" },
  { value: "customer.daysSinceLastOrder", label: "Customer · Days since last order", type: "number" },
  { value: "customer.riskLevel", label: "Customer · Risk level", type: "enum", options: ["LOW", "MEDIUM", "HIGH"] },
  { value: "customer.tags", label: "Customer · Tags", type: "string" },
  { value: "variant.inventoryQuantity", label: "Variant · Stock", type: "number" },
  { value: "shipment.status", label: "Shipment · Status", type: "string" },
];
