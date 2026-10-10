import { route } from "@/lib/api";
import { socialOverview } from "@/services/meta.service";

export const GET = route({ permission: "ads.view" }, async ({ auth }) => socialOverview(auth.store.id));
