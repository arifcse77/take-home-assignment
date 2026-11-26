import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@lomi/database";
import { config } from "./config.js";
import { enqueueExtraction } from "./queue.js";
import { recoverStuckExtractions } from "./recover-jobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureStorage(): Promise<void> {
  await fs.mkdir(config.storageDir, { recursive: true });
}

async function seedFromFixtures(): Promise<void> {
  const fixturesDir = path.isAbsolute(config.fixturesDir)
    ? config.fixturesDir
    : path.resolve(__dirname, "../../../fixtures");
  const manifestPath = path.join(fixturesDir, "documents.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as Array<{
    id: string;
    type: string;
    title: string;
    versions: Array<{ version: number; file: string }>;
  }>;

  for (const doc of manifest) {
    await prisma.document.upsert({
      where: { id: doc.id },
      create: { id: doc.id, type: doc.type, title: doc.title },
      update: { type: doc.type, title: doc.title },
    });

    const v1 = doc.versions.find((v) => v.version === 1);
    if (!v1) continue;

    const src = path.join(fixturesDir, v1.file);
    const dest = path.join(config.storageDir, `${doc.id}-v1.pdf`);
    await fs.copyFile(src, dest);

    const version = await prisma.documentVersion.upsert({
      where: { documentId_version: { documentId: doc.id, version: 1 } },
      create: {
        documentId: doc.id,
        version: 1,
        status: "queued",
        filePath: dest,
      },
      update: { filePath: dest },
    });

    if (version.status !== "extracted") {
      await enqueueExtraction(version.id);
    }
  }
}

async function main(): Promise<void> {
  await ensureStorage();
  await seedFromFixtures();
  await recoverStuckExtractions();
  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());