import { EVENT_TYPES, isEventType } from "@/lib/events/types";
import { ACTIONS_BY_KEY, CONDITION_FIELDS, NODE_META } from "./catalog";
import { NODE_CONFIG_SCHEMAS, type AutomationGraph, type ConditionRule, type GraphNode, type NodeType, type Operator } from "./types";
import { validateGraph, type GraphIssue } from "./validate";

/**
 * Pure, client-safe helpers that describe a workflow graph for humans:
 * one-line node summaries, branch handles, friendly validation messages,
 * defaults for new steps and a linear "reading order" for previews.
 */

export const OPERATOR_LABELS: Record<Operator, { label: string; symbol: string }> = {
  eq: { label: "equals", symbol: "=" },
  neq: { label: "does not equal", symbol: "≠" },
  gt: { label: "greater than", symbol: ">" },
  gte: { label: "at least", symbol: "≥" },
  lt: { label: "less than", symbol: "<" },
  lte: { label: "at most", symbol: "≤" },
  contains: { label: "contains", symbol: "contains" },
  in: { label: "is one of", symbol: "in" },
  exists: { label: "is set", symbol: "is set" },
  not_exists: { label: "is empty", symbol: "is empty" },
};

export const VALUELESS_OPERATORS: Operator[] = ["exists", "not_exists"];

export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fieldLabel(field: string): string {
  const f = CONDITION_FIELDS.find((c) => c.value === field);
  if (!f) return field;
  return f.label.split("·").pop()!.trim();
}

export function eventLabel(event: unknown): string {
  return typeof event === "string" && isEventType(event) ? EVENT_TYPES[event].label : "Choose an event";
}

function ruleSummary(rule: Partial<ConditionRule>): string {
  const op = rule.operator ? OPERATOR_LABELS[rule.operator] : null;
  const field = rule.field ? fieldLabel(rule.field) : "Field";
  if (!op) return field;
  if (rule.operator && VALUELESS_OPERATORS.includes(rule.operator)) return `${field} ${op.symbol}`;
  const value = Array.isArray(rule.value) ? rule.value.join(", ") : rule.value === undefined || rule.value === "" ? "…" : String(rule.value);
  return `${field} ${op.symbol} ${humanizeEnum(value)}`;
}

/** Enum-ish values (COD, PENDING_CONFIRMATION) read better title-cased, except short acronyms. */
function humanizeEnum(v: string): string {
  if (/^[A-Z]{2,4}$/.test(v)) return v;
  if (/^[A-Z][A-Z_]+$/.test(v)) return humanize(v);
  return v;
}

const plural = (n: number, unit: string) => `${n} ${n === 1 ? unit.replace(/s$/, "") : unit}`;

/** One-line, human summary of a node's configuration (shown on canvas cards). */
export function summarizeNode(node: Pick<GraphNode, "type" | "config">): string {
  const c = node.config as Record<string, unknown>;
  switch (node.type) {
    case "TRIGGER": {
      const filters = Array.isArray(c.filters) ? c.filters.length : 0;
      return `${eventLabel(c.event)}${filters ? ` · ${plural(filters, "filters")}` : ""}`;
    }
    case "CONDITION": {
      const rules = (Array.isArray(c.rules) ? c.rules : []) as Partial<ConditionRule>[];
      if (!rules.length) return "Add a rule";
      return rules.map(ruleSummary).join(c.match === "any" ? " or " : " and ");
    }
    case "ACTION": {
      const def = typeof c.action === "string" ? ACTIONS_BY_KEY.get(c.action) : undefined;
      return def ? def.label : "Choose an action";
    }
    case "WAIT": {
      const amount = Number(c.amount);
      return amount > 0 ? `Wait ${plural(amount, String(c.unit ?? "hours"))}` : "Set a duration";
    }
    case "AI_DECISION": {
      const outcomes = Array.isArray(c.outcomes) ? (c.outcomes as string[]) : [];
      return outcomes.length ? `AI: ${outcomes.join(" / ")}` : "Add outcomes";
    }
    case "APPROVAL": {
      const risk = typeof c.risk === "string" ? humanize(c.risk) : "Medium";
      return `${risk} risk · ${c.title ? String(c.title) : "Untitled request"}`;
    }
    case "NOTIFICATION": {
      const roles = Array.isArray(c.roles) ? (c.roles as string[]) : [];
      const who = roles.length ? roles.map(humanize).join(", ") : "Everyone";
      return `Notify ${who}${c.severity && c.severity !== "INFO" ? ` · ${humanize(String(c.severity))}` : ""}`;
    }
  }
}

export type HandleDef = { id: string; label: string; tone?: "success" | "danger" | "neutral" };

/** Source handles (branches) a node exposes. Edges store the handle id. */
export function sourceHandles(node: Pick<GraphNode, "type" | "config">): HandleDef[] {
  switch (node.type) {
    case "CONDITION":
      return [
        { id: "true", label: "Yes", tone: "success" },
        { id: "false", label: "No", tone: "danger" },
      ];
    case "APPROVAL":
      return [
        { id: "approved", label: "Approved", tone: "success" },
        { id: "rejected", label: "Rejected", tone: "danger" },
      ];
    case "AI_DECISION": {
      const outcomes = (node.config as { outcomes?: unknown }).outcomes;
      const list = Array.isArray(outcomes) ? [...new Set(outcomes.filter((o): o is string => typeof o === "string" && o.length > 0))] : [];
      return list.map((o) => ({ id: o, label: humanize(o), tone: "neutral" }));
    }
    default:
      return [{ id: "next", label: "" }];
  }
}

export function handleLabel(node: Pick<GraphNode, "type" | "config"> | undefined, handle: string): string {
  if (!node || handle === "next") return "";
  return sourceHandles(node).find((h) => h.id === handle)?.label ?? humanize(handle);
}

/** Sensible starting configuration for a new step of each type. */
export function defaultConfig(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "TRIGGER":
      return { event: "ORDER_CREATED", filters: [] };
    case "CONDITION":
      return { match: "all", rules: [{ field: "order.paymentMethod", operator: "eq", value: "COD" }] };
    case "ACTION":
      return { action: "", params: {} };
    case "WAIT":
      return { amount: 1, unit: "hours" };
    case "AI_DECISION":
      return { question: "", outcomes: ["yes", "no"], defaultOutcome: "no" };
    case "APPROVAL":
      return { title: "Approve {{order.name}}", summary: "", risk: "MEDIUM" };
    case "NOTIFICATION":
      return { title: "", body: "", severity: "INFO", roles: ["OWNER", "ADMIN"] };
  }
}

export function defaultLabel(type: NodeType): string {
  switch (type) {
    case "TRIGGER":
      return "New order";
    case "CONDITION":
      return "Check condition";
    case "ACTION":
      return "New action";
    case "WAIT":
      return "Wait 1 hour";
    case "AI_DECISION":
      return "AI decision";
    case "APPROVAL":
      return "Request approval";
    case "NOTIFICATION":
      return "Notify team";
  }
}

export function newNodeKey(type: NodeType, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const base = type.toLowerCase();
  for (let i = 1; i < 1000; i++) {
    const key = `${base}_${i}`;
    if (!taken.has(key)) return key;
  }
  return `${base}_${Date.now().toString(36)}`;
}

/** Field-level, plain-language problems with a node's configuration. */
export function nodeConfigIssues(node: Pick<GraphNode, "type" | "config">): { errors: string[]; warnings: string[] } {
  const c = node.config as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];
  switch (node.type) {
    case "TRIGGER":
      if (typeof c.event !== "string" || !isEventType(c.event)) errors.push("Choose the event that starts this workflow");
      ((c.filters as Partial<ConditionRule>[] | undefined) ?? []).forEach((r, i) => {
        if (!r.field) errors.push(`Filter ${i + 1}: choose a field`);
        else if (r.operator && !VALUELESS_OPERATORS.includes(r.operator) && (r.value === undefined || r.value === "")) warnings.push(`Filter ${i + 1}: add a value`);
      });
      break;
    case "CONDITION": {
      const rules = (c.rules as Partial<ConditionRule>[] | undefined) ?? [];
      if (!rules.length) errors.push("Add at least one rule");
      rules.forEach((r, i) => {
        if (!r.field) errors.push(`Rule ${i + 1}: choose a field`);
        else if (r.operator && !VALUELESS_OPERATORS.includes(r.operator) && (r.value === undefined || r.value === "")) warnings.push(`Rule ${i + 1}: add a value to compare against`);
      });
      break;
    }
    case "ACTION": {
      const def = typeof c.action === "string" && c.action ? ACTIONS_BY_KEY.get(c.action) : undefined;
      if (!c.action) errors.push("Choose an action");
      else if (!def) errors.push(`Unknown action "${String(c.action)}"`);
      else {
        const params = (c.params ?? {}) as Record<string, unknown>;
        for (const p of def.params) if (p.required && (params[p.key] === undefined || params[p.key] === "")) warnings.push(`${p.label} is required`);
      }
      break;
    }
    case "WAIT":
      if (!(Number(c.amount) > 0)) errors.push("Wait duration must be more than 0");
      break;
    case "AI_DECISION": {
      const outcomes = Array.isArray(c.outcomes) ? (c.outcomes as string[]) : [];
      if (typeof c.question !== "string" || c.question.trim().length < 5) errors.push("Write the question the AI should answer (5+ characters)");
      if (outcomes.length < 2) errors.push("Add at least two outcomes");
      if (outcomes.length > 5) errors.push("Use at most five outcomes");
      if (!c.defaultOutcome) errors.push("Choose a default outcome");
      else if (!outcomes.includes(String(c.defaultOutcome))) warnings.push("Default outcome isn't one of the outcomes");
      break;
    }
    case "APPROVAL":
      if (typeof c.title !== "string" || c.title.trim().length < 3) errors.push("Give the approval request a title (3+ characters)");
      break;
    case "NOTIFICATION":
      if (typeof c.title !== "string" || !c.title.trim()) errors.push("Add a notification title");
      break;
  }
  // Safety net: anything the schema still rejects.
  if (!errors.length && !NODE_CONFIG_SCHEMAS[node.type].safeParse(node.config).success) errors.push("Configuration is incomplete");
  return { errors, warnings };
}

export type FriendlyIssue = GraphIssue & { severity: "error" | "warning" };

/**
 * validateGraph with plain-language, field-level messages for node
 * configuration problems. Structural checks are passed through unchanged.
 */
export function describeGraphIssues(graph: AutomationGraph): { errors: FriendlyIssue[]; warnings: FriendlyIssue[] } {
  const base = validateGraph(graph);
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const errors: FriendlyIssue[] = [];
  const warnings: FriendlyIssue[] = [];
  for (const issue of base.errors) {
    const node = issue.nodeKey ? byKey.get(issue.nodeKey) : undefined;
    // Node configuration errors are replaced by the field-level messages below.
    if (node && issue.message.startsWith(`${node.label}: `)) continue;
    errors.push({ ...issue, severity: "error" });
  }
  for (const node of graph.nodes) {
    if (!node.label.trim()) errors.push({ nodeKey: node.key, message: `A ${NODE_META[node.type].label.toLowerCase()} step needs a name`, severity: "error" });
    const r = nodeConfigIssues(node);
    for (const m of r.errors) errors.push({ nodeKey: node.key, message: `${node.label}: ${m}`, severity: "error" });
    for (const m of r.warnings) warnings.push({ nodeKey: node.key, message: `${node.label}: ${m}`, severity: "warning" });
  }
  for (const w of base.warnings) warnings.push({ ...w, severity: "warning" });

  // Branch handles pointing at outcomes that no longer exist.
  for (const e of graph.edges) {
    const src = byKey.get(e.source);
    if (src && !sourceHandles(src).some((h) => h.id === e.handle)) {
      warnings.push({ nodeKey: src.key, message: `${src.label}: a connection uses a branch that no longer exists ("${e.handle}")`, severity: "warning" });
    }
  }
  return { errors, warnings };
}

/**
 * Nodes in reading order: breadth-first from the trigger following branches
 * in handle order, then any unreachable nodes. Used for previews and the
 * mobile step list.
 */
export function orderedNodes(graph: AutomationGraph): { node: GraphNode; depth: number; via?: { from: string; handle: string } }[] {
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const trigger = graph.nodes.find((n) => n.type === "TRIGGER");
  const out: { node: GraphNode; depth: number; via?: { from: string; handle: string } }[] = [];
  const seen = new Set<string>();
  const queue: { key: string; depth: number; via?: { from: string; handle: string } }[] = trigger ? [{ key: trigger.key, depth: 0 }] : [];
  while (queue.length) {
    const { key, depth, via } = queue.shift()!;
    if (seen.has(key)) continue;
    const node = byKey.get(key);
    if (!node) continue;
    seen.add(key);
    out.push({ node, depth, via });
    const order = sourceHandles(node).map((h) => h.id);
    const outs = graph.edges
      .filter((e) => e.source === key)
      .sort((a, b) => (order.indexOf(a.handle) === -1 ? 99 : order.indexOf(a.handle)) - (order.indexOf(b.handle) === -1 ? 99 : order.indexOf(b.handle)));
    for (const e of outs) if (!seen.has(e.target)) queue.push({ key: e.target, depth: depth + 1, via: { from: key, handle: e.handle } });
  }
  for (const n of graph.nodes) if (!seen.has(n.key)) out.push({ node: n, depth: 0 });
  return out;
}

/** Short verb shown in template previews ("WHEN", "IF", "SEND"…). */
export function nodeVerb(node: Pick<GraphNode, "type" | "config">): string {
  switch (node.type) {
    case "TRIGGER":
      return "When";
    case "CONDITION":
      return "If";
    case "ACTION": {
      const def = ACTIONS_BY_KEY.get(String((node.config as { action?: string }).action ?? ""));
      return def && (def.category === "WhatsApp" || def.key.startsWith("send_")) ? "Send" : "Do";
    }
    case "WAIT":
      return "Wait";
    case "AI_DECISION":
      return "Ask AI";
    case "APPROVAL":
      return "Approve";
    case "NOTIFICATION":
      return "Notify";
  }
}

export function nodeTypeLabel(type: NodeType): string {
  return NODE_META[type].label;
}
