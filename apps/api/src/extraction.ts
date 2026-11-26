import {
  EXPECTED_FIELDS,
  evidenceExistsInText,
  evidenceUnchanged,
  type DocumentType,
  type LlmFieldResult,
} from "@lomi/shared";
import { prisma, type ReviewStatus } from "@lomi/database";
import { parsePdfFile } from "./pdf.js";
import { extractWithLlm } from "./llm.js";

function validatedField(
  spec: { field: string },
  llm: LlmFieldResult | undefined,
  parsedText: string
): { value: string | null; evidence: string | null; gapReason: string | null } {
  if (!llm || llm.value == null || !llm.evidence) {
    return {
      value: null,
      evidence: llm?.evidence ?? null,
      gapReason: llm?.gap_reason ?? "Field not found",
    };
  }
  if (!evidenceExistsInText(llm.evidence, parsedText)) {
    return {
      value: null,
      evidence: llm.evidence,
      gapReason: "Evidence not found verbatim in document (hallucination guard)",
    };
  }
  return { value: llm.value, evidence: llm.evidence, gapReason: null };
}

export async function runExtractionForVersion(versionId: string): Promise<void> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: true },
  });
  if (!version) return;

  if (version.status === "extracted") {
    return;
  }

  await prisma.documentVersion.update({
    where: { id: versionId },
    data: {
      status: "extracting",
      extractionStartedAt: new Date(),
      failureReason: null,
    },
  });

  try {
    const parsedText = await parsePdfFile(version.filePath);
    const docType = version.document.type as DocumentType;
    const { prompt, rawResponse, fields } = await extractWithLlm(docType, parsedText);

    await prisma.documentVersion.update({
      where: { id: versionId },
      data: { parsedText, extractionPrompt: prompt, extractionRawResponse: rawResponse },
    });

    const llmByField = new Map(fields.map((f) => [f.field, f]));
    const specs = EXPECTED_FIELDS[docType];

    const previousVersion =
      version.version > 1
        ? await prisma.documentVersion.findUnique({
            where: {
              documentId_version: {
                documentId: version.documentId,
                version: version.version - 1,
              },
            },
            include: { values: true },
          })
        : null;

    const prevByField = new Map(
      previousVersion?.values.map((v) => [v.fieldName, v]) ?? []
    );

    await prisma.$transaction(async (tx) => {
      for (const spec of specs) {
        const v = validatedField(spec, llmByField.get(spec.field), parsedText);
        const prev = prevByField.get(spec.field);

        let reviewStatus: ReviewStatus = "pending";
        let correctedValue: string | null = null;
        let reviewNote: string | null = null;
        let reviewedAt: Date | null = null;
        let carriedFromValueId: string | null = null;
        let previousSnapshot: object | null = null;

        if (prev) {
          const sameEvidence = evidenceUnchanged(prev.evidence, v.evidence);
          const reviewed =
            prev.reviewStatus === "approved" ||
            prev.reviewStatus === "corrected" ||
            prev.reviewStatus === "carried_over";
          if (sameEvidence && reviewed) {
            reviewStatus = "carried_over";
            correctedValue = prev.correctedValue;
            reviewNote = prev.reviewNote;
            reviewedAt = prev.reviewedAt ?? new Date();
            carriedFromValueId = prev.id;
          } else if (!sameEvidence) {
            reviewStatus = "pending";
            previousSnapshot = {
              value: prev.value,
              evidence: prev.evidence,
              reviewStatus: prev.reviewStatus,
              correctedValue: prev.correctedValue,
              reviewNote: prev.reviewNote,
            };
          }
        }

        // Gaps always stay pending unless carried (same evidence gap)
        if (v.value == null) {
          if (prev && evidenceUnchanged(prev.evidence, v.evidence) && prev.gapReason === v.gapReason) {
            reviewStatus = prev.reviewStatus === "approved" || prev.reviewStatus === "corrected"
              ? "carried_over"
              : prev.reviewStatus;
            correctedValue = prev.correctedValue;
            reviewNote = prev.reviewNote;
            reviewedAt = prev.reviewedAt;
            carriedFromValueId = prev.id;
          } else {
            reviewStatus = "pending";
          }
        }

        await tx.extractedValue.upsert({
          where: { versionId_fieldName: { versionId, fieldName: spec.field } },
          create: {
            versionId,
            fieldName: spec.field,
            value: v.value,
            evidence: v.evidence,
            gapReason: v.gapReason,
            reviewStatus,
            correctedValue,
            reviewNote,
            reviewedAt,
            carriedFromValueId,
            previousSnapshot: previousSnapshot ?? undefined,
          },
          update: {
            value: v.value,
            evidence: v.evidence,
            gapReason: v.gapReason,
            reviewStatus,
            correctedValue,
            reviewNote,
            reviewedAt,
            carriedFromValueId,
            previousSnapshot: previousSnapshot ?? undefined,
          },
        });
      }

      await tx.documentVersion.update({
        where: { id: versionId },
        data: {
          status: "extracted",
          extractionFinishedAt: new Date(),
          failureReason: null,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.documentVersion.update({
      where: { id: versionId },
      data: {
        status: "failed",
        failureReason: message,
        extractionFinishedAt: new Date(),
      },
    });
    throw err;
  }
}