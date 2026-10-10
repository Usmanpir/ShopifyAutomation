import { z } from "zod";

/**
 * Server environment, validated once at startup. Integrations are optional:
 * when credentials are missing the app runs those integrations in demo mode.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: optional,
  APP_URL: z.string().url().default("http://localhost:3000"),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY must be a base64 encoded 32 byte key"),
  CRON_SECRET: optional,
  /** Run background jobs in-process instead of BullMQ (serverless without a worker). */
  INLINE_JOBS: optional,

  SHOPIFY_CLIENT_ID: optional,
  SHOPIFY_CLIENT_SECRET: optional,
  SHOPIFY_WEBHOOK_SECRET: optional,
  SHOPIFY_API_VERSION: z.string().default("2026-07"),
  SHOPIFY_SCOPES: z
    .string()
    .default(
      "read_products,write_products,read_orders,write_orders,read_customers,read_inventory,write_inventory,read_fulfillments,write_fulfillments",
    ),

  META_APP_ID: optional,
  META_APP_SECRET: optional,
  META_WEBHOOK_VERIFY_TOKEN: optional,
  META_GRAPH_VERSION: z.string().default("v23.0"),

  WHATSAPP_ACCESS_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_BUSINESS_ACCOUNT_ID: optional,

  AI_PROVIDER: z.enum(["local", "openai", "anthropic", "gemini"]).default("local"),
  OPENAI_API_KEY: optional,
  ANTHROPIC_API_KEY: optional,
  GEMINI_API_KEY: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().NODE_ENV === "production";
