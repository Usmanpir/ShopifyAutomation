import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { markRead } from "@/services/notification.service";

export const POST = route({}, async ({ req, auth }) => {
  const { ids } = await parseJson(req, z.object({ ids: z.union([z.literal("all"), z.array(z.string()).max(200)]) }));
  await markRead(auth.store.id, auth.user.id, ids);
  return { ok: true };
});
