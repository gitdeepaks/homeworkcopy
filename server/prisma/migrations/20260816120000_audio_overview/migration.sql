-- CreateEnum: pipeline position inside a non-terminal generation
CREATE TYPE "ArtifactStage" AS ENUM (
    'QUEUED',
    'GENERATING',
    'SCRIPTING',
    'SYNTHESIS',
    'ASSEMBLY',
    'READY',
    'FAILED'
);

-- AlterTable
ALTER TABLE "learning_artifact"
ADD COLUMN "stage" "ArtifactStage" NOT NULL DEFAULT 'QUEUED';

-- Existing rows predate stage tracking; derive the stage from their status.
UPDATE "learning_artifact"
SET "stage" = CASE
    WHEN "status" = 'READY' THEN 'READY'::"ArtifactStage"
    WHEN "status" = 'FAILED' THEN 'FAILED'::"ArtifactStage"
    WHEN "status" = 'PROCESSING' THEN 'GENERATING'::"ArtifactStage"
    ELSE 'QUEUED'::"ArtifactStage"
END;

-- AlterEnum: Audio Overview output type.
-- Added last because a value added in this transaction cannot be used in it.
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'AUDIO_OVERVIEW';
