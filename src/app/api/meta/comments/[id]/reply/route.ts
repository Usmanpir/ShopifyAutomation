import { parseJson, route } from "@/lib/api";
import { commentReplySchema, replyToComment } from "@/services/meta.service";

export const POST = route<{ id: string }>({ permission: "marketing.manage" }, async ({ req, params, ctx }) => replyToComment(ctx, params.id, (await parseJson(req, commentReplySchema)).text));
