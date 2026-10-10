import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

/** Liveness/readiness probe for load balancers and uptime checks. */
export async function GET() {
  const checks: Record<string, "ok" | "down" | "not_configured"> = { database: "down", redis: "not_configured" };
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }
  const redis = getRedis();
  if (redis) {
    try {
      checks.redis = (await redis.ping()) === "PONG" ? "ok" : "down";
    } catch {
      checks.redis = "down";
    }
  }
  const healthy = checks.database === "ok" && checks.redis !== "down";
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503 });
}
