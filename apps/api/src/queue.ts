import { Queue } from "bullmq";
import { redis, QUEUE_NAME } from "./redis.js";

export const extractionQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

/** Job id = version id so duplicate enqueue is a no-op for in-flight work. */
export async function enqueueExtraction(versionId: string): Promise<void> {
  const jobId = `extract-${versionId}`;
  const existing = await extractionQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting" || state === "delayed") {
      return;
    }
    if (state === "completed") {
      return;
    }
    await existing.remove();
  }
  await extractionQueue.add("extract", { versionId }, { jobId });
  const { prisma } = await import("@lomi/database");
  await prisma.documentVersion.update({
    where: { id: versionId },
    data: { jobEnqueuedAt: new Date(), status: "queued" },
  });
}