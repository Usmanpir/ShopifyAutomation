import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { isValidCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import type { ServiceContext } from "@/lib/service-context";
import {
  aiSettingsSchema,
  approvalRulesSchema,
  automationLimitsSchema,
  inventorySettingsSchema,
  notificationSettingsSchema,
  parseStoreSettings,
  riskSettingsSchema,
  scheduleSettingsSchema,
  storeSettingsSchema,
} from "@/schemas/store-settings";

export const generalSettingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  currency: z.string().trim().length(3).toUpperCase(),
  locale: z.string().trim().min(2).max(20),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
  logoUrl: z.string().url().nullable().optional(),
});

export async function updateGeneral(ctx: ServiceContext, input: z.infer<typeof generalSettingsSchema>) {
  const before = await db.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
  const updated = await db.store.update({ where: { id: ctx.storeId }, data: input });
  await audit(ctx, {
    action: "settings.general",
    resourceType: "store",
    resourceId: ctx.storeId,
    resourceLabel: updated.name,
    oldValue: { name: before.name, currency: before.currency, locale: before.locale, timezone: before.timezone, logoUrl: before.logoUrl },
    newValue: input,
  });
  return updated;
}

export const SETTINGS_SECTIONS = {
  ai: aiSettingsSchema,
  approvals: approvalRulesSchema,
  risk: riskSettingsSchema,
  notifications: notificationSettingsSchema,
  schedules: scheduleSettingsSchema,
  automation: automationLimitsSchema,
  inventory: inventorySettingsSchema,
} as const;
export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

export async function updateSettingsSection(ctx: ServiceContext, section: SettingsSection, raw: unknown) {
  const schema = SETTINGS_SECTIONS[section];
  if (!schema) throw badRequest("Unknown settings section");
  const value = schema.parse(raw);
  if (section === "schedules") {
    for (const [k, v] of Object.entries(value as Record<string, string>)) if (!isValidCron(v)) throw badRequest(`Invalid schedule for ${k}: "${v}"`);
  }
  if (section === "risk") {
    const r = value as z.infer<typeof riskSettingsSchema>;
    if (r.mediumThreshold >= r.highThreshold) throw badRequest("Medium threshold must be lower than the high threshold");
  }
  const store = await db.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
  const current = parseStoreSettings(store.settings);
  const next = storeSettingsSchema.parse({ ...current, [section]: value });
  await db.store.update({ where: { id: ctx.storeId }, data: { settings: next as unknown as Prisma.InputJsonValue } });
  await audit(ctx, { action: `settings.${section}`, resourceType: "store", resourceId: ctx.storeId, oldValue: current[section], newValue: value });
  return next;
}

export async function setDemoMode(ctx: ServiceContext, enabled: boolean) {
  await db.store.update({ where: { id: ctx.storeId }, data: { demoMode: enabled } });
  await db.integration.updateMany({ where: { storeId: ctx.storeId, status: enabled ? "DISCONNECTED" : "DEMO" }, data: { status: enabled ? "DEMO" : "DISCONNECTED" } });
  await audit(ctx, { action: enabled ? "settings.demo_on" : "settings.demo_off", resourceType: "store", resourceId: ctx.storeId });
}

export async function completeOnboarding(ctx: ServiceContext) {
  await db.store.update({ where: { id: ctx.storeId }, data: { onboardingCompleted: true } });
  await audit(ctx, { action: "onboarding.complete", resourceType: "store", resourceId: ctx.storeId });
}

export const auditQuerySchema = z.object({
  actorType: z.enum(["USER", "AI", "SYSTEM", "CUSTOMER", "WEBHOOK"]).optional(),
  resourceType: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(30),
});

export async function listAuditLogs(storeId: string, q: z.infer<typeof auditQuerySchema>) {
  const where: Prisma.AuditLogWhereInput = {
    storeId,
    ...(q.actorType ? { actorType: q.actorType } : {}),
    ...(q.resourceType ? { resourceType: q.resourceType } : {}),
    ...(q.q ? { OR: [{ action: { contains: q.q, mode: "insensitive" } }, { actorName: { contains: q.q, mode: "insensitive" } }, { resourceLabel: { contains: q.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) };
}
