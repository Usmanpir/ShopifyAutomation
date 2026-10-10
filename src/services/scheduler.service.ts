import { cronMatches } from "@/lib/cron";
import { db } from "@/lib/db";
import { enqueue, type JobName } from "@/lib/queue";
import { resumeDueRuns } from "./automation.service";
import { expireDecisions } from "./decision.service";
import { listStoreIds } from "./store.service";

/** Schedule key in StoreSettings.schedules → job to enqueue. */
const SCHEDULED_JOBS: Record<string, JobName> = {
  dailyReport: "report.daily",
  inventoryAnalysis: "inventory.analyze",
  customerSegmentation: "customers.segment",
  analyticsSync: "analytics.sync",
  courierTracking: "courier.track",
  aiInsights: "ai.insights",
  abandonedFollowUp: "followup.abandoned",
};

/**
 * Runs once a minute (BullMQ repeatable job, or Vercel Cron → /api/cron/tick).
 * Resumes waiting automations, expires stale approvals and fans out each
 * store's configurable cron schedules in the store's own timezone.
 */
export async function schedulerTick(at = new Date()) {
  // Align to the minute so concurrent ticks don't double-fire.
  const minute = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
  const resumed = await resumeDueRuns();
  const expired = await expireDecisions();
  const enqueued: string[] = [];

  for (const store of await listStoreIds()) {
    for (const [key, job] of Object.entries(SCHEDULED_JOBS)) {
      const expr = store.settings.schedules[key as keyof typeof store.settings.schedules];
      try {
        if (expr && cronMatches(expr, minute, store.timezone)) {
          await enqueue(job, { storeId: store.id } as never, { jobId: `${job}:${store.id}:${minute.toISOString()}` });
          enqueued.push(`${job}:${store.id}`);
        }
      } catch (err) {
        console.warn(`[scheduler] ${key} for ${store.id}:`, (err as Error).message);
      }
    }
    // Demo stores get a little live activity every 3 minutes.
    if (store.demoMode && minute.getUTCMinutes() % 3 === 0) {
      await enqueue("demo.simulate", { storeId: store.id }, { jobId: `demo:${store.id}:${minute.toISOString()}` });
    }
  }
  // Housekeeping
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { resumed, expired, enqueued };
}
