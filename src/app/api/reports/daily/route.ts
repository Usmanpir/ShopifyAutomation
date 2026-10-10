import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { generateDailyReport, listDailyReports } from "@/services/report.service";

export const GET = route({ permission: "reports.view" }, async ({ auth }) => listDailyReports(auth.store.id));

/** Generate (or regenerate) the daily AI report for a date (defaults to yesterday). */
export const POST = route({ permission: "reports.view", rateLimit: 10 }, async ({ req, auth }) => {
  const { date } = await parseJson(req, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })).catch(() => ({ date: undefined }));
  return generateDailyReport(auth.store.id, date);
});
