import { parseJson, route } from "@/lib/api";
import { approveDecision, reviewSchema } from "@/services/decision.service";

/** Human approves → action executes through the guarded tool executor → audit log. */
export const POST = route<{ id: string }>({ permission: "approvals.decide", rateLimit: 30 }, async ({ req, params, ctx }) => {
  const { note } = await parseJson(req, reviewSchema).catch(() => ({ note: undefined }));
  return approveDecision(ctx, params.id, note);
});
