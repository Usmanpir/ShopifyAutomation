import {
  Bell,
  Bot,
  Clock,
  GitBranch,
  Megaphone,
  MessageCircle,
  Package,
  Play,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Timer,
  Truck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { Tone } from "@/components/shared/status";
import { NODE_META } from "@/lib/automation/catalog";
import type { NodeType } from "@/lib/automation/types";
import { EVENT_TYPES, isEventType } from "@/lib/events/types";

/** Visual identity per node type. Accents are design tokens (never raw colors). */
export const NODE_VISUAL: Record<NodeType, { icon: LucideIcon; accent: string; label: string; description: string }> = {
  TRIGGER: { icon: Zap, accent: "var(--ai)", label: NODE_META.TRIGGER.label, description: NODE_META.TRIGGER.description },
  CONDITION: { icon: GitBranch, accent: "var(--info)", label: NODE_META.CONDITION.label, description: NODE_META.CONDITION.description },
  ACTION: { icon: Play, accent: "var(--brand)", label: NODE_META.ACTION.label, description: NODE_META.ACTION.description },
  WAIT: { icon: Clock, accent: "var(--warning)", label: NODE_META.WAIT.label, description: NODE_META.WAIT.description },
  AI_DECISION: { icon: Sparkles, accent: "var(--chart-5)", label: NODE_META.AI_DECISION.label, description: NODE_META.AI_DECISION.description },
  APPROVAL: { icon: ShieldCheck, accent: "var(--success)", label: NODE_META.APPROVAL.label, description: NODE_META.APPROVAL.description },
  NOTIFICATION: { icon: Bell, accent: "var(--muted-foreground)", label: NODE_META.NOTIFICATION.label, description: NODE_META.NOTIFICATION.description },
};

export const NODE_TYPE_ORDER: NodeType[] = ["TRIGGER", "CONDITION", "ACTION", "WAIT", "AI_DECISION", "APPROVAL", "NOTIFICATION"];

/** CSS custom property used by node components to tint themselves. */
export const accentStyle = (type: NodeType) => ({ "--node-accent": NODE_VISUAL[type].accent }) as CSSProperties;

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Orders: ShoppingBag,
  Customers: Users,
  Conversations: MessageCircle,
  Inventory: Package,
  Shipping: Truck,
  Meta: Megaphone,
  System: Timer,
  AI: Bot,
  WhatsApp: MessageCircle,
  Support: MessageCircle,
  Marketing: Megaphone,
};

export function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICON[category] ?? Zap;
}

export function triggerMeta(event: string): { label: string; category: string; icon: LucideIcon } {
  if (isEventType(event)) {
    const e = EVENT_TYPES[event];
    return { label: e.label, category: e.category, icon: categoryIcon(e.category) };
  }
  return { label: event, category: "Other", icon: Zap };
}

export const AUTOMATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
};

export const ACTIVE_RUN_STATUSES = ["RUNNING", "WAITING", "AWAITING_APPROVAL"];

/** Events grouped by category, for grouped selects. */
export const EVENT_GROUPS: { category: string; events: { value: string; label: string }[] }[] = Object.entries(EVENT_TYPES).reduce<
  { category: string; events: { value: string; label: string }[] }[]
>((groups, [value, e]) => {
  const g = groups.find((x) => x.category === e.category);
  if (g) g.events.push({ value, label: e.label });
  else groups.push({ category: e.category, events: [{ value, label: e.label }] });
  return groups;
}, []);
