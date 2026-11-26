import { prisma } from "@lomi/database";
import { enqueueExtraction } from "./queue.js";

/** Re-enqueue versions stuck in queued/extracting after Redis flush or crash. */
export async function recoverStuckExtractions(): Promise<void> {
  const stuck = await prisma.documentVersion.findMany({
    where: { status: { in: ["queued", "extracting"] } },
    select: { id: true, status: true },
  });

  for (const v of stuck) {
    if (v.status === "extracting") {
      await prisma.documentVersion.update({
        where: { id: v.id },
        data: { status: "queued" },
      });
    }
    await enqueueExtraction(v.id);
  }

  const failedRetryable = await prisma.documentVersion.findMany({
    where: { status: "failed" },
    select: { id: true },
  });

  // Do not auto-retry failed — user must POST retry. Only stuck in-flight.
  void failedRetryable;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  recoverStuckExtractions()
    .then(() => {
      console.log("Recovery complete");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}