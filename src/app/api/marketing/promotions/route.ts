import { parseJson, route } from "@/lib/api";
import { createPromotion, promotionCreateSchema } from "@/services/marketing.service";

export const POST = route({ permission: "marketing.manage" }, async ({ req, ctx }) => createPromotion(ctx, await parseJson(req, promotionCreateSchema)));
