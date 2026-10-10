import { TEMPLATES_BY_KEY } from "./templates";
import type { AutomationGraph } from "./types";

/**
 * Automation wizard recipes: plain-language goals that compile to the same
 * graphs the builder uses (so anything made here can be opened in the
 * Advanced editor later). Browser-safe.
 */
export type RecipeChoice = { id: string; label: string; options: { value: string; label: string }[]; default: string };
export type Recipe = {
  key: string;
  goal: string;
  description: string;
  when: string;
  /** "When" choices (timing). */
  timing: RecipeChoice[];
  /** "What should AI do" choices. */
  actions: RecipeChoice[];
  /** Short safety note shown on review. */
  safety: string;
  templateKey: string;
  build: (opts: Record<string, string>) => { name: string; description: string; graph: AutomationGraph };
};

function clone(key: string): AutomationGraph {
  const t = TEMPLATES_BY_KEY.get(key);
  if (!t) throw new Error(`Unknown template ${key}`);
  return JSON.parse(JSON.stringify(t.graph)) as AutomationGraph;
}
function setWait(g: AutomationGraph, nodeKey: string, amount: number, unit: "hours" | "days") {
  const n = g.nodes.find((x) => x.key === nodeKey);
  if (n) {
    n.config = { amount, unit };
    n.label = `Wait ${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
  }
}
/** Removes a node and reconnects its single incoming edge to its outgoing target(s). */
function dropNode(g: AutomationGraph, key: string) {
  const incoming = g.edges.filter((e) => e.target === key);
  const outgoing = g.edges.filter((e) => e.source === key);
  g.edges = g.edges.filter((e) => e.source !== key && e.target !== key);
  for (const i of incoming) for (const o of outgoing) g.edges.push({ source: i.source, target: o.target, handle: i.handle });
  g.nodes = g.nodes.filter((n) => n.key !== key);
}
/** Removes a node and everything only reachable through it. */
function dropBranch(g: AutomationGraph, key: string) {
  const doomed = new Set([key]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of g.edges) {
      if (doomed.has(e.source) && !doomed.has(e.target) && !g.edges.some((x) => x.target === e.target && !doomed.has(x.source))) {
        doomed.add(e.target);
        grew = true;
      }
    }
  }
  g.nodes = g.nodes.filter((n) => !doomed.has(n.key));
  g.edges = g.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
}

export const RECIPES: Recipe[] = [
  {
    key: "confirm-cod",
    goal: "Confirm COD orders on WhatsApp",
    description: "Ask every cash-on-delivery customer to confirm before you ship.",
    when: "A new order is placed with cash on delivery",
    timing: [{ id: "remind", label: "If there's no reply, remind after", options: [{ value: "1", label: "1 hour" }, { value: "2", label: "2 hours" }, { value: "4", label: "4 hours" }], default: "2" }],
    actions: [
      { id: "review", label: "If still no reply", options: [{ value: "review", label: "Send to my review list after 12 more hours" }, { value: "none", label: "Do nothing more" }], default: "review" },
    ],
    safety: "Only the customer who placed the order is messaged. Orders are never cancelled automatically.",
    templateKey: "cod-confirmation",
    build: (o) => {
      const g = clone("cod-confirmation");
      setWait(g, "wait_2h", Number(o.remind ?? 2), "hours");
      if (o.review === "none") dropBranch(g, "wait_12h");
      return { name: "Confirm COD orders on WhatsApp", description: `WhatsApp confirmation for every COD order, reminder after ${o.remind ?? 2} h${o.review === "none" ? "" : ", then manual review"}.`, graph: g };
    },
  },
  {
    key: "review-after-delivery",
    goal: "Ask for a review after delivery",
    description: "Collect reviews while the purchase is fresh.",
    when: "An order is delivered",
    timing: [{ id: "wait", label: "Send the request after", options: [{ value: "1", label: "1 day" }, { value: "3", label: "3 days" }, { value: "7", label: "7 days" }], default: "3" }],
    actions: [{ id: "skip", label: "Skip if the order was returned", options: [{ value: "yes", label: "Yes, skip returned orders" }, { value: "no", label: "No, ask everyone" }], default: "yes" }],
    safety: "One message per delivered order, respecting your daily message limit per customer.",
    templateKey: "review-request",
    build: (o) => {
      const g = clone("review-request");
      setWait(g, "wait_3d", Number(o.wait ?? 3), "days");
      if (o.skip === "no") dropNode(g, "not_returned");
      return { name: "Ask for a review after delivery", description: `Review request ${o.wait ?? 3} day(s) after delivery.`, graph: g };
    },
  },
  {
    key: "tracking",
    goal: "Send tracking when an order ships",
    description: "Customers get their tracking number automatically — fewer “where is my order?” chats.",
    when: "A shipment is booked with the courier",
    timing: [],
    actions: [],
    safety: "Only the customer of that order is messaged.",
    templateKey: "delivery-notification",
    build: () => ({ name: "Send tracking when an order ships", description: "Tracking details on WhatsApp as soon as a shipment is booked.", graph: clone("delivery-notification") }),
  },
  {
    key: "low-stock",
    goal: "Warn me before stock runs out",
    description: "Get an alert with the AI's reorder suggestion when a variant runs low.",
    when: "A variant drops below its low-stock threshold",
    timing: [],
    actions: [{ id: "who", label: "Who should be told", options: [{ value: "owners", label: "Owners and admins" }, { value: "managers", label: "Owners, admins and managers" }], default: "managers" }],
    safety: "Read-only: nothing in your store changes. Price changes always need your approval.",
    templateKey: "low-inventory",
    build: (o) => {
      const g = clone("low-inventory");
      const n = g.nodes.find((x) => x.key === "notify");
      if (n) n.config = { ...(n.config as object), roles: o.who === "owners" ? ["OWNER", "ADMIN"] : ["OWNER", "ADMIN", "MANAGER"] };
      return { name: "Warn me before stock runs out", description: "Low-stock alert with an AI reorder suggestion.", graph: g };
    },
  },
  {
    key: "win-back",
    goal: "Win back inactive customers",
    description: "When a customer hasn't bought in 60 days, prepare a win-back campaign for your approval.",
    when: "A customer hasn't ordered for 60 days",
    timing: [],
    actions: [],
    safety: "Campaigns to many customers always wait for your approval before anything is sent.",
    templateKey: "inactive-customer",
    build: () => ({ name: "Win back inactive customers", description: "Inactive customers are segmented and a win-back campaign is prepared for approval.", graph: clone("inactive-customer") }),
  },
  {
    key: "high-risk",
    goal: "Double-check high-risk orders",
    description: "AI looks at risky orders; anything that would hold an order waits for a manager.",
    when: "An order is flagged as high risk",
    timing: [],
    actions: [],
    safety: "AI never cancels orders. Holding an order needs a manager's approval.",
    templateKey: "high-risk-review",
    build: () => ({ name: "Double-check high-risk orders", description: "AI review of high-risk orders with manager approval before holding.", graph: clone("high-risk-review") }),
  },
];

export const RECIPES_BY_KEY = new Map(RECIPES.map((r) => [r.key, r]));
