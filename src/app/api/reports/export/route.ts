import { z } from "zod";
import { parseQuery, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { buildReport, reportQuerySchema, reportToCsv, reportToPdf } from "@/services/report.service";

/** GET /api/reports/export?type=daily_sales&range=30d&format=csv|pdf */
export const GET = route({ permission: "reports.export", rateLimit: 20 }, async ({ req, auth, ctx }) => {
  const q = parseQuery(req, reportQuerySchema.extend({ format: z.enum(["csv", "pdf"]).default("csv") }));
  const report = await buildReport(auth.store.id, q);
  const filename = `${auth.store.slug}-${q.type}-${new Date().toISOString().slice(0, 10)}.${q.format}`;
  await audit(ctx, { action: "report.export", resourceType: "report", resourceLabel: `${report.title} (${q.format.toUpperCase()})` });
  if (q.format === "pdf") {
    const bytes = await reportToPdf(report, auth.store.name);
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  }
  return new Response("﻿" + reportToCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } });
});
