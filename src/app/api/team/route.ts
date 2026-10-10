import { parseJson, route } from "@/lib/api";
import { addMember, addMemberSchema, listMembers } from "@/services/auth.service";

export const GET = route({ permission: "settings.view" }, async ({ auth }) => listMembers(auth.store.id));

export const POST = route({ permission: "team.manage", rateLimit: 20 }, async ({ req, ctx }) => addMember(ctx, await parseJson(req, addMemberSchema)));
