import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { formatMoney, toMinor } from "@/lib/money";
import type { ServiceContext } from "@/lib/service-context";
import { segmentRulesSchema } from "@/schemas/segment";
import { createDecision } from "./decision.service";
import { sendWhatsApp } from "./messaging.service";
import { recomputeSegment } from "./segment.service";
import { getStore } from "./store.service";

export async function marketingOverview(storeId: string) {
  const [segments, campaigns, promotions, recommendations, reachable] = await Promise.all([
    db.customerSegment.findMany({ where: { storeId }, orderBy: [{ isSystem: "desc" }, { customerCount: "desc" }] }),
    db.marketingCampaign.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 30, include: { segment: { select: { name: true } } } }),
    db.promotion.findMany({ where: { storeId }, orderBy: { startsAt: "desc" } }),
    db.aIDecision.findMany({
      where: { storeId, agent: { key: "MARKETING" } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { agent: { select: { name: true } } },
    }),
    db.customer.count({ where: { storeId, deletedAt: null, acceptsMarketing: true, phone: { not: null } } }),
  ]);
  const sent = campaigns.filter((c) => c.status === "SENT");
  return {
    segments,
    campaigns,
    promotions,
    recommendations,
    stats: {
      reachableCustomers: reachable,
      campaignsSent: sent.length,
      messagesSent: sent.reduce((s, c) => s + c.sentCount, 0),
      attributedRevenue: sent.reduce((s, c) => s + c.revenue, 0),
      readRate: sent.reduce((s, c) => s + c.sentCount, 0) ? (sent.reduce((s, c) => s + c.readCount, 0) / sent.reduce((s, c) => s + c.sentCount, 0)) * 100 : 0,
      activePromotions: promotions.filter((p) => p.active && (!p.endsAt || p.endsAt > new Date())).length,
    },
  };
}

async function audienceFor(storeId: string, segmentId: string) {
  return db.customer.findMany({
    where: { storeId, deletedAt: null, acceptsMarketing: true, status: "ACTIVE", phone: { not: null }, segments: { some: { segmentId } } },
    select: { id: true, name: true, phone: true },
    take: 5000,
  });
}

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  segmentId: z.string().min(1),
  message: z.string().trim().min(10).max(1000),
  sendNow: z.boolean().default(false),
});

/**
 * Creates a WhatsApp broadcast. Large audiences are a sensitive action: the
 * campaign waits for approval unless an Owner/Admin sends it.
 */
export async function createMarketingCampaign(
  ctx: ServiceContext,
  input: z.infer<typeof campaignCreateSchema>,
  opts: { preApproved?: boolean } = {},
) {
  const store = await getStore(ctx.storeId);
  const segment = await db.customerSegment.findFirst({ where: { id: input.segmentId, storeId: ctx.storeId } });
  if (!segment) throw notFound("Segment");
  const audience = await audienceFor(ctx.storeId, segment.id);
  if (!audience.length) throw badRequest("This segment has no reachable customers (opted-in with a WhatsApp number)");

  const needsApproval =
    !opts.preApproved &&
    audience.length >= store.settings.approvals.massMessageThreshold &&
    !(ctx.actor.type === "USER" && (ctx.actor.role === "OWNER" || ctx.actor.role === "ADMIN"));

  const campaign = await db.marketingCampaign.create({
    data: {
      storeId: ctx.storeId,
      name: input.name,
      segmentId: segment.id,
      message: input.message,
      audienceSize: audience.length,
      status: needsApproval ? "PENDING_APPROVAL" : "DRAFT",
      createdById: ctx.actor.type === "USER" ? ctx.actor.id : null,
    },
  });
  await audit(ctx, { action: "marketing.campaign_create", resourceType: "marketing_campaign", resourceId: campaign.id, resourceLabel: campaign.name, newValue: { segment: segment.name, audience: audience.length } });

  if (needsApproval) {
    await createDecision(ctx.storeId, {
      agentKey: ctx.actor.type === "AI" ? "MARKETING" : undefined,
      title: `Send “${campaign.name}” to ${audience.length} customers`,
      summary: `WhatsApp broadcast to the ${segment.name} segment.`,
      reasoning: `Messaging ${audience.length} customers exceeds the mass-messaging threshold (${store.settings.approvals.massMessageThreshold}).`,
      evidence: [
        { label: "Segment", value: segment.name },
        { label: "Audience", value: `${audience.length} opted-in customers` },
        { label: "Message", value: input.message.slice(0, 160) },
      ],
      action: "sendMarketingCampaign",
      actionInput: { campaignId: campaign.id },
      expectedImpact: "Re-engages customers; typical WhatsApp read rates are 70–90%.",
      riskLevel: audience.length > 500 ? "HIGH" : "MEDIUM",
      requiresApproval: true,
      relatedType: "marketing_campaign",
      relatedId: campaign.id,
    });
    return campaign;
  }
  if (input.sendNow) return sendMarketingCampaign(ctx, campaign.id);
  return campaign;
}

export async function sendMarketingCampaign(ctx: ServiceContext, campaignId: string) {
  const campaign = await db.marketingCampaign.findFirst({ where: { id: campaignId, storeId: ctx.storeId } });
  if (!campaign) throw notFound("Campaign");
  if (campaign.status === "SENT" || campaign.status === "SENDING") throw conflict("Campaign was already sent");
  if (!campaign.segmentId) throw badRequest("Campaign has no segment");
  await db.marketingCampaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });

  const audience = await audienceFor(ctx.storeId, campaign.segmentId);
  let sent = 0;
  let delivered = 0;
  for (const c of audience) {
    try {
      const text = campaign.message.replace(/\{\{\s*name\s*\}\}/g, c.name.split(" ")[0]);
      const { message } = await sendWhatsApp({ storeId: ctx.storeId, phone: c.phone, name: c.name, customerId: c.id, sender: "SYSTEM", text });
      sent++;
      const m = await db.message.findUnique({ where: { id: message.id }, select: { status: true } });
      if (m?.status === "DELIVERED" || m?.status === "READ") delivered++;
    } catch {
      // individual failures are recorded on the message row
    }
  }
  const updated = await db.marketingCampaign.update({
    where: { id: campaignId },
    data: { status: "SENT", sentAt: new Date(), sentCount: sent, deliveredCount: delivered },
  });
  await audit(ctx, { action: "marketing.campaign_send", resourceType: "marketing_campaign", resourceId: campaignId, resourceLabel: campaign.name, newValue: { sent, delivered } });
  return updated;
}

export const segmentCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().max(200).optional(),
  color: z.string().max(20).default("indigo"),
  rules: segmentRulesSchema,
});

export async function createSegment(ctx: ServiceContext, input: z.infer<typeof segmentCreateSchema>) {
  const key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "segment";
  const exists = await db.customerSegment.findUnique({ where: { storeId_key: { storeId: ctx.storeId, key } } });
  if (exists) throw conflict("A segment with this name already exists");
  const segment = await db.customerSegment.create({
    data: { storeId: ctx.storeId, key, name: input.name, description: input.description ?? null, color: input.color, rules: input.rules, isSystem: false },
  });
  await recomputeSegment(segment.id);
  await audit(ctx, { action: "segment.create", resourceType: "segment", resourceId: segment.id, resourceLabel: segment.name, newValue: input.rules });
  return db.customerSegment.findUnique({ where: { id: segment.id } });
}

export const promotionCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(3).max(30).regex(/^[A-Z0-9_-]+$/i, "Use letters, numbers, - or _"),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]),
  value: z.number().min(0).max(1_000_000),
  minSubtotal: z.number().min(0).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
});

export async function createPromotion(ctx: ServiceContext, input: z.infer<typeof promotionCreateSchema>) {
  if (input.type === "PERCENTAGE" && input.value > 90) throw badRequest("Percentage discounts above 90% are not allowed");
  const code = input.code.toUpperCase();
  const exists = await db.promotion.findUnique({ where: { storeId_code: { storeId: ctx.storeId, code } } });
  if (exists) throw conflict("This code already exists");
  const promo = await db.promotion.create({
    data: {
      storeId: ctx.storeId,
      name: input.name,
      code,
      type: input.type,
      value: input.type === "FIXED_AMOUNT" ? toMinor(input.value) : Math.round(input.value),
      minSubtotal: input.minSubtotal ? toMinor(input.minSubtotal) : null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      usageLimit: input.usageLimit ?? null,
    },
  });
  await audit(ctx, { action: "promotion.create", resourceType: "promotion", resourceId: promo.id, resourceLabel: code, newValue: input });
  return promo;
}

export async function togglePromotion(ctx: ServiceContext, id: string, active: boolean) {
  const p = await db.promotion.findFirst({ where: { id, storeId: ctx.storeId } });
  if (!p) throw notFound("Promotion");
  const updated = await db.promotion.update({ where: { id }, data: { active } });
  await audit(ctx, { action: active ? "promotion.activate" : "promotion.deactivate", resourceType: "promotion", resourceId: id, resourceLabel: p.code });
  return updated;
}

/** Marketing Agent: proposes a win-back campaign for inactive customers (needs approval). */
export async function recommendWinbackCampaign(storeId: string, trigger?: { customerId?: string }) {
  const store = await getStore(storeId);
  const segment = await db.customerSegment.findUnique({ where: { storeId_key: { storeId, key: "inactive" } } });
  if (!segment) return null;
  const pending = await db.aIDecision.findFirst({ where: { storeId, status: "PENDING_APPROVAL", action: "sendMarketingCampaign", relatedId: segment.id } });
  if (pending) return pending;
  const audience = await audienceFor(storeId, segment.id);
  if (audience.length < 3) return null;
  const historical = await db.order.aggregate({
    where: { storeId, customerId: { in: audience.map((a) => a.id) }, status: { not: "CANCELLED" } },
    _avg: { total: true },
    _count: true,
  });
  const avg = Math.round(historical._avg.total ?? 0);
  const money = (n: number) => formatMoney(n, { currency: store.currency, locale: store.locale });
  const promo = await db.promotion.findFirst({ where: { storeId, active: true, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, orderBy: { startsAt: "desc" } });
  const message = `Hi {{name}}! We miss you at ${store.name} 💙 Our new collection just dropped${promo ? ` — use code ${promo.code} for ${promo.type === "PERCENTAGE" ? `${promo.value}% off` : "a special discount"}` : ""}. Reply SHOP to see what's new!`;
  return createDecision(storeId, {
    agentKey: "MARKETING",
    title: `Win-back campaign for ${audience.length} inactive customers`,
    summary: `${audience.length} customers haven't purchased in 60+ days${trigger?.customerId ? " (latest just crossed the threshold)" : ""}.`,
    reasoning: "Inactive customers already know the brand; a personal WhatsApp nudge is the cheapest way to recover them.",
    evidence: [
      { label: "Inactive (60+ days)", value: `${audience.length} reachable customers` },
      { label: "Their historical AOV", value: money(avg) },
      { label: "Suggested offer", value: promo ? promo.code : "No active promotion" },
    ],
    action: "sendMarketingCampaign",
    actionInput: { segmentKey: "inactive", name: "Win-back — inactive customers", message },
    expectedImpact: `If 5% return at their usual AOV: ≈ ${money(Math.round(audience.length * 0.05 * avg))}.`,
    riskLevel: "MEDIUM",
    requiresApproval: true,
    relatedType: "segment",
    relatedId: segment.id,
  });
}

/** Opportunity / customer insights shown in the Marketing Center. */
export async function marketingInsights(storeId: string, limit = 6) {
  return db.aIInsight.findMany({
    where: { storeId, kind: { in: ["OPPORTUNITY", "CUSTOMER"] }, dismissedAt: null },
    orderBy: { generatedAt: "desc" },
    take: limit,
    include: { agent: { select: { name: true } } },
  });
}
