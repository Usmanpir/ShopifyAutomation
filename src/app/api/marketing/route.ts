import { route } from "@/lib/api";
import { marketingOverview } from "@/services/marketing.service";

export const GET = route({ permission: "marketing.view" }, async ({ auth }) => marketingOverview(auth.store.id));
