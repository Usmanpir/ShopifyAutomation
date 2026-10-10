import {
  BarChart3,
  Bot,
  House,
  type LucideIcon,
  Megaphone,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Show the item if the user has any of these (when `permission` is not set). */
  anyPermission?: Permission[];
  /** Key into /api/shell/counts for a live badge. */
  badge?: "approvals" | "inbox" | "whatsapp" | "orders" | "attention";
  /** Other routes that belong to this item (kept for existing links). */
  match?: string[];
};

export type NavSection = { label?: string; items: NavItem[] };

/**
 * Eight daily areas, then analysis and settings. Older routes are folded in
 * through `match` and in-page area tabs, so every existing URL still works:
 * Inventory → Products · WhatsApp → Inbox · Meta Ads → Marketing ·
 * Agents/Approvals → AI · Reports → Analytics · Integrations → Settings.
 */
export const NAV: NavSection[] = [
  {
    items: [
      { label: "Home", href: "/dashboard", icon: House, permission: "dashboard.view" },
      { label: "Orders", href: "/orders", icon: ShoppingBag, permission: "orders.view", badge: "orders" },
      { label: "Customers", href: "/customers", icon: Users, permission: "customers.view" },
      { label: "Inbox", href: "/conversations", icon: MessagesSquare, permission: "conversations.view", badge: "inbox", match: ["/whatsapp"] },
      { label: "Products", href: "/products", icon: Package, permission: "products.view", match: ["/inventory"] },
      { label: "Marketing", href: "/marketing", icon: Megaphone, anyPermission: ["marketing.view", "ads.view"], match: ["/ads"] },
      { label: "Automations", href: "/automations", icon: Workflow, permission: "automations.view" },
      { label: "AI", href: "/ai", icon: Bot, permission: "approvals.view", badge: "approvals", match: ["/agents", "/approvals"] },
    ],
  },
  {
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3, anyPermission: ["analytics.view", "reports.view"], match: ["/reports"] },
      { label: "Settings", href: "/settings", icon: Settings, permission: "settings.view", match: ["/integrations"] },
    ],
  },
];

export const ASSISTANT_ITEM: NavItem = { label: "AI Assistant", href: "/assistant", icon: Sparkles, permission: "ai.use" };

/** Mobile bottom navigation (4 slots + More). */
export const MOBILE_NAV: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: House },
  { label: "Orders", href: "/orders", icon: ShoppingBag, permission: "orders.view", badge: "orders" },
  { label: "Inbox", href: "/conversations", icon: MessagesSquare, permission: "conversations.view", badge: "inbox", match: ["/whatsapp"] },
  { label: "AI", href: "/assistant", icon: Sparkles, permission: "ai.use" },
];

export function navVisible(item: NavItem, can: (p: Permission) => boolean) {
  if (item.permission) return can(item.permission);
  if (item.anyPermission) return item.anyPermission.some(can);
  return true;
}

export function navActive(pathname: string, item: Pick<NavItem, "href" | "match">) {
  const hit = (href: string) => pathname === href || pathname.startsWith(href + "/");
  return hit(item.href) || !!item.match?.some(hit);
}
