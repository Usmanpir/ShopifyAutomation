import { parseJson, route } from "@/lib/api";
import { removeMember, updateMemberRole, updateMemberSchema } from "@/services/auth.service";

export const PATCH = route<{ id: string }>({ permission: "team.manage" }, async ({ req, params, ctx }) => updateMemberRole(ctx, params.id, (await parseJson(req, updateMemberSchema)).role));

export const DELETE = route<{ id: string }>({ permission: "team.manage" }, async ({ params, ctx }) => {
  await removeMember(ctx, params.id);
  return { ok: true };
});
