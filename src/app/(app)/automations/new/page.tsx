import { CreateDraft } from "@/features/automations/create-draft";
import { requireAuth } from "@/lib/auth/session";

export const metadata = { title: "New automation" };

export default async function NewAutomationPage() {
  await requireAuth("automations.manage");
  return <CreateDraft />;
}
