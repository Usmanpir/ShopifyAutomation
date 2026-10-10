import { route } from "@/lib/api";
import { syncMetaAds } from "@/services/meta.service";

export const POST = route({ permission: "ads.manage", rateLimit: 6 }, async ({ auth }) => syncMetaAds(auth.store.id, 7));
