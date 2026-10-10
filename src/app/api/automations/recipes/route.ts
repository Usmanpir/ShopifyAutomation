import { parseJson, route } from "@/lib/api";
import { createFromRecipe, recipeCreateSchema } from "@/services/popular-automations.service";

/** Automation wizard: build an automation from a plain-language recipe. */
export const POST = route({ permission: "automations.manage", rateLimit: 20 }, async ({ req, ctx }) => createFromRecipe(ctx, await parseJson(req, recipeCreateSchema)));
