import { z } from "zod";
import { parseQuery, route } from "@/lib/api";
import { inventoryOverview } from "@/services/inventory.service";

export const GET = route({ permission: "inventory.view" }, async ({ req, auth }) => {
  const q = parseQuery(req, z.object({ q: z.string().max(100).optional(), status: z.enum(["low", "out", "fast", "slow", "critical"]).optional(), category: z.string().max(60).optional() }));
  return inventoryOverview(auth.store.id, q);
});
