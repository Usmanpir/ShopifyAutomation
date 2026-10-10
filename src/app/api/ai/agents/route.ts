import { route } from "@/lib/api";
import { listAgentsWithStats } from "@/services/agent.service";

export const GET = route({ permission: "approvals.view" }, async ({ auth }) => listAgentsWithStats(auth.store.id));
