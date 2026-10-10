import { route } from "@/lib/api";
import { priorityQueue } from "@/services/priority.service";

/** The ranked "Needs attention" queue (AI Priority Engine). */
export const GET = route({ permission: "dashboard.view" }, async ({ auth }) => priorityQueue(auth.store.id, { role: auth.role }));
