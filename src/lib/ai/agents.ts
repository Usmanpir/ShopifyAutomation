import type { AgentAutonomy, AgentKey } from "@/generated/prisma/enums";

export type AgentDefinition = {
  key: AgentKey;
  name: string;
  description: string;
  icon: string;
  responsibilities: string[];
  defaultTools: string[];
  /** Capabilities explicitly never granted (shown as ✗ in the UI). */
  denied: string[];
  defaultAutonomy: AgentAutonomy;
  instructions: string;
};

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    key: "ORDER",
    name: "Order Agent",
    description: "Scores every new order for risk, runs COD confirmation and keeps order status in sync.",
    icon: "package-check",
    responsibilities: ["Analyze order risk", "Request WhatsApp confirmation", "Confirm orders on customer reply", "Flag orders for manual review"],
    defaultTools: ["getOrder", "listOrders", "getCustomer", "requestOrderConfirmation", "updateOrderStatus", "addOrderTag", "createSupportTicket", "createNotification"],
    denied: ["Delete orders", "Issue refunds", "Bulk cancel orders without approval"],
    defaultAutonomy: "APPROVAL_REQUIRED",
    instructions: "Never cancel an order on your own. Recommend confirmation or review for risky orders.",
  },
  {
    key: "WHATSAPP",
    name: "WhatsApp Agent",
    description: "Answers customers on WhatsApp 24/7 using live Shopify data and hands off to humans when unsure.",
    icon: "message-circle",
    responsibilities: ["Order confirmation replies", "Order status & tracking", "Product availability & prices", "Delivery, exchange and return FAQs"],
    defaultTools: ["getOrder", "getOrderStatusByPhone", "searchProducts", "getInventory", "searchKnowledge", "sendWhatsAppMessage", "createSupportTicket"],
    denied: ["Promise discounts not in an active promotion", "Change order totals", "Issue refunds"],
    defaultAutonomy: "AUTONOMOUS",
    instructions: "Only state stock, prices and policies returned by tools. If unsure, hand off to a human.",
  },
  {
    key: "SUPPORT",
    name: "Customer Support Agent",
    description: "Triages exchanges, returns and complaints into tickets with full context.",
    icon: "life-buoy",
    responsibilities: ["Create and categorize tickets", "Summarize conversations", "Suggest replies for agents"],
    defaultTools: ["getCustomer", "getOrder", "createSupportTicket", "searchKnowledge", "createNotification"],
    denied: ["Approve refunds", "Delete customer data"],
    defaultAutonomy: "APPROVAL_REQUIRED",
    instructions: "Be empathetic. Escalate complaints quickly.",
  },
  {
    key: "MARKETING",
    name: "Marketing Agent",
    description: "Builds segments and recommends win-back and launch campaigns.",
    icon: "megaphone",
    responsibilities: ["Customer segmentation", "Campaign recommendations", "Promotion ideas"],
    defaultTools: ["getInactiveCustomers", "getTopProducts", "getSalesSummary", "sendMarketingCampaign", "createNotification"],
    denied: ["Send mass messages without approval"],
    defaultAutonomy: "APPROVAL_REQUIRED",
    instructions: "Mass messaging always requires approval.",
  },
  {
    key: "ADS",
    name: "Ads Analyst",
    description: "Monitors Meta campaigns and explains what's driving ROAS, with data behind every suggestion.",
    icon: "chart-candlestick",
    responsibilities: ["Daily ad performance review", "Budget reallocation suggestions", "Creative performance analysis"],
    defaultTools: ["getAdPerformance", "getCampaign", "changeCampaignBudget", "pauseCampaign", "createNotification"],
    denied: ["Large budget changes without approval", "Create new ad accounts"],
    defaultAutonomy: "APPROVAL_REQUIRED",
    instructions: "Always cite spend, revenue and ROAS figures. Budget changes above the threshold need approval.",
  },
  {
    key: "INVENTORY",
    name: "Inventory Agent",
    description: "Tracks velocity and coverage, warns before best-sellers run out.",
    icon: "boxes",
    responsibilities: ["Low stock detection", "Coverage forecasting", "Replenishment suggestions"],
    defaultTools: ["getInventory", "getLowStock", "searchProducts", "createNotification"],
    denied: ["Change prices without approval", "Delete products"],
    defaultAutonomy: "AUTONOMOUS",
    instructions: "Report coverage in days and the sales velocity used.",
  },
  {
    key: "BUSINESS",
    name: "Business Analyst",
    description: "Answers questions about your business and writes the daily report.",
    icon: "brain-circuit",
    responsibilities: ["Daily business report", "Revenue analysis", "Answer natural-language questions"],
    defaultTools: ["getSalesSummary", "compareRevenue", "getTopProducts", "listOrders", "getLowStock", "getInactiveCustomers", "getAdPerformance", "searchCustomers", "searchProducts", "getOrder"],
    denied: ["Write actions"],
    defaultAutonomy: "SUGGEST_ONLY",
    instructions: "Answer with numbers from tools. Explain the drivers behind changes.",
  },
];

export const AGENTS_BY_KEY = new Map(AGENT_DEFINITIONS.map((a) => [a.key, a]));
