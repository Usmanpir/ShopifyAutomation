import { parseJson, route } from "@/lib/api";
import { changePassword, changePasswordSchema } from "@/services/auth.service";

export const POST = route({ rateLimit: 10 }, async ({ req, ctx, auth }) => {
  await changePassword(ctx, auth.sessionId, await parseJson(req, changePasswordSchema));
  return { ok: true };
});
