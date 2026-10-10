import { AISettingsForm, type ProviderOption } from "@/features/settings/ai-settings-form";
import { ApprovalRulesForm } from "@/features/settings/approval-rules-form";
import { ReadOnlyNotice } from "@/features/settings/form-bits";
import { SettingsHeading } from "@/features/settings/settings-skeleton";
import { AI_PROVIDERS } from "@/lib/ai/factory";
import { requireAuth } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listIntegrations } from "@/services/integration.service";

export const metadata = { title: "AI settings" };

export default async function AISettingsPage() {
  const auth = await requireAuth("settings.view");
  const readOnly = !can(auth.role, "settings.manage") || !can(auth.role, "ai.agents.manage");
  const integrations = await listIntegrations(auth.store.id);

  // Only booleans leave the server — never keys.
  const providers: ProviderOption[] = AI_PROVIDERS.map((p) => {
    if (!p.integration) return { key: p.key, name: p.name, defaultModel: p.defaultModel, configured: true, source: "builtin" };
    const row = integrations.find((i) => i.provider === p.integration);
    const viaIntegration = row?.status === "CONNECTED";
    const viaEnv = !!row?.envConfigured;
    return { key: p.key, name: p.name, defaultModel: p.defaultModel, configured: viaIntegration || viaEnv, source: viaIntegration ? "integration" : viaEnv ? "env" : null };
  });

  const ai = auth.store.settings.ai;
  return (
    <>
      <SettingsHeading title="AI" description="Choose the model that powers your assistant and agents, and the guardrails it must respect." />
      {readOnly && <ReadOnlyNotice>Only owners and admins can change AI settings and approval rules.</ReadOnlyNotice>}
      <AISettingsForm initial={ai} providers={providers} readOnly={readOnly} />
      <ApprovalRulesForm initial={auth.store.settings.approvals} readOnly={readOnly} />
    </>
  );
}
