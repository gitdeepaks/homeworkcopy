-- CreateEnum
CREATE TYPE "NoteOrigin" AS ENUM ('MANUAL', 'CHAT', 'OUTPUT');

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "origin" "NoteOrigin" NOT NULL DEFAULT 'MANUAL',
    "sourceIds" TEXT[],
    "citations" JSONB,
    "savedFrom" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_workspaceId_idx" ON "note"("workspaceId");

-- CreateIndex
CREATE INDEX "note_workspaceId_updatedAt_idx" ON "note"("workspaceId", "updatedAt");

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum: audio file sources.
-- Enum values are added last because a value added inside a transaction cannot
-- also be referenced by it.
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'AUDIO';

-- AlterEnum: advanced Studio output types.
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'SLIDES';
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'DATA_TABLE';
ALTER TYPE "ArtifactType" ADD VALUE IF NOT EXISTS 'VIDEO_EXPLAINER';
