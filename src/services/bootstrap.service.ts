import type { Prisma } from "@/generated/prisma/client";
import { AUTOMATION_TEMPLATES } from "@/lib/automation/templates";
import { db } from "@/lib/db";
import { defaultStoreSettings } from "@/schemas/store-settings";
import { ensureAgents } from "./agent.service";
import { SYSTEM_SEGMENTS } from "./segment.service";

export const DEFAULT_CATEGORIES = ["Shirts", "Trousers", "Tracksuits", "Sweatshirts", "Winter Collection", "Other"];

export const DEFAULT_TEMPLATES = [
  {
    name: "order_confirmation",
    category: "UTILITY",
    body: "Assalam o Alaikum {{1}}! Thank you for your order {{2}} of {{3}} from {{4}}. Please reply YES to confirm or NO to cancel.",
    variables: ["first_name", "order_name", "order_total", "store_name"],
  },
  {
    name: "order_confirmation_reminder",
    category: "UTILITY",
    body: "Hi {{1}}, a quick reminder — your order {{2}} ({{3}}) from {{4}} is waiting for confirmation. Reply YES to confirm or NO to cancel.",
    variables: ["first_name", "order_name", "order_total", "store_name"],
  },
  {
    name: "shipment_tracking",
    category: "UTILITY",
    body: "Good news {{1}}! Your order {{2}} has been shipped 🚚 Tracking number: {{3}}.",
    variables: ["first_name", "order_name", "tracking_number"],
  },
  {
    name: "review_request",
    category: "MARKETING",
    body: "Hi {{1}}! We hope you're loving your order {{2}} 💙 Could you take 30 seconds to share a review? It really helps us.",
    variables: ["first_name", "order_name"],
  },
];

export const DEFAULT_KNOWLEDGE = [
  { title: "Delivery times & charges", category: "SHIPPING", content: "We deliver nationwide in 2–4 working days (major cities) and 4–6 days elsewhere. Delivery is Rs. 200, free on orders above Rs. 5,000. Cash on delivery is available everywhere." },
  { title: "Exchange policy", category: "RETURNS", content: "You can exchange unworn items with tags within 7 days of delivery for a different size or colour. Sale items can only be exchanged for size." },
  { title: "Return policy", category: "RETURNS", content: "Returns are accepted within 7 days of delivery for unworn items with original tags. Refunds are processed within 5 working days after we receive the item." },
  { title: "Size guide", category: "SIZING", content: "Shirts fit true to size: S (chest 38\"), M (40\"), L (42\"), XL (44\"), XXL (46\"). If you're between sizes, we recommend sizing up." },
  { title: "Payment methods", category: "FAQ", content: "We accept cash on delivery, bank transfer, debit/credit cards and JazzCash/Easypaisa." },
  { title: "Fabric & care", category: "PRODUCT", content: "Our premium shirts are 100% cotton. Machine wash cold, inside out, and iron on medium heat." },
];

/** Creates everything a new store needs: settings, categories, segments, agents, templates, KB. Idempotent. */
export async function bootstrapStore(storeId: string, opts: { withTemplates?: boolean } = {}) {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  if (!store.settings || Object.keys(store.settings as object).length === 0) {
    await db.store.update({ where: { id: storeId }, data: { settings: defaultStoreSettings() as unknown as Prisma.InputJsonValue } });
  }
  for (const [i, name] of DEFAULT_CATEGORIES.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await db.productCategory.upsert({ where: { storeId_slug: { storeId, slug } }, create: { storeId, name, slug, position: i }, update: {} });
  }
  for (const s of SYSTEM_SEGMENTS) {
    await db.customerSegment.upsert({
      where: { storeId_key: { storeId, key: s.key } },
      create: { storeId, key: s.key, name: s.name, description: s.description, color: s.color, rules: s.rules, isSystem: true },
      update: {},
    });
  }
  await ensureAgents(storeId);
  for (const t of DEFAULT_TEMPLATES) {
    await db.messageTemplate.upsert({ where: { storeId_name_language: { storeId, name: t.name, language: "en" } }, create: { storeId, ...t }, update: {} });
  }
  if ((await db.knowledgeArticle.count({ where: { storeId } })) === 0) {
    await db.knowledgeArticle.createMany({ data: DEFAULT_KNOWLEDGE.map((k) => ({ storeId, ...k })) });
  }
  for (const provider of ["SHOPIFY", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "META_ADS", "COURIER", "OPENAI", "ANTHROPIC", "GEMINI"] as const) {
    await db.integration.upsert({ where: { storeId_provider: { storeId, provider } }, create: { storeId, provider, status: store.demoMode ? "DEMO" : "DISCONNECTED" }, update: {} });
  }
  if (opts.withTemplates) {
    const existing = await db.automation.count({ where: { storeId } });
    if (existing === 0) {
      const { createAutomation } = await import("./automation.service");
      for (const t of AUTOMATION_TEMPLATES) {
        await createAutomation({ storeId, actor: { type: "SYSTEM", name: "Setup" } }, { name: t.name, description: t.description, graph: t.graph, templateKey: t.key, status: "ACTIVE" });
      }
    }
  }
}
