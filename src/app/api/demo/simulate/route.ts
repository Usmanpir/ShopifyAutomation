import { route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { simulateDemoActivity } from "@/services/demo.service";

/** Demo mode: generate a burst of live activity (new order, replies, ad spend). */
export const POST = route({ permission: "dashboard.view", rateLimit: 10 }, async ({ auth }) => {
  if (!auth.store.demoMode) throw badRequest("Only available in demo mode");
  return simulateDemoActivity(auth.store.id);
});
