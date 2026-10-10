import { z } from "zod";
import { parseQuery, route } from "@/lib/api";
import { globalSearch } from "@/services/search.service";

export const GET = route({ rateLimit: 120 }, async ({ req, auth }) => {
  const { q } = parseQuery(req, z.object({ q: z.string().max(100).default("") }));
  return globalSearch(auth.store.id, auth.role, q, auth.store.currency, auth.store.locale);
});
