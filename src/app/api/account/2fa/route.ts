import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { confirmTwoFactor, disableTwoFactor, startTwoFactor } from "@/services/auth.service";

/** POST {} → start setup (returns secret + otpauth URI); POST { code } → confirm. */
export const POST = route({ rateLimit: 10 }, async ({ req, ctx }) => {
  const body = await parseJson(req, z.object({ code: z.string().trim().max(10).optional() })).catch(() => ({ code: undefined }));
  if (body.code) {
    await confirmTwoFactor(ctx, body.code);
    return { enabled: true };
  }
  return startTwoFactor(ctx);
});

export const DELETE = route({ rateLimit: 10 }, async ({ req, ctx }) => {
  const { password } = await parseJson(req, z.object({ password: z.string().min(1) }));
  await disableTwoFactor(ctx, password);
  return { enabled: false };
});
