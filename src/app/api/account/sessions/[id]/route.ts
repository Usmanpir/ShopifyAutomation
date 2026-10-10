import { route } from "@/lib/api";
import { revokeSession } from "@/services/auth.service";

export const DELETE = route<{ id: string }>({}, async ({ params, ctx }) => {
  await revokeSession(ctx, params.id);
  return { ok: true };
});
