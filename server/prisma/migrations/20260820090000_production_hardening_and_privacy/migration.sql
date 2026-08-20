-- Phase 11: privacy controls, data export, and deletion receipts.
--
-- Purely additive. Nothing here backfills: an account with no
-- `user_privacy_setting` row is read through the contract defaults, which are
-- both off, so every existing account starts with optional processing disabled
-- rather than silently consenting on their behalf.

-- CreateEnum
CREATE TYPE "DataExportScope" AS ENUM ('ACCOUNT', 'NOTEBOOK');

-- CreateEnum
CREATE TYPE "DataExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeletionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "user_privacy_setting" (
    "userId" TEXT NOT NULL,
    "learnedMemoryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webSearchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_privacy_setting_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "data_export" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "DataExportScope" NOT NULL,
    "workspaceId" TEXT,
    "status" "DataExportStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "manifest" JSONB,
    "storagePublicId" TEXT,
    "bytes" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_export_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_receipt" (
    "id" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "status" "DeletionStatus" NOT NULL DEFAULT 'PENDING',
    "outcomes" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deletion_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_export_userId_createdAt_idx" ON "data_export"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "data_export_status_expiresAt_idx" ON "data_export"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "deletion_receipt_subjectHash_key" ON "deletion_receipt"("subjectHash");

-- CreateIndex
CREATE INDEX "deletion_receipt_status_requestedAt_idx" ON "deletion_receipt"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "user_privacy_setting" ADD CONSTRAINT "user_privacy_setting_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- `deletion_receipt` intentionally has no foreign key. It is the record that an
-- account was deleted, so a cascade from `user` would delete the proof at the
-- exact moment the proof starts mattering.

-- Retention needs to find rows by age without scanning the table. `audit_event`
-- and `chat_usage` already carry the indexes the purge reads; these two do not.
CREATE INDEX IF NOT EXISTS "clerk_webhook_event_receivedAt_idx"
    ON "clerk_webhook_event"("receivedAt");

CREATE INDEX IF NOT EXISTS "notebook_invitation_status_updatedAt_idx"
    ON "notebook_invitation"("status", "updatedAt");
