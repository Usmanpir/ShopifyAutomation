import { ACTIONS_BY_KEY } from "./catalog";
import { NODE_CONFIG_SCHEMAS, type AutomationGraph } from "./types";

export type GraphIssue = { nodeKey?: string; message: string };

/** Structural validation run before an automation can be activated. */
export function validateGraph(graph: AutomationGraph): { errors: GraphIssue[]; warnings: GraphIssue[] } {
  const errors: GraphIssue[] = [];
  const warnings: GraphIssue[] = [];
  const keys = new Set<string>();

  for (const node of graph.nodes) {
    if (keys.has(node.key)) errors.push({ nodeKey: node.key, message: `Duplicate node key "${node.key}"` });
    keys.add(node.key);
    const parsed = NODE_CONFIG_SCHEMAS[node.type].safeParse(node.config);
    if (!parsed.success) {
      errors.push({ nodeKey: node.key, message: `${node.label}: ${parsed.error.issues[0]?.message ?? "invalid configuration"}` });
    }
    if (node.type === "ACTION") {
      const action = (node.config as { action?: string }).action;
      if (action && !ACTIONS_BY_KEY.has(action)) errors.push({ nodeKey: node.key, message: `${node.label}: unknown action "${action}"` });
    }
  }

  const triggers = graph.nodes.filter((n) => n.type === "TRIGGER");
  if (triggers.length === 0) errors.push({ message: "Add a trigger to start the workflow" });
  if (triggers.length > 1) errors.push({ message: "A workflow can only have one trigger" });

  for (const edge of graph.edges) {
    if (!keys.has(edge.source) || !keys.has(edge.target)) errors.push({ message: "A connection points to a missing step" });
    if (edge.source === edge.target) errors.push({ nodeKey: edge.source, message: "A step cannot connect to itself" });
  }

  for (const node of graph.nodes.filter((n) => n.type === "CONDITION")) {
    const handles = new Set(graph.edges.filter((e) => e.source === node.key).map((e) => e.handle));
    if (!handles.has("true") && !handles.has("false")) warnings.push({ nodeKey: node.key, message: `${node.label} has no branches connected` });
  }
  for (const node of graph.nodes.filter((n) => n.type === "TRIGGER" || n.type === "ACTION" || n.type === "WAIT")) {
    if (node.type === "TRIGGER" && !graph.edges.some((e) => e.source === node.key)) {
      errors.push({ nodeKey: node.key, message: "Connect the trigger to a next step" });
    }
  }

  // Cycle detection (DFS)
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (k: string): boolean => {
    state.set(k, 1);
    for (const n of adj.get(k) ?? []) {
      if (state.get(n) === 1) return true;
      if (!state.get(n) && visit(n)) return true;
    }
    state.set(k, 2);
    return false;
  };
  for (const k of keys) if (!state.get(k) && visit(k)) {
    errors.push({ message: "Workflow contains a loop — remove the circular connection" });
    break;
  }

  // Reachability
  if (triggers[0]) {
    const seen = new Set<string>([triggers[0].key]);
    const stack = [triggers[0].key];
    while (stack.length) {
      for (const n of adj.get(stack.pop()!) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    for (const node of graph.nodes) if (!seen.has(node.key)) warnings.push({ nodeKey: node.key, message: `${node.label} is not connected` });
  }

  return { errors, warnings };
}
