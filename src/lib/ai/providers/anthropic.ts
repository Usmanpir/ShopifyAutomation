import Anthropic from "@anthropic-ai/sdk";
import { extractJson, toStrictJsonSchema } from "../json-schema";
import type { AIProvider, GenerateObjectOptions, RunToolsOptions, RunToolsResult, ToolCallRecord } from "../types";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

/**
 * Anthropic Claude provider. Structured output via `output_config.format`
 * (json_schema); tools via a manual tool-use loop so every call passes
 * through our permission + audit layer. Server-side refusal fallbacks are
 * enabled (`fallbacks: "default"`).
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string, readonly model: string = ANTHROPIC_DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  async generateObject<T>(opts: GenerateObjectOptions<T>): Promise<{ data: T; fellBack: boolean }> {
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: opts.system,
        messages: [
          {
            role: "user",
            content: [
              ...(opts.images ?? []).map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: img.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: img.base64 },
              })),
              { type: "text" as const, text: opts.prompt },
            ],
          },
        ],
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: toStrictJsonSchema(opts.schema) },
        },
      });
      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
        throw new Error(`Anthropic stopped: ${response.stop_reason}`);
      }
      const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return { data: opts.schema.parse(extractJson(text)), fellBack: false };
    } catch (err) {
      console.warn("[ai:anthropic] generateObject failed, using fallback:", (err as Error).message);
      return { data: await opts.fallback(), fellBack: true };
    }
  }

  async runTools(opts: RunToolsOptions): Promise<RunToolsResult> {
    const tools = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    }));
    const messages: Anthropic.Beta.BetaMessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
    const toolCalls: ToolCallRecord[] = [];

    try {
      for (let i = 0; i < (opts.maxIterations ?? 6); i++) {
        const response = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: opts.system,
          tools,
          messages,
          output_config: { effort: "medium" },
        });

        if (response.stop_reason === "refusal") {
          return { text: "I can't help with that request.", toolCalls, provider: this.name, model: this.model };
        }
        // Keep the full content (incl. thinking blocks) so the conversation stays valid.
        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "pause_turn") continue;
        if (response.stop_reason !== "tool_use") {
          const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
          return { text, toolCalls, provider: this.name, model: this.model };
        }

        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          const { output, isError } = await opts.executeTool(block.name, block.input);
          toolCalls.push({ name: block.name, input: block.input, output, isError });
          results.push({ type: "tool_result", tool_use_id: block.id, content: output, is_error: isError });
        }
        // All results for one turn go back in a single user message.
        messages.push({ role: "user", content: results });
      }
      return { text: "I gathered the data but ran out of steps. Try a more specific question.", toolCalls, provider: this.name, model: this.model };
    } catch (err) {
      console.warn("[ai:anthropic] runTools failed, using local planner:", (err as Error).message);
      const local = await opts.localPlanner(opts.messages, opts.executeTool);
      return { ...local, provider: this.name, model: this.model, fellBack: true };
    }
  }
}
