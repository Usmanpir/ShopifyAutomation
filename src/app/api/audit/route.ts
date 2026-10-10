import { parseQuery, route } from "@/lib/api";
import { auditQuerySchema, listAuditLogs } from "@/services/settings.service";

export const GET = route({ permission: "audit.view" }, async ({ req, auth }) => listAuditLogs(auth.store.id, parseQuery(req, auditQuerySchema)));
