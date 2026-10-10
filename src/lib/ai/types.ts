import type { z } from "zod";

/**
 * Provider-agnostic AI contract. Business logic depends only on this; the
 * concrete provider (OpenAI / Anthropic / Gemini / local) comes from config.
 *
 * Rule: actions are never derived from free-form text. Anything that drives
 * behaviour goes through `generateObject` (schema-validated) or a tool call
 * (schema-validated, permission-checked, audited).
 */
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
};

export type ToolCallRecord = { name: string; input: unknown; output: string; isError?: boolean };

export type GenerateObjectOptions<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
  /** Optional images (vision-capable models). */
  images?: { mimeType: string; base64: string }[];
  /** Deterministic result used by the local provider and as a safety net on provider failure. */
  fallback: () => T | Promise<T>;
};

export type RunToolsOptions = {
  system: string;
  messages: ChatTurn[];
  tools: ToolSpec[];
  executeTool: (name: string, input: unknown) => Promise<{ output: string; isError?: boolean }>;
  maxIterations?: number;
  temperature?: number;
  /** Deterministic planner used by the local provider (and as fallback). */
  localPlanner: (messages: ChatTurn[], execute: RunToolsOptions["executeTool"]) => Promise<{ text: string; toolCalls: ToolCallRecord[] }>;
};

export type RunToolsResult = { text: string; toolCalls: ToolCallRecord[]; provider: string; model: string; fellBack?: boolean };

export interface AIProvider {
  readonly name: "local" | "openai" | "anthropic" | "gemini";
  readonly model: string;
  generateObject<T>(opts: GenerateObjectOptions<T>): Promise<{ data: T; fellBack: boolean }>;
  runTools(opts: RunToolsOptions): Promise<RunToolsResult>;
}
