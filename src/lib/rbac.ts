import type { Role } from "@/generated/prisma/enums";

/**
 * Role-based access control. Permissions are fine-grained strings checked on
 * the server for every mutation (and used by the UI to hide unavailable actions).
 */
export const PERMISSIONS = [
  "dashboard.view",
  "orders.view",
  "orders.update",
  "orders.cancel",
  "orders.refund",
  "customers.view",
  "customers.update",
  "products.view",
  "products.update",
  "inventory.view",
  "inventory.update",
  "conversations.view",
  "conversations.reply",
  "conversations.manage",
  "marketing.view",
  "marketing.manage",
  "marketing.send",
  "ads.view",
  "ads.manage",
  "automations.view",
  "automations.manage",
  "ai.use",
  "ai.agents.manage",
  "approvals.view",
  "approvals.decide",
  "analytics.view",
  "reports.view",
  "reports.export",
  "integrations.view",
  "integrations.manage",
  "settings.view",
  "settings.manage",
  "team.manage",
  "audit.view",
  "billing.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const VIEW_ONLY: Permission[] = [
  "dashboard.view",
  "orders.view",
  "customers.view",
  "products.view",
  "inventory.view",
  "conversations.view",
  "marketing.view",
  "ads.view",
  "automations.view",
  "approvals.view",
  "analytics.view",
  "reports.view",
  "integrations.view",
  "settings.view",
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: ALL,
  ADMIN: new Set(PERMISSIONS.filter((p) => p !== "billing.manage")),
  MANAGER: new Set<Permission>([
    ...VIEW_ONLY,
    "orders.update",
    "orders.cancel",
    "customers.update",
    "products.update",
    "inventory.update",
    "conversations.reply",
    "conversations.manage",
    "marketing.manage",
    "automations.manage",
    "ai.use",
    "approvals.decide",
    "reports.export",
    "audit.view",
  ]),
  SUPPORT_AGENT: new Set<Permission>([
    "dashboard.view",
    "orders.view",
    "orders.update",
    "customers.view",
    "customers.update",
    "products.view",
    "inventory.view",
    "conversations.view",
    "conversations.reply",
    "conversations.manage",
    "ai.use",
    "approvals.view",
  ]),
  MARKETING_MANAGER: new Set<Permission>([
    "dashboard.view",
    "customers.view",
    "products.view",
    "inventory.view",
    "marketing.view",
    "marketing.manage",
    "marketing.send",
    "ads.view",
    "ads.manage",
    "analytics.view",
    "reports.view",
    "reports.export",
    "ai.use",
    "approvals.view",
    "automations.view",
  ]),
  VIEWER: new Set<Permission>(VIEW_ONLY),
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  SUPPORT_AGENT: "Support Agent",
  MARKETING_MANAGER: "Marketing Manager",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Full access including billing and ownership transfer.",
  ADMIN: "Full operational access and team management.",
  MANAGER: "Runs day-to-day operations and approves AI actions.",
  SUPPORT_AGENT: "Handles conversations, orders and customer issues.",
  MARKETING_MANAGER: "Manages campaigns, segments and Meta advertising.",
  VIEWER: "Read-only access to dashboards and reports.",
};

/** Roles ordered from most to least privileged — used to prevent privilege escalation. */
export const ROLE_RANK: Record<Role, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 60,
  MARKETING_MANAGER: 40,
  SUPPORT_AGENT: 40,
  VIEWER: 10,
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** A user may only assign roles at or below their own rank (owners can assign anything). */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === "OWNER") return true;
  return ROLE_RANK[target] < ROLE_RANK[actor];
}
