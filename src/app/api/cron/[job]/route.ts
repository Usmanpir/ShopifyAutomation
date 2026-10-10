import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { errorResponse } from "@/lib/api";
import { schedulerTick } from "@/services/scheduler.service";

/**
 * Serverless scheduler entry (Vercel Cron). Protected by CRON_SECRET via
 * `Authorization: Bearer <secret>`. `tick` fans out every store's schedules.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/cron/[job]">) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const { job } = await ctx.params;
  try {
    if (job === "tick") return NextResponse.json({ data: await schedulerTick() });
    return NextResponse.json({ error: { message: `Unknown job ${job}` } }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}
