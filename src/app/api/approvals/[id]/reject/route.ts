import { parseJson, route } from "@/lib/api";
import { rejectDecision, reviewSchema } from "@/services/decision.service";

export const POST = route<{ id: string }>({ permission: "approvals.decide", rateLimit: 30 }, async ({ req, params, ctx }) => {
  const { note } = await parseJson(req, reviewSchema).catch(() => ({ note: undefined }));
  return rejectDecision(ctx, params.id, note);
});
