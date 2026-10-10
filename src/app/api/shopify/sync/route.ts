import { route } from "@/lib/api";
import { syncShopifyProducts } from "@/services/shopify.service";

/** Manual "Sync now" — catalog backfill via GraphQL. */
export const POST = route({ permission: "integrations.manage", rateLimit: 4 }, async ({ auth }) => syncShopifyProducts(auth.store.id));
