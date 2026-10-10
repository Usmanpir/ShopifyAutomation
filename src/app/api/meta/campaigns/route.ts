import { parseQuery, route } from "@/lib/api";
import { rangeQuerySchema } from "@/lib/dates";
import { adsOverview } from "@/services/meta.service";

export const GET = route({ permission: "ads.view" }, async ({ req, auth }) => {
  const ov = await adsOverview(auth.store.id, parseQuery(req, rangeQuerySchema));
  return { range: ov.range, campaigns: ov.campaigns };
});
