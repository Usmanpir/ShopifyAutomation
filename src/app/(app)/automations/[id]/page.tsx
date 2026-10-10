import { notFound } from "next/navigation";
import { AutomationBuilder, type AutomationDetail } from "@/features/automations/builder/automation-builder";
import { requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { getAutomation } from "@/services/automation.service";

async function load(storeId: string, id: string) {
  try {
    return await getAutomation(storeId, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/automations/[id]">) {
  const auth = await requireAuth("automations.view");
  const { id } = await params;
  const a = await load(auth.store.id, id);
  return { title: a.name };
}

export default async function AutomationBuilderPage({ params, searchParams }: PageProps<"/automations/[id]">) {
  const auth = await requireAuth("automations.view");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await load(auth.store.id, id);
  const automation: AutomationDetail = { id: a.id, name: a.name, description: a.description, status: a.status, graph: JSON.parse(JSON.stringify(a.graph)) };

  return (
    <AutomationBuilder
      key={a.id}
      automation={automation}
      canManage={can(auth.role, "automations.manage")}
      initialPanel={sp.tab === "runs" ? "runs" : "step"}
      isNew={sp.new === "1"}
    />
  );
}
