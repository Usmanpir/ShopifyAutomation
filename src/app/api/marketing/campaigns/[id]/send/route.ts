import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { sendMarketingCampaign } from "@/services/marketing.service";

export const POST = route<{ id: string }>({ permission: "marketing.send", rateLimit: 6 }, async ({ params, ctx, auth }) => {
  const c = await db.marketingCampaign.findFirst({ where: { id: params.id, storeId: auth.store.id } });
  if (!c) throw notFound("Campaign");
  if (c.status === "PENDING_APPROVAL") throw conflict("This campaign is waiting for approval in the Approval Center");
  return sendMarketingCampaign(ctx, params.id);
});
