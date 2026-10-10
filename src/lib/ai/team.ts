import type { AgentKey } from "@/generated/prisma/enums";

/**
 * "Your AI Team" — the owner-facing view of the agents. Seven technical
 * agents are presented as five assistants with plain job descriptions.
 * Browser-safe (no server imports).
 */
export type TeamMemberKey = "orders" | "customers" | "inventory" | "marketing" | "analyst";

export type TeamMember = {
  key: TeamMemberKey;
  name: string;
  role: string;
  agents: AgentKey[];
  icon: string;
  /** Plain-language duties shown on the team card. */
  does: string[];
  /** Things it will never do without a person approving. */
  asks: string[];
  href: string;
};

export const AI_TEAM: TeamMember[] = [
  {
    key: "orders",
    name: "Order Assistant",
    role: "Checks every order and confirms COD orders on WhatsApp",
    agents: ["ORDER"],
    icon: "package-check",
    does: ["Scores every new order for risk", "Sends WhatsApp confirmations for COD orders", "Confirms orders when the customer replies yes"],
    asks: ["Cancelling any order", "Refunds"],
    href: "/agents/ORDER",
  },
  {
    key: "customers",
    name: "Customer Assistant",
    role: "Answers customers on WhatsApp and opens tickets",
    agents: ["WHATSAPP", "SUPPORT"],
    icon: "message-circle",
    does: ["Answers order status, delivery, price and stock questions", "Hands the chat to your team when unsure or the customer is upset", "Opens tickets for exchanges and returns"],
    asks: ["Discounts that aren't in an active promotion", "Refunds"],
    href: "/agents/WHATSAPP",
  },
  {
    key: "inventory",
    name: "Inventory Assistant",
    role: "Warns you before best-sellers run out",
    agents: ["INVENTORY"],
    icon: "boxes",
    does: ["Measures how fast each product sells", "Forecasts when stock runs out", "Suggests reorder quantities"],
    asks: ["Price changes", "Deleting products"],
    href: "/agents/INVENTORY",
  },
  {
    key: "marketing",
    name: "Marketing Assistant",
    role: "Watches your ads and finds customers to win back",
    agents: ["MARKETING", "ADS"],
    icon: "megaphone",
    does: ["Reviews Meta ad results every day", "Finds customers who stopped buying", "Prepares campaigns and budget changes for you to approve"],
    asks: ["Messages to many customers", "Ad budget changes above your limit", "Pausing campaigns"],
    href: "/agents/MARKETING",
  },
  {
    key: "analyst",
    name: "Business Analyst",
    role: "Explains your numbers and writes the daily report",
    agents: ["BUSINESS"],
    icon: "brain-circuit",
    does: ["Writes the morning briefing and daily report", "Explains why revenue went up or down", "Answers questions in the AI Assistant"],
    asks: [],
    href: "/agents/BUSINESS",
  },
];

const BY_AGENT = new Map<AgentKey, TeamMember>(AI_TEAM.flatMap((m) => m.agents.map((a) => [a, m] as const)));

export function teamMemberFor(agentKey: AgentKey | string | null | undefined): TeamMember | null {
  return agentKey ? (BY_AGENT.get(agentKey as AgentKey) ?? null) : null;
}

const BY_TECH_NAME: Record<string, string> = {
  "Order Agent": "Order Assistant",
  "WhatsApp Agent": "Customer Assistant",
  "Customer Support Agent": "Customer Assistant",
  "Marketing Agent": "Marketing Assistant",
  "Ads Analyst": "Marketing Assistant",
  "Inventory Agent": "Inventory Assistant",
  "Business Analyst": "Business Analyst",
};

/** Owner-facing name from a stored agent name, for records that only carry the name. */
export function friendlyNameFromLabel(name: string | null | undefined, fallback = "AI") {
  return name ? (BY_TECH_NAME[name] ?? name) : fallback;
}

/** Owner-facing name for an agent ("WhatsApp Agent" → "Customer Assistant"). */
export function friendlyAgentName(agentKey: AgentKey | string | null | undefined, fallback = "AI") {
  return teamMemberFor(agentKey)?.name ?? fallback;
}
