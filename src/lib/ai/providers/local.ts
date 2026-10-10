import type { AIProvider, GenerateObjectOptions, RunToolsOptions, RunToolsResult } from "../types";

/**
 * Built-in deterministic "AI" used in demo mode or when no provider key is
 * configured. It never invents data: structured results come from the
 * caller's rule-based fallback, and the assistant routes questions to real
 * tools via the local planner and answers from their output.
 */
export class LocalProvider implements AIProvider {
  readonly name = "local" as const;
  readonly model = "commerceai-rules-v1";

  async generateObject<T>(opts: GenerateObjectOptions<T>): Promise<{ data: T; fellBack: boolean }> {
    return { data: opts.schema.parse(await opts.fallback()), fellBack: false };
  }

  async runTools(opts: RunToolsOptions): Promise<RunToolsResult> {
    const result = await opts.localPlanner(opts.messages, opts.executeTool);
    return { ...result, provider: this.name, model: this.model };
  }
}
