import { route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route({ permission: "conversations.view" }, async ({ auth }) => db.messageTemplate.findMany({ where: { storeId: auth.store.id }, orderBy: { name: "asc" } }));
