import { parseJson, route } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { can } from "@/lib/rbac";
import { campaignCreateSchema, createMarketingCampaign } from "@/services/marketing.service";

export const POST = route({ permission: "marketing.manage", rateLimit: 20 }, async ({ req, ctx, auth }) => {
  const input = await parseJson(req, campaignCreateSchema);
  if (input.sendNow && !can(auth.role, "marketing.send")) throw forbidden("Your role can't send campaigns");
  return createMarketingCampaign(ctx, input);
});
