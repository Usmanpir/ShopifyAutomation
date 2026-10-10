/**
 * Background worker process (BullMQ). Run with `npm run worker`.
 *
 * Processes: webhooks, automation dispatch/resume, WhatsApp AI replies,
 * order risk analysis, reports, sync jobs, AI insights and the demo simulator.
 * A repeatable `scheduler.tick` job fires every minute and fans out each
 * store's configurable cron schedules.
 */
import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { QUEUE_NAME, enqueue } from "@/lib/queue";
import { jobHandlers } from "@/lib/queue/handlers";
import type { JobName } from "@/lib/queue/jobs";
import { getRedis } from "@/lib/redis";
import { Queue } from "bullmq";

async function main() {
  const connection = getRedis();
  if (!connection) {
    console.error("[worker] REDIS_URL is not set. Without Redis, jobs run inline in the web process and the scheduler is driven by /api/cron/tick.");
    process.exit(1);
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = jobHandlers[job.name as JobName] as ((data: unknown) => Promise<unknown>) | undefined;
      if (!handler) throw new Error(`No handler for job ${job.name}`);
      return handler(job.data);
    },
    { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 8) },
  );

  worker.on("completed", (job) => {
    if (job.name !== "scheduler.tick") console.log(`[worker] ✓ ${job.name} (${job.id})`);
  });
  worker.on("failed", (job, err) => console.error(`[worker] ✗ ${job?.name} (${job?.id}) attempt ${job?.attemptsMade}:`, err.message));

  // Every-minute scheduler tick (idempotent per minute).
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.upsertJobScheduler("scheduler-tick", { every: 60_000 }, { name: "scheduler.tick", data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } });

  // Warm-up: run one tick immediately so demo stores come alive right away.
  await enqueue("scheduler.tick", {});
  console.log(`[worker] listening on queue "${QUEUE_NAME}"`);

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await worker.close();
    await queue.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
