import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { RECIPES_BY_KEY } from "@/lib/automation/recipes";
import { TEMPLATES_BY_KEY } from "@/lib/automation/templates";
import type { ServiceContext } from "@/lib/service-context";
import { updateAgent } from "./agent.service";
import { createAutomation, setAutomationStatus } from "./automation.service";
import { updateSettingsSection } from "./settings.service";
import { getStore } from "./store.service";

/**
 * "Popular automations": the handful of things most stores want, each with
 * one switch. Workflow ones map to a template (installed on first switch-on);
 * built-in ones map to an existing setting or agent.
 */
export type PopularItem = {
  key: string;
  name: string;
  description: string;
  safety: string;
  kind: "workflow" | "builtin";
  on: boolean;
  automationId: string | null;
};

const WORKFLOWS: { key: string; name: string; description: string; safety: string }[] = [
  { key: "cod-confirmation", name: "Confirm COD orders on WhatsApp", description: "Asks every cash-on-delivery customer to confirm, reminds them, and flags orders with no reply.", safety: "Orders are never cancelled automatically." },
  { key: "delivery-notification", name: "Send tracking when an order ships", description: "Customers get their tracking number as soon as a courier is booked.", safety: "Only that order's customer is messaged." },
  { key: "review-request", name: "Ask for a review after delivery", description: "A friendly review request 3 days after delivery, skipping returned orders.", safety: "Respects your daily message limit per customer." },
  { key: "low-inventory", name: "Warn me before stock runs out", description: "Alerts you with a reorder suggestion when a variant runs low.", safety: "Read-only — nothing in your store changes." },
  { key: "inactive-customer", name: "Win back inactive customers", description: "Prepares a win-back campaign when customers go quiet for 60 days.", safety: "Campaigns wait for your approval before sending." },
  { key: "high-risk-review", name: "Double-check high-risk orders", description: "AI reviews risky orders; holding an order needs a manager.", safety: "AI never cancels orders." },
];

export async function listPopular(storeId: string): Promise<PopularItem[]> {
  const [store, automations, whatsapp] = await Promise.all([
    getStore(storeId),
    db.automation.findMany({ where: { storeId, deletedAt: null, templateKey: { not: null } }, select: { id: true, templateKey: true, status: true }, orderBy: { createdAt: "asc" } }),
    db.aIAgent.findUnique({ where: { storeId_key: { storeId, key: "WHATSAPP" } }, select: { enabled: true } }),
  ]);
  const items: PopularItem[] = WORKFLOWS.map((w) => {
    const mine = automations.filter((a) => a.templateKey === w.key);
    return { ...w, kind: "workflow", on: mine.some((a) => a.status === "ACTIVE"), automationId: (mine.find((a) => a.status === "ACTIVE") ?? mine[0])?.id ?? null };
  });
  items.splice(1, 0, {
    key: "whatsapp-auto-reply",
    name: "AI answers customer questions",
    description: "The Customer Assistant replies 24/7 on WhatsApp about orders, delivery, prices and stock, and hands anything else to you.",
    safety: "Only approved topics; complaints, returns and unsure answers go to a person.",
    kind: "builtin",
    on: !!whatsapp?.enabled,
    automationId: null,
  });
  items.push({
    key: "daily-report",
    name: "Send daily business report",
    description: "Every morning the Business Analyst sends yesterday's sales, ads and stock summary to owners and managers.",
    safety: "Read-only report.",
    kind: "builtin",
    on: store.settings.notifications.alerts.dailyReport,
    automationId: null,
  });
  return items;
}

export const popularToggleSchema = z.object({ key: z.string().min(1).max(60), on: z.boolean() });

export async function togglePopular(ctx: ServiceContext, key: string, on: boolean) {
  if (key === "daily-report") {
    const store = await getStore(ctx.storeId);
    await updateSettingsSection(ctx, "notifications", { ...store.settings.notifications, alerts: { ...store.settings.notifications.alerts, dailyReport: on } });
    return { key, on };
  }
  if (key === "whatsapp-auto-reply") {
    await updateAgent(ctx, "WHATSAPP", { enabled: on });
    return { key, on };
  }
  const template = TEMPLATES_BY_KEY.get(key);
  if (!template || !WORKFLOWS.some((w) => w.key === key)) throw notFound("Automation");
  const mine = await db.automation.findMany({ where: { storeId: ctx.storeId, deletedAt: null, templateKey: key }, orderBy: { createdAt: "asc" } });
  if (on) {
    if (mine.some((a) => a.status === "ACTIVE")) return { key, on };
    if (mine[0]) await setAutomationStatus(ctx, mine[0].id, "ACTIVE");
    else await createAutomation(ctx, { name: template.name, description: template.description, graph: template.graph, templateKey: key, status: "ACTIVE" });
  } else {
    for (const a of mine.filter((x) => x.status === "ACTIVE")) await setAutomationStatus(ctx, a.id, "PAUSED");
  }
  return { key, on };
}

export const recipeCreateSchema = z.object({ recipe: z.string().min(1).max(60), options: z.record(z.string(), z.string().max(40)).default({}), activate: z.boolean().default(true) });

/** Wizard → a real automation (active right away, or a draft to fine-tune in the builder). */
export async function createFromRecipe(ctx: ServiceContext, input: z.infer<typeof recipeCreateSchema>) {
  const recipe = RECIPES_BY_KEY.get(input.recipe);
  if (!recipe) throw badRequest("Unknown automation type");
  const built = recipe.build(input.options);
  const a = await createAutomation(ctx, { ...built, templateKey: recipe.templateKey, status: "DRAFT" });
  if (input.activate) await setAutomationStatus(ctx, a.id, "ACTIVE");
  return { id: a.id, active: input.activate };
}
