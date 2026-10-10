import { parseQuery, route } from "@/lib/api";
import { buildReport, reportQuerySchema } from "@/services/report.service";

export const GET = route({ permission: "reports.view" }, async ({ req, auth }) => buildReport(auth.store.id, parseQuery(req, reportQuerySchema)));
