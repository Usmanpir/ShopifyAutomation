import { route } from "@/lib/api";
import { getThread } from "@/services/assistant.service";

export const GET = route<{ id: string }>({ permission: "ai.use" }, async ({ params, ctx }) => getThread(ctx, params.id));
