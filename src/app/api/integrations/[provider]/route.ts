import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { connectIntegration, connectSchema, disconnectIntegration } from "@/services/integration.service";

const providerSchema = z.enum(["SHOPIFY", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "META_ADS", "COURIER", "OPENAI", "ANTHROPIC", "GEMINI"]);

/** Connect: credentials are validated against the provider, encrypted, and never returned. */
export const POST = route<{ provider: string }>({ permission: "integrations.manage", rateLimit: 10 }, async ({ req, params, ctx }) => {
  const provider = providerSchema.parse(params.provider.toUpperCase());
  const { values } = await parseJson(req, connectSchema);
  return connectIntegration(ctx, provider, values);
});

export const DELETE = route<{ provider: string }>({ permission: "integrations.manage" }, async ({ params, ctx }) => {
  await disconnectIntegration(ctx, providerSchema.parse(params.provider.toUpperCase()));
  return { ok: true };
});
