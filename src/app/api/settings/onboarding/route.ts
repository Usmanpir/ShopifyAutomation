import { route } from "@/lib/api";
import { completeOnboarding } from "@/services/settings.service";

export const POST = route({}, async ({ ctx }) => {
  await completeOnboarding(ctx);
  return { ok: true };
});
