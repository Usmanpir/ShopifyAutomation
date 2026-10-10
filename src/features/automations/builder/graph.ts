import type { Edge, Node } from "@xyflow/react";
import { sourceHandles } from "@/lib/automation/describe";
import type { AutomationGraph, GraphNode, NodeType } from "@/lib/automation/types";

export type StepData = { type: NodeType; label: string; config: Record<string, unknown> };
export type StepNode = Node<StepData, "step">;
export type BranchEdge = Edge<{ tone?: "success" | "danger" | "neutral" }, "branch">;

export const NODE_WIDTH = 264;
export const ROW_GAP = 160;
export const COL_GAP = 300;

export const edgeId = (source: string, handle: string, target: string) => `${source}:${handle}->${target}`;

export function toFlowNodes(graph: AutomationGraph): StepNode[] {
  return graph.nodes.map((n, i) => ({
    id: n.key,
    type: "step",
    position: n.position ?? { x: 280, y: 40 + i * ROW_GAP },
    data: { type: n.type, label: n.label, config: n.config ?? {} },
    ariaLabel: `${n.label} (${n.type.toLowerCase().replace("_", " ")} step)`,
    deletable: true,
  }));
}

/** Converts graph edges, dropping edges whose source handle no longer exists. */
export function toFlowEdges(graph: AutomationGraph): BranchEdge[] {
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  return graph.edges
    .filter((e) => {
      const src = byKey.get(e.source);
      return src && byKey.has(e.target) && sourceHandles(src).some((h) => h.id === (e.handle || "next"));
    })
    .map((e) => ({ id: edgeId(e.source, e.handle || "next", e.target), source: e.source, target: e.target, sourceHandle: e.handle || "next", type: "branch" }));
}

export function toGraph(nodes: StepNode[], edges: BranchEdge[]): AutomationGraph {
  return {
    nodes: nodes.map(
      (n): GraphNode => ({ key: n.id, type: n.data.type, label: n.data.label, config: n.data.config, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }),
    ),
    edges: edges.map((e) => ({ source: e.source, target: e.target, handle: e.sourceHandle ?? "next" })),
  };
}

/** Stable fingerprint for dirty checking (ignores selection/measurement state). */
export function fingerprint(name: string, description: string, graph: AutomationGraph): string {
  return JSON.stringify({ name: name.trim(), description: description.trim(), graph });
}

/** True when any two nodes overlap (e.g. templates with tight spacing). */
export function hasOverlaps(nodes: StepNode[]): boolean {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].position;
      const b = nodes[j].position;
      if (Math.abs(a.x - b.x) < NODE_WIDTH + 16 && Math.abs(a.y - b.y) < 140) return true;
    }
  return false;
}

/**
 * Tidy top-down layout: rows by longest path from the trigger, columns from a
 * spanning tree whose children are ordered by branch (Yes before No…).
 */
export function layoutNodes(nodes: StepNode[], edges: BranchEdge[]): StepNode[] {
  if (!nodes.length) return nodes;
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const handleOrder = (e: BranchEdge) => {
    const src = byId.get(e.source);
    const idx = src ? sourceHandles(src.data).findIndex((h) => h.id === (e.sourceHandle ?? "next")) : 0;
    return idx < 0 ? 99 : idx;
  };
  const outs = new Map<string, BranchEdge[]>();
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target)) outs.set(e.source, [...(outs.get(e.source) ?? []), e]);
  for (const list of outs.values()) list.sort((a, b) => handleOrder(a) - handleOrder(b));

  const root = nodes.find((n) => n.data.type === "TRIGGER") ?? nodes[0];

  // Rows: longest path (bounded relaxation keeps cycles from looping forever).
  const depth = new Map<string, number>([[root.id, 0]]);
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const d = depth.get(e.source);
      if (d === undefined || !ids.has(e.target)) continue;
      if ((depth.get(e.target) ?? -1) < d + 1 && d + 1 < nodes.length) {
        depth.set(e.target, d + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Spanning tree (BFS, branch order) for horizontal placement.
  const children = new Map<string, string[]>();
  const seen = new Set([root.id]);
  const queue = [root.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of outs.get(id) ?? []) {
      if (seen.has(e.target)) continue;
      seen.add(e.target);
      children.set(id, [...(children.get(id) ?? []), e.target]);
      queue.push(e.target);
    }
  }
  const width = new Map<string, number>();
  const measure = (id: string): number => {
    const w = Math.max(1, (children.get(id) ?? []).reduce((s, c) => s + measure(c), 0));
    width.set(id, w);
    return w;
  };
  measure(root.id);
  const col = new Map<string, number>();
  const place = (id: string, left: number) => {
    const kids = children.get(id) ?? [];
    col.set(id, left + (width.get(id)! - 1) / 2);
    let x = left;
    for (const k of kids) {
      place(k, x);
      x += width.get(k)!;
    }
  };
  place(root.id, 0);

  // Unreachable nodes go in a column to the right, in their current vertical order.
  const maxCol = Math.max(...col.values());
  const loose = nodes.filter((n) => !col.has(n.id)).sort((a, b) => a.position.y - b.position.y);
  loose.forEach((n, i) => {
    col.set(n.id, maxCol + 1.5);
    depth.set(n.id, i);
  });

  const rootCol = col.get(root.id)!;
  return nodes.map((n) => ({ ...n, position: { x: 280 + (col.get(n.id)! - rootCol) * COL_GAP, y: 40 + (depth.get(n.id) ?? 0) * ROW_GAP } }));
}

/** Finds a free spot near `pos` so new nodes don't land on top of existing ones. */
export function freeSpot(nodes: StepNode[], pos: { x: number; y: number }): { x: number; y: number } {
  const p = { ...pos };
  for (let i = 0; i < 20; i++) {
    const hit = nodes.some((n) => Math.abs(n.position.x - p.x) < NODE_WIDTH - 24 && Math.abs(n.position.y - p.y) < 96);
    if (!hit) return p;
    p.x += COL_GAP;
  }
  return p;
}
