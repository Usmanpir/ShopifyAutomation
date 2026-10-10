import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { archive } from "@/services/notification.service";

export const POST = route({}, async ({ req, auth }) => {
  const { ids } = await parseJson(req, z.object({ ids: z.array(z.string()).min(1).max(200) }));
  await archive(auth.store.id, auth.user.id, ids);
  return { ok: true };
});
