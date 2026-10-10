import { GoogleGenAI, type Content } from "@google/genai";
import { extractJson, toStrictJsonSchema } from "../json-schema";
import type { AIProvider, GenerateObjectOptions, RunToolsOptions, RunToolsResult, ToolCallRecord } from "../types";

export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

/** Google Gemini provider via @google/genai. */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  private client: GoogleGenAI;

  constructor(apiKey: string, readonly model: string = GEMINI_DEFAULT_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateObject<T>(opts: GenerateObjectOptions<T>): Promise<{ data: T; fellBack: boolean }> {
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [...(opts.images ?? []).map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })), { text: opts.prompt }],
          },
        ],
        config: {
          systemInstruction: opts.system,
          temperature: opts.temperature,
          responseMimeType: "application/json",
          responseJsonSchema: toStrictJsonSchema(opts.schema),
        },
      });
      return { data: opts.schema.parse(extractJson(res.text ?? "")), fellBack: false };
    } catch (err) {
      console.warn("[ai:gemini] generateObject failed, using fallback:", (err as Error).message);
      return { data: await opts.fallback(), fellBack: true };
    }
  }

  async runTools(opts: RunToolsOptions): Promise<RunToolsResult> {
    const contents: Content[] = opts.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const toolCalls: ToolCallRecord[] = [];
    const functionDeclarations = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parametersJsonSchema: t.inputSchema,
    }));
    try {
      for (let i = 0; i < (opts.maxIterations ?? 6); i++) {
        const res = await this.client.models.generateContent({
          model: this.model,
          contents,
          config: { systemInstruction: opts.system, temperature: opts.temperature, tools: [{ functionDeclarations }] },
        });
        const calls = res.functionCalls ?? [];
        const modelContent = res.candidates?.[0]?.content;
        if (modelContent) contents.push(modelContent);
        if (!calls.length) return { text: res.text ?? "", toolCalls, provider: this.name, model: this.model };
        const parts = [];
        for (const call of calls) {
          const name = call.name ?? "";
          const { output, isError } = await opts.executeTool(name, call.args ?? {});
          toolCalls.push({ name, input: call.args, output, isError });
          parts.push({ functionResponse: { name, response: { result: output } } });
        }
        contents.push({ role: "user", parts });
      }
      return { text: "I gathered the data but ran out of steps.", toolCalls, provider: this.name, model: this.model };
    } catch (err) {
      console.warn("[ai:gemini] runTools failed, using local planner:", (err as Error).message);
      const local = await opts.localPlanner(opts.messages, opts.executeTool);
      return { ...local, provider: this.name, model: this.model, fellBack: true };
    }
  }
}
