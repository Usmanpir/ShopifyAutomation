import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { parseStoreSettings } from "@/schemas/store-settings";
import { AnthropicProvider, ANTHROPIC_DEFAULT_MODEL } from "./providers/anthropic";
import { GeminiProvider, GEMINI_DEFAULT_MODEL } from "./providers/gemini";
import { LocalProvider } from "./providers/local";
import { OpenAIProvider, OPENAI_DEFAULT_MODEL } from "./providers/openai";
import type { AIProvider } from "./types";

export const AI_PROVIDERS = [
  { key: "local", name: "CommerceAI Rules (built-in)", defaultModel: "commerceai-rules-v1", integration: null, env: null },
  { key: "anthropic", name: "Anthropic Claude", defaultModel: ANTHROPIC_DEFAULT_MODEL, integration: "ANTHROPIC", env: "ANTHROPIC_API_KEY" },
  { key: "openai", name: "OpenAI", defaultModel: OPENAI_DEFAULT_MODEL, integration: "OPENAI", env: "OPENAI_API_KEY" },
  { key: "gemini", name: "Google Gemini", defaultModel: GEMINI_DEFAULT_MODEL, integration: "GEMINI", env: "GEMINI_API_KEY" },
] as const;

export type ProviderKey = (typeof AI_PROVIDERS)[number]["key"];

/** API key from the store's encrypted integration, falling back to the server env. */
async function resolveKey(storeId: string, provider: Exclude<ProviderKey, "local">): Promise<string | null> {
  const meta = AI_PROVIDERS.find((p) => p.key === provider)!;
  const integration = await db.integration.findUnique({
    where: { storeId_provider: { storeId, provider: meta.integration! } },
    select: { credentialsEnc: true, status: true },
  });
  if (integration?.credentialsEnc && integration.status === "CONNECTED") {
    const creds = decryptJson<{ apiKey?: string }>(integration.credentialsEnc);
    if (creds?.apiKey) return creds.apiKey;
  }
  return process.env[meta.env!] || null;
}

/**
 * Returns the configured provider for a store. Falls back to the local rules
 * engine when the chosen provider has no key — the app always works.
 */
export async function getAIProvider(storeId: string): Promise<AIProvider> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { settings: true } });
  const settings = parseStoreSettings(store?.settings);
  const choice = (settings.ai.provider || process.env.AI_PROVIDER || "local") as ProviderKey;
  if (choice === "local") return new LocalProvider();

  const key = await resolveKey(storeId, choice);
  if (!key) return new LocalProvider();
  const model = settings.ai.model || AI_PROVIDERS.find((p) => p.key === choice)!.defaultModel;
  switch (choice) {
    case "anthropic":
      return new AnthropicProvider(key, model);
    case "openai":
      return new OpenAIProvider(key, model);
    case "gemini":
      return new GeminiProvider(key, model);
  }
}
