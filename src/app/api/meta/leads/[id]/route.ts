import { parseJson, route } from "@/lib/api";
import { leadUpdateSchema, updateLead } from "@/services/meta.service";

export const PATCH = route<{ id: string }>({ permission: "marketing.manage" }, async ({ req, params, ctx }) => updateLead(ctx, params.id, (await parseJson(req, leadUpdateSchema)).status));
