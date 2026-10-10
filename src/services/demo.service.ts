import { db } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { randomToken } from "@/lib/crypto";
import { receiveInbound } from "./conversation.service";
import { ingestOrder } from "./order.service";
import { getStore } from "./store.service";

/**
 * Demo simulator. Runs on a schedule for stores in demo mode so the command
 * center feels alive: new orders flow in through the real ingestion path
 * (risk scoring, automations, WhatsApp confirmations), customers reply,
 * and today's ad spend and traffic accumulate.
 */
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const REPLIES_CONFIRM = ["Yes", "Han ji confirm", "YES confirm kar dein", "ji haan", "Confirm"];
const REPLIES_DECLINE = ["No, cancel it", "Nahi chahiye, cancel kar do"];
const QUESTIONS = [
  "Bhai black shirt available hai?",
  "Is the Oxford shirt available in XL?",
  "Mera order kahan hai?",
  "What's the price of the tracksuit?",
  "Delivery kitne din mein hogi?",
  "Can I exchange size L for XL?",
  "Winter jacket M size milega?",
];

export async function simulateDemoActivity(storeId: string) {
  const store = await getStore(storeId);
  if (!store.demoMode) return { skipped: true };
  const actions: string[] = [];

  // 1) Maybe a new order (≈70% of ticks)
  if (Math.random() < 0.7) {
    const customer = Math.random() < 0.45 ? await db.customer.findFirst({ where: { storeId, phone: { not: null } }, skip: Math.floor(Math.random() * 80), orderBy: { createdAt: "asc" } }) : null;
    const variants = await db.productVariant.findMany({ where: { storeId, inventoryQuantity: { gt: 0 }, product: { status: "ACTIVE" } }, include: { product: true }, take: 400 });
    if (variants.length) {
      const lines = Array.from({ length: Math.random() < 0.7 ? 1 : 2 }, () => pick(variants));
      const last = await db.order.findFirst({ where: { storeId }, orderBy: { orderNumber: "desc" }, select: { orderNumber: true } });
      const number = (last?.orderNumber ?? 10000) + 1;
      const cities = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Gujranwala"];
      const names = ["Ali Raza", "Hamza Iqbal", "Usman Tariq", "Bilal Ahmed", "Fahad Khan", "Saad Malik", "Zain Abbas", "Hassan Javed"];
      const name = customer?.name ?? pick(names);
      const city = customer?.city ?? pick(cities);
      const subtotal = lines.reduce((s, v) => s + v.price, 0);
      const shipping = subtotal >= 500000 ? 0 : 20000;
      await ingestOrder(
        storeId,
        {
          externalId: `demo-${randomToken(8)}`,
          orderNumber: number,
          name: `#${number}`,
          currency: store.currency,
          email: null,
          phone: customer?.phone ?? `923${Math.floor(100000000 + Math.random() * 899999999)}`,
          customerName: name,
          customerExternalId: null,
          city,
          shippingAddress: { address1: `House ${Math.floor(Math.random() * 300) + 1}, Street ${Math.floor(Math.random() * 40) + 1}, Block ${pick(["A", "B", "C", "D"])}`, city, country: "Pakistan" },
          subtotal,
          shippingTotal: shipping,
          discountTotal: 0,
          total: subtotal + shipping,
          paymentMethod: Math.random() < 0.82 ? "COD" : pick(["CARD", "BANK_TRANSFER", "WALLET"] as const),
          paymentStatus: "PENDING",
          tags: [],
          note: null,
          source: pick(["web", "web", "instagram", "facebook"]),
          placedAt: new Date(),
          cancelledAt: null,
          cancelReason: null,
          items: lines.map((v) => ({ externalProductId: null, externalVariantId: v.externalId, title: v.product.title, variantTitle: v.title, sku: v.sku, quantity: 1, unitPrice: v.price })),
        },
        { source: "demo", adjustInventory: true },
      );
      actions.push(`order #${number}`);
    }
  }

  // 2) A customer replies to a pending confirmation (most say yes)
  const pending = await db.order.findFirst({
    where: { storeId, confirmationStatus: "PENDING", phone: { not: null }, updatedAt: { lt: new Date(Date.now() - 60_000) } },
    orderBy: { placedAt: "asc" },
  });
  if (pending && Math.random() < 0.8) {
    await receiveInbound(storeId, { channel: "WHATSAPP", handle: pending.phone!, name: pending.customerName, text: Math.random() < 0.88 ? pick(REPLIES_CONFIRM) : pick(REPLIES_DECLINE) });
    actions.push(`reply ${pending.name}`);
  }

  // 3) Occasionally a product / support question
  if (Math.random() < 0.35) {
    const c = await db.customer.findFirst({ where: { storeId, phone: { not: null } }, skip: Math.floor(Math.random() * 60) });
    if (c?.phone) {
      await receiveInbound(storeId, { channel: "WHATSAPP", handle: c.phone, name: c.name, text: pick(QUESTIONS) });
      actions.push("question");
    }
  }

  // 4) Today's ad spend & traffic accumulate
  const today = new Date(dayKey(new Date(), store.timezone));
  const campaigns = await db.campaign.findMany({ where: { storeId, status: "ACTIVE" }, include: { ads: true, adSets: true } });
  // The simulator ticks every 3 minutes (480×/day): scale increments so a day adds up to ~1× budget at ~3.5× ROAS.
  const TICKS_PER_DAY = 480;
  for (const c of campaigns) {
    const spend = Math.round(((c.dailyBudget ?? 200000) / TICKS_PER_DAY) * (0.7 + Math.random() * 0.6));
    const impressions = Math.round((spend / 13000) * 1000); // ~Rs. 130 CPM
    const clicks = Math.round(impressions * (0.012 + Math.random() * 0.01));
    const avgOrder = 520000;
    const purchases = Math.random() < (spend * 3.5) / avgOrder ? 1 : 0;
    const revenue = purchases ? Math.round(avgOrder * (0.8 + Math.random() * 0.4)) : 0;
    const inc = { spend: { increment: spend }, impressions: { increment: impressions }, reach: { increment: Math.round(impressions * 0.8) }, clicks: { increment: clicks }, purchases: { increment: purchases }, revenue: { increment: revenue } };
    const base = { spend, impressions, reach: Math.round(impressions * 0.8), clicks, purchases, revenue, leads: 0 };
    await db.adInsight.upsert({ where: { storeId_level_entityId_date: { storeId, level: "CAMPAIGN", entityId: c.id, date: today } }, create: { storeId, level: "CAMPAIGN", entityId: c.id, campaignId: c.id, date: today, ...base }, update: inc });
    const ad = c.ads.length ? pick(c.ads) : null;
    if (ad) {
      await db.adInsight.upsert({ where: { storeId_level_entityId_date: { storeId, level: "AD", entityId: ad.id, date: today } }, create: { storeId, level: "AD", entityId: ad.id, campaignId: c.id, date: today, ...base }, update: inc });
      await db.adInsight.upsert({ where: { storeId_level_entityId_date: { storeId, level: "ADSET", entityId: ad.adSetId, date: today } }, create: { storeId, level: "ADSET", entityId: ad.adSetId, campaignId: c.id, date: today, ...base }, update: inc });
    }
  }
  const sessions = Math.round(30 + Math.random() * 40);
  await db.storeDailyMetric.upsert({
    where: { storeId_date: { storeId, date: today } },
    create: { storeId, date: today, sessions, addToCarts: Math.round(sessions * 0.08), checkouts: Math.round(sessions * 0.04) },
    update: { sessions: { increment: sessions }, addToCarts: { increment: Math.round(sessions * 0.08) }, checkouts: { increment: Math.round(sessions * 0.04) } },
  });
  return { actions };
}
