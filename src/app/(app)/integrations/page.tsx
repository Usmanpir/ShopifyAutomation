import { PageContainer, PageHeader } from "@/components/shared/page";
import { IntegrationsMarketplace } from "@/features/integrations/marketplace";
import { WebhookEndpoints, WebhookEvents } from "@/features/integrations/webhooks";
import { requireAuth } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { can } from "@/lib/rbac";
import { listIntegrations, webhookActivity } from "@/services/integration.service";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const auth = await requireAuth("integrations.view");
  const [integrations, webhooks] = await Promise.all([listIntegrations(auth.store.id), webhookActivity(auth.store.id)]);
  const canManage = can(auth.role, "integrations.manage");

  return (
    <PageContainer>
      <PageHeader
        title="Integrations"
        description="Connect your store, channels and AI providers. Credentials are verified, encrypted at rest and never shown again."
      />
      <IntegrationsMarketplace items={JSON.parse(JSON.stringify(integrations))} canManage={canManage} />
      <div className="space-y-4 pt-2">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Webhooks</h2>
          <p className="text-[13px] text-muted-foreground">Real-time events from Shopify, WhatsApp and Meta.</p>
        </div>
        {canManage && <WebhookEndpoints appUrl={env().APP_URL} />}
        <WebhookEvents rows={JSON.parse(JSON.stringify(webhooks))} />
      </div>
    </PageContainer>
  );
}
