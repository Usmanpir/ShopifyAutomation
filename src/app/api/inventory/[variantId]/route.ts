import { parseJson, route } from "@/lib/api";
import { adjustInventory, adjustSchema, getVariantInventory } from "@/services/inventory.service";

export const GET = route<{ variantId: string }>({ permission: "inventory.view" }, async ({ params, auth }) => getVariantInventory(auth.store.id, params.variantId));

/** PATCH { mode: set|adjust, quantity, reason } */
export const PATCH = route<{ variantId: string }>({ permission: "inventory.update" }, async ({ req, params, ctx }) => adjustInventory(ctx, params.variantId, await parseJson(req, adjustSchema)));
