import { parseJson, route } from "@/lib/api";
import { generalSettingsSchema, updateGeneral } from "@/services/settings.service";

export const PATCH = route({ permission: "settings.manage" }, async ({ req, ctx }) => updateGeneral(ctx, await parseJson(req, generalSettingsSchema)));
