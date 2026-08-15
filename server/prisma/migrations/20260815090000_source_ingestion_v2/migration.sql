CREATE TYPE "SourceProcessingStage" AS ENUM (
    'QUEUED',
    'UPLOADING',
    'EXTRACTING',
    'CHUNKING',
    'EMBEDDING',
    'INDEXING',
    'READY',
    'FAILED',
    'CLEANING_UP'
);

ALTER TYPE "SourceStatus" ADD VALUE 'DELETING';

ALTER TABLE "source"
    ADD COLUMN "processingStage" "SourceProcessingStage" NOT NULL DEFAULT 'QUEUED',
    ADD COLUMN "processingVersion" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "contentChecksum" TEXT,
    ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "source_chunk"
    ADD COLUMN "processingVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "source"
SET "processingStage" = CASE
    WHEN "status" = 'READY' THEN 'READY'::"SourceProcessingStage"
    WHEN "status" = 'FAILED' THEN 'FAILED'::"SourceProcessingStage"
    WHEN "status" = 'PROCESSING' THEN 'EXTRACTING'::"SourceProcessingStage"
    ELSE 'QUEUED'::"SourceProcessingStage"
END;

CREATE UNIQUE INDEX "source_workspaceId_contentChecksum_key"
    ON "source"("workspaceId", "contentChecksum");
CREATE UNIQUE INDEX "source_workspaceId_idempotencyKey_key"
    ON "source"("workspaceId", "idempotencyKey");
