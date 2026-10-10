import type { z } from "zod";
import type { AgentKey } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/rbac";
import type { ServiceContext } from "@/lib/service-context";
import type { EvidenceItem } from "@/services/decision.service";

export type ToolKind = "read" | "write" | "sensitive";

export type ApprovalRequest = {
  title: string;
  summary: string;
  reasoning: string;
  evidence: EvidenceItem[];
  expectedImpact?: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  relatedType?: string;
  relatedId?: string;
};

export type ToolDefinition<I = unknown> = {
  name: string;
  description: string;
  input: z.ZodType<I>;
  /** Permission a human must hold to invoke the tool (via assistant or approval). */
  permission: Permission;
  kind: ToolKind;
  /**
   * For write tools whose sensitivity depends on input (e.g. budget change %).
   * Returning an ApprovalRequest routes the call to the Approval Center.
   */
  requiresApproval?: (input: I, ctx: ServiceContext) => Promise<ApprovalRequest | null>;
  /** Approval card copy for always-sensitive tools. */
  describeApproval?: (input: I, ctx: ServiceContext) => Promise<ApprovalRequest>;
  /** Default agent attribution for approvals. */
  agent?: AgentKey;
  handler: (ctx: ServiceContext, input: I) => Promise<unknown>;
};

export function defineTool<I>(def: ToolDefinition<I>): ToolDefinition<I> {
  return def;
}
