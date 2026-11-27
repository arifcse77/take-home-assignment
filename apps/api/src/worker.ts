import { Worker } from "bullmq";
import { redis, QUEUE_NAME } from "./redis.js";
import { runExtractionForVersion } from "./extraction.js";
import { recoverStuckExtractions } from "./recover-jobs.js";

for (let attempt = 0; attempt < 30; attempt++) {
  try {
    await recoverStuckExtractions();
    break;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "P2021" || attempt === 29) throw err;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

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