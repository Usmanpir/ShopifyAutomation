import { redirect } from "next/navigation";
import { OnboardingWizard, type OnboardingData } from "@/features/onboarding/onboarding-wizard";
import { AI_PROVIDERS } from "@/lib/ai/factory";
import { requireAuth } from "@/lib/auth/session";
import { AUTOMATION_TEMPLATES } from "@/lib/automation/templates";
import { can } from "@/lib/rbac";
import { listAutomations } from "@/services/automation.service";
import { INTEGRATIONS, listIntegrations } from "@/services/integration.service";

export const metadata = { title: "Set up your store" };

const RECOMMENDED = new Set(["cod-confirmation", "delivery-notification", "low-inventory", "high-risk-review"]);

export default async function OnboardingPage() {
  const auth = await requireAuth();
  if (auth.store.onboardingCompleted) redirect("/dashboard");

  const [integrations, automations] = await Promise.all([listIntegrations(auth.store.id), listAutomations(auth.store.id)]);
  const byProvider = (p: string) => integrations.find((i) => i.provider === p);
  const shopify = byProvider("SHOPIFY");
  const fieldsOf = (p: string) => INTEGRATIONS.find((i) => i.provider === p)?.fields ?? [];

  const data: OnboardingData = {
    userName: auth.user.name.split(" ")[0] ?? auth.user.name,
    storeName: auth.store.name,
    canManageIntegrations: can(auth.role, "integrations.manage"),
    canManageSettings: can(auth.role, "settings.manage") && can(auth.role, "ai.agents.manage"),
    canManageAutomations: can(auth.role, "automations.manage"),
    shopify: { configured: !!shopify?.envConfigured, connected: shopify?.status === "CONNECTED", shop: shopify?.display.shop ?? null },
    whatsapp: { connected: byProvider("WHATSAPP")?.status === "CONNECTED", fields: fieldsOf("WHATSAPP") },
    metaAds: { connected: byProvider("META_ADS")?.status === "CONNECTED", fields: fieldsOf("META_ADS") },
    aiProviders: AI_PROVIDERS.map((p) => {
      const row = p.integration ? byProvider(p.integration) : undefined;
      return { key: p.key, name: p.name, defaultModel: p.defaultModel, integration: p.integration, configured: !p.integration || row?.status === "CONNECTED" || !!row?.envConfigured };
    }),
    ai: auth.store.settings.ai,
    templates: AUTOMATION_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, category: t.category, recommended: RECOMMENDED.has(t.key) })),
    installed: Object.fromEntries(automations.filter((a) => a.templateKey).map((a) => [a.templateKey!, { id: a.id, status: a.status }])),
  };

  return <OnboardingWizard data={JSON.parse(JSON.stringify(data))} />;
}
