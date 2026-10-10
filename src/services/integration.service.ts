import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { IntegrationProvider } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { listCourierProviders } from "@/lib/courier/registry";
import { decryptJson, encryptJson, maskSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { badRequest, notFound } from "@/lib/errors";
import { graphRequest } from "@/lib/meta/graph";
import { isShopifyConfigured } from "@/lib/shopify/oauth";
import type { ServiceContext } from "@/lib/service-context";

export type IntegrationField = { key: string; label: string; secret?: boolean; placeholder?: string; help?: string; required?: boolean; options?: { value: string; label: string }[] };

export type IntegrationMeta = {
  provider: IntegrationProvider;
  name: string;
  category: "Commerce" | "Messaging" | "Social" | "Advertising" | "Shipping" | "AI";
  description: string;
  icon: string;
  docs: string;
  /** OAuth-based providers (Shopify) don't take manual credentials. */
  oauth?: boolean;
  fields: IntegrationField[];
};

export const INTEGRATIONS: IntegrationMeta[] = [
  {
    provider: "SHOPIFY",
    name: "Shopify",
    category: "Commerce",
    description: "Sync products, inventory, customers and orders in real time via webhooks.",
    icon: "shopping-bag",
    docs: "/docs/INTEGRATIONS.md#shopify",
    oauth: true,
    fields: [{ key: "shop", label: "Store domain", placeholder: "your-store.myshopify.com", required: true }],
  },
  {
    provider: "WHATSAPP",
    name: "WhatsApp Business",
    category: "Messaging",
    description: "Send confirmations, tracking and replies via the WhatsApp Cloud API.",
    icon: "message-circle",
    docs: "/docs/INTEGRATIONS.md#whatsapp",
    fields: [
      { key: "accessToken", label: "Permanent access token", secret: true, required: true },
      { key: "phoneNumberId", label: "Phone number ID", required: true },
      { key: "businessAccountId", label: "WhatsApp Business Account ID" },
    ],
  },
  {
    provider: "FACEBOOK",
    name: "Facebook Page",
    category: "Social",
    description: "Messenger inbox, page comments and lead forms.",
    icon: "facebook",
    docs: "/docs/INTEGRATIONS.md#meta",
    fields: [
      { key: "pageAccessToken", label: "Page access token", secret: true, required: true },
      { key: "pageId", label: "Page ID", required: true },
    ],
  },
  {
    provider: "INSTAGRAM",
    name: "Instagram",
    category: "Social",
    description: "Instagram DMs and comments through your connected page.",
    icon: "instagram",
    docs: "/docs/INTEGRATIONS.md#meta",
    fields: [
      { key: "pageAccessToken", label: "Page access token", secret: true, required: true },
      { key: "pageId", label: "Instagram business account ID", required: true },
    ],
  },
  {
    provider: "META_ADS",
    name: "Meta Ads",
    category: "Advertising",
    description: "Campaign, ad set and ad performance with daily insights.",
    icon: "chart-candlestick",
    docs: "/docs/INTEGRATIONS.md#meta-ads",
    fields: [
      { key: "accessToken", label: "System user access token", secret: true, required: true },
      { key: "adAccountId", label: "Ad account ID", placeholder: "act_1234567890", required: true },
    ],
  },
  {
    provider: "COURIER",
    name: "Courier",
    category: "Shipping",
    description: "Book shipments and track deliveries with your courier.",
    icon: "truck",
    docs: "/docs/INTEGRATIONS.md#courier",
    fields: [
      { key: "provider", label: "Courier", required: true, options: listCourierProviders().map((c) => ({ value: c.key, label: c.name })) },
      { key: "apiKey", label: "API key", secret: true },
    ],
  },
  { provider: "OPENAI", name: "OpenAI", category: "AI", description: "GPT models for the assistant and agents.", icon: "sparkles", docs: "/docs/AI_AGENTS.md#providers", fields: [{ key: "apiKey", label: "API key", secret: true, required: true }] },
  { provider: "ANTHROPIC", name: "Anthropic Claude", category: "AI", description: "Claude models for the assistant and agents.", icon: "sparkles", docs: "/docs/AI_AGENTS.md#providers", fields: [{ key: "apiKey", label: "API key", secret: true, required: true }] },
  { provider: "GEMINI", name: "Google Gemini", category: "AI", description: "Gemini models for the assistant and agents.", icon: "sparkles", docs: "/docs/AI_AGENTS.md#providers", fields: [{ key: "apiKey", label: "API key", secret: true, required: true }] },
];

const META_BY_PROVIDER = new Map(INTEGRATIONS.map((i) => [i.provider, i]));

export async function listIntegrations(storeId: string) {
  const [rows, store, shopify] = await Promise.all([
    db.integration.findMany({ where: { storeId } }),
    db.store.findUniqueOrThrow({ where: { id: storeId }, select: { demoMode: true } }),
    db.shopifyConnection.findUnique({ where: { storeId } }),
  ]);
  return INTEGRATIONS.map((meta) => {
    const row = rows.find((r) => r.provider === meta.provider);
    const config = (row?.config ?? {}) as Record<string, string>;
    const creds = row?.credentialsEnc ? (decryptJson<Record<string, string>>(row.credentialsEnc) ?? {}) : {};
    const envKey = meta.category === "AI" ? process.env[`${meta.provider}_API_KEY`] : undefined;
    return {
      ...meta,
      status: meta.provider === "SHOPIFY" && shopify && !shopify.uninstalledAt ? "CONNECTED" : (row?.status ?? "DISCONNECTED"),
      lastSyncAt: meta.provider === "SHOPIFY" ? (shopify?.lastSyncAt ?? row?.lastSyncAt ?? null) : (row?.lastSyncAt ?? null),
      lastError: row?.lastError ?? (meta.provider === "SHOPIFY" ? shopify?.lastSyncError : null) ?? null,
      connectedAt: row?.connectedAt ?? shopify?.installedAt ?? null,
      // Only non-secret config and masked secrets ever leave the server.
      display: Object.fromEntries([
        ...Object.entries(config),
        ...Object.entries(creds).map(([k, v]) => [k, maskSecret(v)]),
        ...(meta.provider === "SHOPIFY" && shopify ? [["shop", shopify.shopDomain]] : []),
      ]),
      envConfigured: !!envKey || (meta.provider === "SHOPIFY" && isShopifyConfigured()),
      demoMode: store.demoMode,
    };
  });
}

/** Light-weight credential check against the provider's API. */
async function testConnection(provider: IntegrationProvider, creds: Record<string, string>, config: Record<string, string>): Promise<void> {
  switch (provider) {
    case "OPENAI":
      await new OpenAI({ apiKey: creds.apiKey, timeout: 10_000, maxRetries: 0 }).models.list();
      return;
    case "ANTHROPIC":
      await new Anthropic({ apiKey: creds.apiKey, timeout: 10_000, maxRetries: 0 }).models.list({ limit: 1 });
      return;
    case "GEMINI":
      await new GoogleGenAI({ apiKey: creds.apiKey }).models.list({ config: { pageSize: 1 } });
      return;
    case "WHATSAPP":
      await graphRequest(config.phoneNumberId, creds.accessToken, { params: { fields: "display_phone_number,verified_name" } });
      return;
    case "FACEBOOK":
    case "INSTAGRAM":
      await graphRequest(config.pageId, creds.pageAccessToken, { params: { fields: "id,name" } });
      return;
    case "META_ADS": {
      const act = config.adAccountId.startsWith("act_") ? config.adAccountId : `act_${config.adAccountId}`;
      await graphRequest(act, creds.accessToken, { params: { fields: "name,currency" } });
      return;
    }
    default:
      return;
  }
}

export const connectSchema = z.object({ values: z.record(z.string(), z.string().max(4000)) });

export async function connectIntegration(ctx: ServiceContext, provider: IntegrationProvider, values: Record<string, string>) {
  const meta = META_BY_PROVIDER.get(provider);
  if (!meta) throw notFound("Integration");
  if (meta.oauth) throw badRequest("Use the Connect button to install via OAuth");
  const creds: Record<string, string> = {};
  const config: Record<string, string> = {};
  for (const f of meta.fields) {
    const v = values[f.key]?.trim();
    if (f.required && !v) throw badRequest(`${f.label} is required`);
    if (v) (f.secret ? creds : config)[f.key] = v;
  }
  const store = await db.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
  let status: "CONNECTED" | "ERROR" = "CONNECTED";
  let lastError: string | null = null;
  try {
    if (env().NODE_ENV !== "test") await testConnection(provider, creds, config);
  } catch (err) {
    status = "ERROR";
    lastError = (err as Error).message.slice(0, 300);
  }
  await db.integration.upsert({
    where: { storeId_provider: { storeId: ctx.storeId, provider } },
    create: { storeId: ctx.storeId, provider, status, credentialsEnc: Object.keys(creds).length ? encryptJson(creds) : null, config, lastError, connectedAt: status === "CONNECTED" ? new Date() : null },
    update: { status, credentialsEnc: Object.keys(creds).length ? encryptJson(creds) : null, config, lastError, connectedAt: status === "CONNECTED" ? new Date() : null },
  });
  if (provider === "META_ADS" && status === "CONNECTED") {
    await db.metaAccount.upsert({
      where: { storeId_adAccountId: { storeId: ctx.storeId, adAccountId: config.adAccountId } },
      create: { storeId: ctx.storeId, adAccountId: config.adAccountId, name: "Meta Ad Account", currency: store.currency },
      update: {},
    });
  }
  if (provider === "COURIER" && config.provider) {
    const settings = (store.settings ?? {}) as Record<string, unknown>;
    await db.store.update({ where: { id: ctx.storeId }, data: { settings: { ...settings, courier: { ...((settings.courier as object) ?? {}), provider: config.provider } } as Prisma.InputJsonValue } });
  }
  await audit(ctx, { action: "integration.connect", resourceType: "integration", resourceLabel: meta.name, newValue: { ...config, status }, reason: lastError ?? undefined });
  if (status === "ERROR") throw badRequest(`Couldn't connect to ${meta.name}: ${lastError}`);
  return { status };
}

export async function disconnectIntegration(ctx: ServiceContext, provider: IntegrationProvider) {
  const meta = META_BY_PROVIDER.get(provider);
  if (!meta) throw notFound("Integration");
  if (provider === "SHOPIFY") await db.shopifyConnection.updateMany({ where: { storeId: ctx.storeId }, data: { uninstalledAt: new Date() } });
  const store = await db.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { demoMode: true } });
  await db.integration.update({
    where: { storeId_provider: { storeId: ctx.storeId, provider } },
    data: { status: store.demoMode ? "DEMO" : "DISCONNECTED", credentialsEnc: null, lastError: null, connectedAt: null },
  });
  await audit(ctx, { action: "integration.disconnect", resourceType: "integration", resourceLabel: meta.name });
}

export async function webhookActivity(storeId: string, limit = 30) {
  return db.webhookEvent.findMany({ where: { storeId }, orderBy: { receivedAt: "desc" }, take: limit, select: { id: true, provider: true, topic: true, status: true, attempts: true, error: true, receivedAt: true, processedAt: true } });
}
