import { z } from "zod";

/**
 * Typed shape of `Store.settings`. Every field has a default so older stores
 * transparently pick up new settings. Parse with `parseStoreSettings`.
 */
export const aiSettingsSchema = z.object({
  provider: z.enum(["local", "openai", "anthropic", "gemini"]).default("local"),
  model: z.string().default(""),
  temperature: z.number().min(0).max(1).default(0.2),
  /** Below this confidence the WhatsApp agent hands off to a human. */
  handoffConfidence: z.number().min(0).max(1).default(0.7),
  replyLanguage: z.enum(["auto", "english", "roman_urdu", "urdu"]).default("auto"),
  brandVoice: z.string().max(500).default("Friendly, concise and respectful. Use the customer's language."),
  /** Topics the AI may answer on its own in Automatic mode; anything else goes to a person. */
  autoReplyIntents: z
    .array(z.string())
    .default(["CONFIRM_ORDER", "DECLINE_ORDER", "ORDER_STATUS", "PRODUCT_AVAILABILITY", "PRICE", "DELIVERY", "FAQ", "GREETING", "THANKS"]),
});

export const approvalRulesSchema = z.object({
  /** Refunds always require approval; this is the max auto-approved amount (minor units). */
  refundAutoApproveLimit: z.number().int().min(0).default(0),
  bulkCancellationThreshold: z.number().int().min(1).default(3),
  adBudgetChangePercent: z.number().min(0).max(500).default(20),
  massMessageThreshold: z.number().int().min(1).default(25),
  priceChangeRequiresApproval: z.boolean().default(true),
  deleteRequiresApproval: z.boolean().default(true),
  decisionExpiryHours: z.number().int().min(1).max(720).default(72),
});

export const riskSettingsSchema = z.object({
  mediumThreshold: z.number().int().min(1).max(99).default(35),
  highThreshold: z.number().int().min(2).max(100).default(65),
  highValueOrderAmount: z.number().int().min(0).default(1_500_000), // Rs. 15,000
  weights: z
    .object({
      previousCancellations: z.number().min(0).max(50).default(18),
      previousReturns: z.number().min(0).max(50).default(12),
      successfulDeliveries: z.number().min(0).max(50).default(10),
      orderFrequency: z.number().min(0).max(50).default(10),
      orderAmount: z.number().min(0).max(50).default(12),
      phoneHistory: z.number().min(0).max(50).default(14),
      addressConsistency: z.number().min(0).max(50).default(10),
      codBehavior: z.number().min(0).max(50).default(14),
    })
    .default({
      previousCancellations: 18,
      previousReturns: 12,
      successfulDeliveries: 10,
      orderFrequency: 10,
      orderAmount: 12,
      phoneHistory: 14,
      addressConsistency: 10,
      codBehavior: 14,
    }),
  requireConfirmationForCod: z.boolean().default(true),
});

export const notificationSettingsSchema = z.object({
  email: z.boolean().default(true),
  whatsapp: z.boolean().default(false),
  browser: z.boolean().default(true),
  alerts: z
    .object({
      highRiskOrder: z.boolean().default(true),
      lowStock: z.boolean().default(true),
      humanHandoff: z.boolean().default(true),
      approvalRequired: z.boolean().default(true),
      adPerformance: z.boolean().default(true),
      automationFailure: z.boolean().default(true),
      dailyReport: z.boolean().default(true),
    })
    .default({
      highRiskOrder: true,
      lowStock: true,
      humanHandoff: true,
      approvalRequired: true,
      adPerformance: true,
      automationFailure: true,
      dailyReport: true,
    }),
});

/** Cron expressions (store timezone) for scheduled jobs. */
export const scheduleSettingsSchema = z.object({
  dailyReport: z.string().default("0 9 * * *"),
  inventoryAnalysis: z.string().default("0 */6 * * *"),
  customerSegmentation: z.string().default("30 2 * * *"),
  analyticsSync: z.string().default("15 * * * *"),
  courierTracking: z.string().default("*/30 * * * *"),
  aiInsights: z.string().default("0 */4 * * *"),
  abandonedFollowUp: z.string().default("0 * * * *"),
});

export const automationLimitsSchema = z.object({
  maxRunsPerHour: z.number().int().min(1).default(500),
  maxMessagesPerCustomerPerDay: z.number().int().min(1).default(5),
  quietHoursStart: z.number().int().min(0).max(23).default(23),
  quietHoursEnd: z.number().int().min(0).max(23).default(9),
});

export const inventorySettingsSchema = z.object({
  defaultLowStockThreshold: z.number().int().min(0).default(10),
  coverageWarningDays: z.number().min(0).default(5),
  velocityWindowDays: z.number().int().min(1).max(90).default(14),
});

export const storeSettingsSchema = z.object({
  ai: aiSettingsSchema.default(aiSettingsSchema.parse({})),
  approvals: approvalRulesSchema.default(approvalRulesSchema.parse({})),
  risk: riskSettingsSchema.default(riskSettingsSchema.parse({})),
  notifications: notificationSettingsSchema.default(notificationSettingsSchema.parse({})),
  schedules: scheduleSettingsSchema.default(scheduleSettingsSchema.parse({})),
  automation: automationLimitsSchema.default(automationLimitsSchema.parse({})),
  inventory: inventorySettingsSchema.default(inventorySettingsSchema.parse({})),
  courier: z
    .object({ provider: z.string().default("demo"), defaultServiceType: z.string().default("overnight") })
    .default({ provider: "demo", defaultServiceType: "overnight" }),
  whatsapp: z
    .object({ provider: z.string().default("demo") })
    .default({ provider: "demo" }),
});

export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type AISettings = z.infer<typeof aiSettingsSchema>;
export type RiskSettings = z.infer<typeof riskSettingsSchema>;
export type ApprovalRules = z.infer<typeof approvalRulesSchema>;

export function parseStoreSettings(raw: unknown): StoreSettings {
  const parsed = storeSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : storeSettingsSchema.parse({});
}

export const defaultStoreSettings = (): StoreSettings => storeSettingsSchema.parse({});
