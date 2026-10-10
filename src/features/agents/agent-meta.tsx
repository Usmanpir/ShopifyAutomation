import { cn } from "cn";
import { Bot, BoxesIcon, BrainCircuit, ChartCandlestick, type LucideIcon, LifeBuoy, Megaphone, MessageCircle, PackageCheck } from "lucide-react";
import { createElement } from "react";
import type { Tone } from "@/components/shared/status";

/** Shared, framework-agnostic metadata for AI agent surfaces (safe in server + client components). */

const ICONS: Record<string, LucideIcon> = {
  "package-check": PackageCheck,
  "message-circle": MessageCircle,
  "life-buoy": LifeBuoy,
  megaphone: Megaphone,
  "chart-candlestick": ChartCandlestick,
  boxes: BoxesIcon,
  "brain-circuit": BrainCircuit,
  bot: Bot,
};

export const AGENT_ICON_BY_KEY: Record<string, string> = {
  ORDER: "package-check",
  WHATSAPP: "message-circle",
  SUPPORT: "life-buoy",
  MARKETING: "megaphone",
  ADS: "chart-candlestick",
  INVENTORY: "boxes",
  BUSINESS: "brain-circuit",
};

export function agentIcon(name?: string | null): LucideIcon {
  return (name && ICONS[name]) || Bot;
}

/** Rounded AI-tinted tile with the agent's icon. */
export function AgentAvatar({ icon, agentKey, size = "md", muted, className }: { icon?: string | null; agentKey?: string | null; size?: "sm" | "md" | "lg"; muted?: boolean; className?: string }) {
  const glyph = createElement(agentIcon(icon ?? (agentKey ? AGENT_ICON_BY_KEY[agentKey] : null)));
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg ring-1 ring-inset",
        muted ? "bg-muted text-muted-foreground ring-border" : "bg-ai-soft text-ai ring-ai/15",
        size === "sm" && "size-7 rounded-md [&_svg]:size-3.5",
        size === "md" && "size-10 [&_svg]:size-5",
        size === "lg" && "size-12 rounded-xl [&_svg]:size-6",
        className,
      )}
    >
      {glyph}
    </span>
  );
}

export const AUTONOMY: Record<string, { label: string; short: string; tone: Tone; description: string }> = {
  SUGGEST_ONLY: {
    label: "Suggest only",
    short: "Suggest",
    tone: "neutral",
    description: "The agent analyzes and recommends. It never changes anything in your store on its own.",
  },
  APPROVAL_REQUIRED: {
    label: "Needs approval",
    short: "Approval",
    tone: "warning",
    description: "Routine read and low-risk actions run automatically. Anything sensitive waits in the Approval Center for a human.",
  },
  AUTONOMOUS: {
    label: "Autonomous",
    short: "Auto",
    tone: "ai",
    description: "The agent acts on its own within its granted tools. Always-sensitive actions (refunds, cancellations) still need approval.",
  },
};

export const TASK_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Queued", tone: "neutral" },
  RUNNING: { label: "Running", tone: "info" },
  SUCCEEDED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

/** Human labels for agent tools (permissions list, approval action chips, assistant tool chips). */
const TOOL_LABELS: Record<string, { label: string; short: string }> = {
  getOrder: { label: "Read Shopify orders", short: "Read order" },
  listOrders: { label: "List and filter orders", short: "List orders" },
  getOrderStatusByPhone: { label: "Look up order status by phone", short: "Order status lookup" },
  getCustomer: { label: "Read customer profiles", short: "Read customer" },
  searchCustomers: { label: "Search customers", short: "Search customers" },
  searchProducts: { label: "Read products, prices & live stock", short: "Search products" },
  getInventory: { label: "Read inventory coverage", short: "Inventory coverage" },
  getLowStock: { label: "Detect low-stock variants", short: "Low stock" },
  getSalesSummary: { label: "Read store KPIs", short: "Sales summary" },
  compareRevenue: { label: "Analyze revenue changes", short: "Compare revenue" },
  getTopProducts: { label: "Read best-selling products", short: "Top products" },
  getInactiveCustomers: { label: "Find inactive customers", short: "Inactive customers" },
  getAdPerformance: { label: "Read Meta ads performance", short: "Ad performance" },
  getCampaign: { label: "Read Meta campaign details", short: "Read campaign" },
  searchKnowledge: { label: "Search store policies & FAQs", short: "Search knowledge" },
  sendWhatsAppMessage: { label: "Send WhatsApp messages", short: "Send WhatsApp message" },
  requestOrderConfirmation: { label: "Request COD confirmation on WhatsApp", short: "Request confirmation" },
  updateOrderStatus: { label: "Update order status", short: "Update order status" },
  bulkCancelOrders: { label: "Bulk cancel orders", short: "Bulk cancel orders" },
  refundOrder: { label: "Issue refunds", short: "Refund order" },
  addOrderTag: { label: "Tag orders", short: "Tag order" },
  createShipment: { label: "Book courier shipments", short: "Book shipment" },
  createNotification: { label: "Notify the store team", short: "Notify team" },
  createSupportTicket: { label: "Open support tickets", short: "Open ticket" },
  changeCampaignBudget: { label: "Change Meta campaign budgets", short: "Change campaign budget" },
  pauseCampaign: { label: "Pause Meta campaigns", short: "Pause campaign" },
  sendMarketingCampaign: { label: "Send WhatsApp broadcasts", short: "Send broadcast" },
  changeProductPrice: { label: "Change product prices", short: "Change price" },
  "automation.approval": { label: "Continue automation", short: "Continue automation" },
};

function humanize(name: string) {
  const s = name.replace(/[._]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function toolLabel(name: string) {
  return TOOL_LABELS[name]?.label ?? humanize(name);
}

export function toolShortLabel(name: string) {
  return TOOL_LABELS[name]?.short ?? humanize(name);
}

export type ToolKind = "read" | "write" | "sensitive";
export type ToolInfo = { name: string; description: string; permission: string; kind: ToolKind };

export const TOOL_KIND: Record<ToolKind, { label: string; tone: Tone }> = {
  read: { label: "Read", tone: "info" },
  write: { label: "Write", tone: "warning" },
  sensitive: { label: "Sensitive", tone: "danger" },
};

/** Where a related record lives in the app. */
export function relatedHref(type?: string | null, id?: string | null): { href: string; label: string } | null {
  if (!type || !id) return null;
  switch (type) {
    case "order":
      return { href: `/orders/${id}`, label: "View order" };
    case "conversation":
      return { href: `/conversations?c=${id}`, label: "Open conversation" };
    case "campaign":
      return { href: `/ads/campaigns/${id}`, label: "View campaign" };
    case "product":
      return { href: `/products/${id}`, label: "View product" };
    case "variant":
      return { href: `/inventory`, label: "View inventory" };
    case "customer":
      return { href: `/customers/${id}`, label: "View customer" };
    case "ticket":
      return { href: `/conversations`, label: "View ticket" };
    case "marketing_campaign":
      return { href: `/marketing`, label: "View marketing" };
    default:
      return null;
  }
}

export const PROVIDER_LABEL: Record<string, string> = {
  local: "CommerceAI Rules",
  anthropic: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
};

export function providerLabel(p?: string | null) {
  if (!p) return null;
  return PROVIDER_LABEL[p] ?? p;
}

export function formatDuration(ms?: number | null) {
  if (ms === null || ms === undefined) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
