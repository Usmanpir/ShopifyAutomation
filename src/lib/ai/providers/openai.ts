import OpenAI from "openai";
import { extractJson, toStrictJsonSchema } from "../json-schema";
import type { AIProvider, GenerateObjectOptions, RunToolsOptions, RunToolsResult, ToolCallRecord } from "../types";

export const OPENAI_DEFAULT_MODEL = "gpt-5";

/** OpenAI provider via Chat Completions (structured outputs + function calling). */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  private client: OpenAI;

  constructor(apiKey: string, readonly model: string = OPENAI_DEFAULT_MODEL) {
    this.client = new OpenAI({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  async generateObject<T>(opts: GenerateObjectOptions<T>): Promise<{ data: T; fellBack: boolean }> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: opts.system },
          {
            role: "user",
            content: [
              ...(opts.images ?? []).map((img) => ({ type: "image_url" as const, image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })),
              { type: "text" as const, text: opts.prompt },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, strict: true, schema: toStrictJsonSchema(opts.schema) },
        },
      });
      const text = res.choices[0]?.message?.content ?? "";
      return { data: opts.schema.parse(extractJson(text)), fellBack: false };
    } catch (err) {
      console.warn("[ai:openai] generateObject failed, using fallback:", (err as Error).message);
      return { data: await opts.fallback(), fellBack: true };
    }
  }

  async runTools(opts: RunToolsOptions): Promise<RunToolsResult> {
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
    ];
    const toolCalls: ToolCallRecord[] = [];
    try {
      for (let i = 0; i < (opts.maxIterations ?? 6); i++) {
        const res = await this.client.chat.completions.create({ model: this.model, messages, tools });
        const msg = res.choices[0]?.message;
        if (!msg) break;
        messages.push(msg);
        const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
        if (!calls.length) return { text: msg.content ?? "", toolCalls, provider: this.name, model: this.model };
        for (const call of calls) {
          let input: unknown = {};
          try {
            input = JSON.parse(call.function.arguments || "{}");
          } catch {
            input = {};
          }
          const { output, isError } = await opts.executeTool(call.function.name, input);
          toolCalls.push({ name: call.function.name, input, output, isError });
          messages.push({ role: "tool", tool_call_id: call.id, content: output });
        }
      }
      return { text: "I gathered the data but ran out of steps.", toolCalls, provider: this.name, model: this.model };
    } catch (err) {
      console.warn("[ai:openai] runTools failed, using local planner:", (err as Error).message);
      const local = await opts.localPlanner(opts.messages, opts.executeTool);
      return { ...local, provider: this.name, model: this.model, fellBack: true };
    }
  }
}
