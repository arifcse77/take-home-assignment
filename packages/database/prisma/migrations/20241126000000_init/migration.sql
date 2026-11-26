-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('queued', 'extracting', 'extracted', 'failed');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'corrected', 'carried_over');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'queued',
    "filePath" TEXT NOT NULL,
    "parsedText" TEXT,
    "extractionPrompt" TEXT,
    "extractionRawResponse" TEXT,
    "failureReason" TEXT,
    "jobEnqueuedAt" TIMESTAMP(3),
    "extractionStartedAt" TIMESTAMP(3),
    "extractionFinishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedValue" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "value" TEXT,
    "evidence" TEXT,
    "gapReason" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "correctedValue" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "carriedFromValueId" TEXT,
    "previousSnapshot" JSONB,

    CONSTRAINT "ExtractedValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentVersion_status_idx" ON "DocumentVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "ExtractedValue_versionId_idx" ON "ExtractedValue"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedValue_versionId_fieldName_key" ON "ExtractedValue"("versionId", "fieldName");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedValue" ADD CONSTRAINT "ExtractedValue_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;