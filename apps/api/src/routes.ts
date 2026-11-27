import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma, ReviewStatus } from "@lomi/database";
import { config } from "./config.js";
import { enqueueExtraction } from "./queue.js";
import { parseUpload } from "./multipart.js";
import { countReviewStatuses } from "./progress.js";

function displayValue(v: {
  value: string | null;
  correctedValue: string | null;
  reviewStatus: ReviewStatus;
}): string | null {
  if (v.reviewStatus === "corrected" && v.correctedValue != null) return v.correctedValue;
  return v.value;
}

function mapValueRows(
  values: Array<{
    id: string;
    fieldName: string;
    value: string | null;
    evidence: string | null;
    gapReason: string | null;
    reviewStatus: ReviewStatus;
    correctedValue: string | null;
    reviewNote: string | null;
    previousSnapshot: unknown;
  }>
) {
  return values.map((v) => ({
    id: v.id,
    fieldName: v.fieldName,
    value: v.value,
    displayValue: displayValue(v),
    evidence: v.evidence,
    gapReason: v.gapReason,
    reviewStatus: v.reviewStatus,
    correctedValue: v.correctedValue,
    reviewNote: v.reviewNote,
    previousSnapshot: v.previousSnapshot,
  }));
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  app.get("/documents", async () => {
    const docs = await prisma.document.findMany({
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: { values: { select: { reviewStatus: true } } },
        },
      },
      orderBy: { title: "asc" },
    });

    return docs.map((d) => {
      const current = d.versions[0];
      const progress =
        current && current.values.length > 0 ? countReviewStatuses(current.values) : null;
      return {
        id: d.id,
        type: d.type,
        title: d.title,
        currentVersion: current?.version ?? 0,
        status: current?.status ?? "queued",
        progress,
      };
    });
  });

  app.post("/documents", async (req, reply) => {
    let buffer: Buffer;
    let fields: Record<string, string>;
    try {
      ({ buffer, fields } = await parseUpload(req));
    } catch {
      return reply.code(400).send({ error: "file required" });
    }

    const type = fields.type;
    const title = fields.title ?? "Uploaded document";

    if (!type) return reply.code(400).send({ error: "type required" });

    const id = randomUUID();
    await fs.mkdir(config.storageDir, { recursive: true });
    const filePath = path.join(config.storageDir, `${id}-v1.pdf`);
    await fs.writeFile(filePath, buffer);

    await prisma.document.create({
      data: {
        id,
        type,
        title,
        versions: {
          create: {
            version: 1,
            status: "queued",
            filePath,
          },
        },
      },
    });

    const version = await prisma.documentVersion.findFirst({
      where: { documentId: id, version: 1 },
    });
    if (version) await enqueueExtraction(version.id);

    return reply.code(201).send({ id, status: "queued" });
  });

  app.post<{ Params: { id: string } }>("/documents/:id/versions", async (req, reply) => {
    const { id } = req.params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return reply.code(404).send({ error: "not found" });

  const latest = await prisma.documentVersion.findFirst({
      where: { documentId: id },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    // Allow upload while previous version is still extracting (parallel versions).
    let buffer: Buffer;
    try {
      ({ buffer } = await parseUpload(req));
    } catch {
      return reply.code(400).send({ error: "file required" });
    }
    const filePath = path.join(config.storageDir, `${id}-v${nextVersion}.pdf`);
    await fs.writeFile(filePath, buffer);

    const version = await prisma.documentVersion.create({
      data: {
        documentId: id,
        version: nextVersion,
        status: "queued",
        filePath,
      },
    });

    await enqueueExtraction(version.id);
    return reply.code(201).send({ documentId: id, version: nextVersion, status: "queued" });
  });

  app.get<{ Params: { id: string } }>("/documents/:id/versions", async (req, reply) => {
    const { id } = req.params;
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return reply.code(404).send({ error: "not found" });

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { version: "desc" },
      include: { values: { select: { reviewStatus: true } } },
    });

    return versions.map((v) => ({
      version: v.version,
      status: v.status,
      createdAt: v.createdAt,
      progress: v.values.length > 0 ? countReviewStatuses(v.values) : null,
    }));
  });

  app.get<{ Params: { id: string; version: string } }>(
    "/documents/:id/versions/:version",
    async (req, reply) => {
      const { id } = req.params;
      const versionNum = Number(req.params.version);
      if (!Number.isFinite(versionNum) || versionNum < 1) {
        return reply.code(400).send({ error: "invalid version" });
      }

      const doc = await prisma.document.findUnique({ where: { id } });
      if (!doc) return reply.code(404).send({ error: "not found" });

      const version = await prisma.documentVersion.findUnique({
        where: { documentId_version: { documentId: id, version: versionNum } },
        include: { values: true },
      });
      if (!version) return reply.code(404).send({ error: "version not found" });

      const latest = await prisma.documentVersion.findFirst({
        where: { documentId: id },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      return {
        id: doc.id,
        type: doc.type,
        title: doc.title,
        currentVersion: version.version,
        isLatest: latest?.version === version.version,
        status: version.status,
        failureReason: version.failureReason,
        parsedText: version.parsedText,
        values:
          version.status === "extracted" || version.status === "failed"
            ? mapValueRows(version.values)
            : [],
      };
    }
  );

  app.get<{ Params: { id: string } }>("/documents/:id", async (req, reply) => {
    const { id } = req.params;
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1, include: { values: true } },
      },
    });
    if (!doc) return reply.code(404).send({ error: "not found" });

    const current = doc.versions[0];
    if (!current) return reply.code(404).send({ error: "no versions" });

    return {
      id: doc.id,
      type: doc.type,
      title: doc.title,
      currentVersion: current.version,
      status: current.status,
      failureReason: current.failureReason,
      parsedText: current.parsedText,
      values:
        current.status === "extracted" || current.status === "failed"
          ? mapValueRows(current.values)
          : [],
    };
  });

  app.get<{ Params: { id: string } }>("/documents/:id/progress", async (req, reply) => {
    const { id } = req.params;
    const current = await prisma.documentVersion.findFirst({
      where: { documentId: id },
      orderBy: { version: "desc" },
      include: { values: true },
    });
    if (!current) return reply.code(404).send({ error: "not found" });

    const counts = countReviewStatuses(current.values);
    return { documentId: id, version: current.version, status: current.status, ...counts };
  });

  app.post<{ Params: { id: string }; Body: { action: "approve" | "correct"; correctedValue?: string; note?: string } }>(
    "/values/:id/review",
    async (req, reply) => {
      const { id } = req.params;
      const { action, correctedValue, note } = req.body ?? {};

      if (action !== "approve" && action !== "correct") {
        return reply.code(400).send({ error: "action must be approve or correct" });
      }
      if (action === "correct" && !correctedValue) {
        return reply.code(400).send({ error: "correctedValue required for correct" });
      }

      const value = await prisma.extractedValue.findUnique({ where: { id } });
      if (!value) return reply.code(404).send({ error: "not found" });

      const updated = await prisma.extractedValue.update({
        where: { id },
        data: {
          reviewStatus: action === "approve" ? "approved" : "corrected",
          correctedValue: action === "correct" ? correctedValue : null,
          reviewNote: note ?? null,
          reviewedAt: new Date(),
        },
      });

      return {
        id: updated.id,
        reviewStatus: updated.reviewStatus,
        correctedValue: updated.correctedValue,
        displayValue: displayValue(updated),
      };
    }
  );

  app.post<{ Params: { id: string } }>("/documents/:id/retry", async (req, reply) => {
    const { id } = req.params;
    const current = await prisma.documentVersion.findFirst({
      where: { documentId: id },
      orderBy: { version: "desc" },
    });
    if (!current) return reply.code(404).send({ error: "not found" });
    if (current.status !== "failed") {
      return reply.code(400).send({ error: "only failed extractions can be retried" });
    }
    await enqueueExtraction(current.id);
    return { status: "queued" };
  });
}