import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { togglePromotion } from "@/services/marketing.service";

export const PATCH = route<{ id: string }>({ permission: "marketing.manage" }, async ({ req, params, ctx }) => togglePromotion(ctx, params.id, (await parseJson(req, z.object({ active: z.boolean() }))).active));
