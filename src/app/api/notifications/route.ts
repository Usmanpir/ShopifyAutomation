import { z } from "zod";
import { parseQuery, route } from "@/lib/api";
import { listNotifications } from "@/services/notification.service";

export const GET = route({}, async ({ req, auth }) => {
  const q = parseQuery(
    req,
    z.object({
      type: z.enum(["ORDER", "INVENTORY", "CUSTOMER", "WHATSAPP", "ADS", "AUTOMATION", "AI", "SYSTEM"]).optional(),
      status: z.enum(["unread", "all", "archived"]).default("all"),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  );
  return listNotifications(auth.store.id, auth.user.id, q);
});
