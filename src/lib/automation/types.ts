import { z } from "zod";
import { EVENT_TYPE_KEYS } from "@/lib/events/types";

export const NODE_TYPES = ["TRIGGER", "CONDITION", "ACTION", "WAIT", "AI_DECISION", "APPROVAL", "NOTIFICATION"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in", "exists", "not_exists"] as const;
export type Operator = (typeof OPERATORS)[number];

export const conditionRuleSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});
export type ConditionRule = z.infer<typeof conditionRuleSchema>;

export const triggerConfigSchema = z.object({
  event: z.enum(EVENT_TYPE_KEYS as [string, ...string[]]),
  /** Optional filters evaluated before a run starts (e.g. paymentMethod = COD). */
  filters: z.array(conditionRuleSchema).default([]),
});

export const conditionConfigSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  rules: z.array(conditionRuleSchema).min(1),
});

export const actionConfigSchema = z.object({
  action: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const waitConfigSchema = z.object({
  amount: z.number().positive(),
  unit: z.enum(["minutes", "hours", "days"]),
});

export const aiDecisionConfigSchema = z.object({
  question: z.string().min(5),
  outcomes: z.array(z.string().min(1)).min(2).max(5),
  defaultOutcome: z.string().min(1),
});

export const approvalConfigSchema = z.object({
  title: z.string().min(3),
  summary: z.string().default(""),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const notificationConfigSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]).default("INFO"),
  roles: z.array(z.enum(["OWNER", "ADMIN", "MANAGER", "SUPPORT_AGENT", "MARKETING_MANAGER", "VIEWER"])).default([]),
});

export const NODE_CONFIG_SCHEMAS = {
  TRIGGER: triggerConfigSchema,
  CONDITION: conditionConfigSchema,
  ACTION: actionConfigSchema,
  WAIT: waitConfigSchema,
  AI_DECISION: aiDecisionConfigSchema,
  APPROVAL: approvalConfigSchema,
  NOTIFICATION: notificationConfigSchema,
} as const;

export type GraphNode = {
  key: string;
  type: NodeType;
  label: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
};

export type GraphEdge = { source: string; target: string; handle: string };

export type AutomationGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const graphSchema = z.object({
  nodes: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        type: z.enum(NODE_TYPES),
        label: z.string().min(1).max(120),
        config: z.record(z.string(), z.unknown()),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
      }),
    )
    .min(1)
    .max(60),
  edges: z
    .array(z.object({ source: z.string(), target: z.string(), handle: z.string().default("next") }))
    .max(120),
});

export type RunStatus = "RUNNING" | "WAITING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";

export type RunStep = {
  nodeKey: string;
  type: NodeType;
  label: string;
  at: string;
  outcome: string;
  detail?: string;
  output?: Record<string, unknown>;
};

/** Run context: event payload + entity references + outputs from previous steps. */
export type RunContext = {
  event: { type: string; id?: string; payload: Record<string, unknown> };
  vars: Record<string, unknown>;
};

export type RunState = {
  status: RunStatus;
  currentNodeKey: string | null;
  resumeAt: Date | null;
  steps: RunStep[];
  context: RunContext;
  error?: string | null;
};
