import { route } from "@/lib/api";
import { listIntegrations, webhookActivity } from "@/services/integration.service";

export const GET = route({ permission: "integrations.view" }, async ({ auth }) => ({
  integrations: await listIntegrations(auth.store.id),
  webhooks: await webhookActivity(auth.store.id),
}));
