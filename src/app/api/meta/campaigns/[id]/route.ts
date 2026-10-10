import { z } from "zod";
import { parseJson, parseQuery, route } from "@/lib/api";
import { rangeQuerySchema } from "@/lib/dates";
import { toMinor } from "@/lib/money";
import { campaignDetail, changeCampaignBudget, setCampaignStatus } from "@/services/meta.service";

export const GET = route<{ id: string }>({ permission: "ads.view" }, async ({ req, params, auth }) => campaignDetail(auth.store.id, params.id, parseQuery(req, rangeQuerySchema)));

/** PATCH { status: ACTIVE|PAUSED } or { dailyBudgetMajor } — human changes are audited. */
export const PATCH = route<{ id: string }>({ permission: "ads.manage", rateLimit: 20 }, async ({ req, params, ctx }) => {
  const input = await parseJson(req, z.object({ status: z.enum(["ACTIVE", "PAUSED"]).optional(), dailyBudgetMajor: z.number().positive().max(10_000_000).optional() }));
  if (input.status) await setCampaignStatus(ctx, params.id, input.status);
  if (input.dailyBudgetMajor) await changeCampaignBudget(ctx, params.id, toMinor(input.dailyBudgetMajor));
  return { ok: true };
});
