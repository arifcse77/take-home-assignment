import { Worker } from "bullmq";
import { redis, QUEUE_NAME } from "./redis.js";
import { runExtractionForVersion } from "./extraction.js";
import { recoverStuckExtractions } from "./recover-jobs.js";

await recoverStuckExtractions();

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { versionId } = job.data as { versionId: string };
    await runExtractionForVersion(versionId);
  },
  { connection: redis, concurrency: 2 }
);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Extraction worker started");