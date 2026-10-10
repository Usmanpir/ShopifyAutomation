import { route } from "@/lib/api";
import { generateInsights, listInsights } from "@/services/insight.service";

export const GET = route({ permission: "dashboard.view" }, async ({ auth }) => listInsights(auth.store.id, 12));

/** Regenerate insights from live data now. */
export const POST = route({ permission: "ai.use", rateLimit: 6 }, async ({ auth }) => generateInsights(auth.store.id));
