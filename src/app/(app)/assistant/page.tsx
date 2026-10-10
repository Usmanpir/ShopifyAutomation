import { AssistantApp } from "@/features/assistant/assistant-app";
import { requireAuth } from "@/lib/auth/session";
import { contextFromAuth } from "@/lib/service-context";
import { listThreads } from "@/services/assistant.service";

export const metadata = { title: "AI Assistant" };

export default async function AssistantPage() {
  const auth = await requireAuth("ai.use");
  const threads = await listThreads(contextFromAuth(auth));
  return <AssistantApp initialThreads={JSON.parse(JSON.stringify(threads))} />;
}
