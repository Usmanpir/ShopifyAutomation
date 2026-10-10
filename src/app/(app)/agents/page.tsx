import { redirect } from "next/navigation";

/** The agent list now lives in the AI Team page (/ai); detail pages stay at /agents/[key]. */
export default function AgentsPage() {
  redirect("/ai");
}
