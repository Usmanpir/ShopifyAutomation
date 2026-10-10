import { evaluateRule } from "./conditions";
import {
  aiDecisionConfigSchema,
  conditionConfigSchema,
  waitConfigSchema,
  type AutomationGraph,
  type GraphNode,
  type RunContext,
  type RunState,
  type RunStep,
} from "./types";

/**
 * Side effects are injected so the engine is deterministic and testable.
 * The service layer provides real implementations (DB, WhatsApp, AI…).
 */
export interface EngineDeps {
  now(): Date;
  /** Resolve a field like "order.paymentMethod" with fresh data. */
  resolveField(path: string, ctx: RunContext): Promise<unknown>;
  executeAction(node: GraphNode, ctx: RunContext): Promise<{ output?: Record<string, unknown>; detail?: string }>;
  decide(node: GraphNode, ctx: RunContext): Promise<{ outcome: string; confidence: number; reasoning: string }>;
  requestApproval(node: GraphNode, ctx: RunContext): Promise<{ decisionId: string }>;
  notify(node: GraphNode, ctx: RunContext): Promise<void>;
}

export type AdvanceOptions = {
  /** Branch to take when resuming an APPROVAL node ("approved" | "rejected"). */
  resumeHandle?: string;
  maxSteps?: number;
};

const WAIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

export function nextNodeKey(graph: AutomationGraph, from: string, handle = "next"): string | null {
  const edge =
    graph.edges.find((e) => e.source === from && e.handle === handle) ??
    (handle === "next" ? graph.edges.find((e) => e.source === from) : undefined);
  return edge?.target ?? null;
}

function step(node: GraphNode, now: Date, outcome: string, extra: Partial<RunStep> = {}): RunStep {
  return { nodeKey: node.key, type: node.type, label: node.label, at: now.toISOString(), outcome, ...extra };
}

/**
 * Advances a run as far as possible. Returns the new state; the caller persists it.
 * Stops on WAIT (status WAITING + resumeAt), APPROVAL (AWAITING_APPROVAL),
 * completion, failure, or the step limit (cycle protection).
 */
export async function advanceRun(graph: AutomationGraph, input: RunState, deps: EngineDeps, opts: AdvanceOptions = {}): Promise<RunState> {
  const state: RunState = { ...input, steps: [...input.steps], context: { ...input.context, vars: { ...input.context.vars } } };
  const maxSteps = opts.maxSteps ?? 50;
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));

  if (!state.currentNodeKey) {
    const trigger = graph.nodes.find((n) => n.type === "TRIGGER");
    if (!trigger) return { ...state, status: "FAILED", error: "Workflow has no trigger" };
    state.currentNodeKey = trigger.key;
  }

  let resumeHandle = opts.resumeHandle;
  let executed = 0;

  while (state.currentNodeKey) {
    if (executed++ >= maxSteps) {
      return { ...state, status: "FAILED", error: `Step limit (${maxSteps}) reached — check for loops` };
    }
    const node = byKey.get(state.currentNodeKey);
    if (!node) return { ...state, status: "FAILED", error: `Node ${state.currentNodeKey} not found` };
    const now = deps.now();
    let handle = "next";

    try {
      switch (node.type) {
        case "TRIGGER": {
          state.steps.push(step(node, now, "triggered", { detail: state.context.event.type }));
          break;
        }
        case "CONDITION": {
          const cfg = conditionConfigSchema.parse(node.config);
          const results: boolean[] = [];
          for (const rule of cfg.rules) {
            results.push(evaluateRule(await deps.resolveField(rule.field, state.context), rule));
          }
          const pass = cfg.match === "all" ? results.every(Boolean) : results.some(Boolean);
          handle = pass ? "true" : "false";
          state.steps.push(step(node, now, handle));
          break;
        }
        case "ACTION": {
          const result = await deps.executeAction(node, state.context);
          if (result.output) state.context.vars[node.key] = result.output;
          state.steps.push(step(node, now, "done", { detail: result.detail, output: result.output }));
          break;
        }
        case "WAIT": {
          const cfg = waitConfigSchema.parse(node.config);
          const resuming = input.status === "WAITING" && input.currentNodeKey === node.key && executed === 1;
          if (!resuming) {
            const resumeAt = new Date(now.getTime() + cfg.amount * WAIT_MS[cfg.unit]);
            state.steps.push(step(node, now, "waiting", { detail: `Until ${resumeAt.toISOString()}` }));
            return { ...state, status: "WAITING", resumeAt };
          }
          if (input.resumeAt && now < input.resumeAt) {
            return { ...state, status: "WAITING" }; // woke up early; keep waiting
          }
          state.steps.push(step(node, now, "resumed"));
          state.resumeAt = null;
          break;
        }
        case "APPROVAL": {
          if (resumeHandle && input.status === "AWAITING_APPROVAL" && input.currentNodeKey === node.key) {
            handle = resumeHandle;
            resumeHandle = undefined;
            state.steps.push(step(node, now, handle));
            break;
          }
          const { decisionId } = await deps.requestApproval(node, state.context);
          state.context.vars[node.key] = { decisionId };
          state.steps.push(step(node, now, "awaiting_approval", { output: { decisionId } }));
          return { ...state, status: "AWAITING_APPROVAL" };
        }
        case "AI_DECISION": {
          const cfg = aiDecisionConfigSchema.parse(node.config);
          const decision = await deps.decide(node, state.context);
          const outcome = cfg.outcomes.includes(decision.outcome) ? decision.outcome : cfg.defaultOutcome;
          state.context.vars[node.key] = { outcome, confidence: decision.confidence, reasoning: decision.reasoning };
          handle = outcome;
          state.steps.push(step(node, now, outcome, { detail: decision.reasoning }));
          break;
        }
        case "NOTIFICATION": {
          await deps.notify(node, state.context);
          state.steps.push(step(node, now, "sent"));
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.steps.push(step(node, now, "error", { detail: message }));
      return { ...state, status: "FAILED", error: `${node.label}: ${message}` };
    }

    state.currentNodeKey = nextNodeKey(graph, node.key, handle);
  }

  return { ...state, status: "COMPLETED", currentNodeKey: null, resumeAt: null };
}

export function initialRunState(context: RunContext): RunState {
  return { status: "RUNNING", currentNodeKey: null, resumeAt: null, steps: [], context };
}
