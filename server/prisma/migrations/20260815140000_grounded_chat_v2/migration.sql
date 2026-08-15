-- CreateEnum
CREATE TYPE "MessageFeedback" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

-- AlterTable
ALTER TABLE "message"
ADD COLUMN "clientMessageId" TEXT,
ADD COLUMN "retryOfId" TEXT,
ADD COLUMN "supersededAt" TIMESTAMP(3),
ADD COLUMN "feedback" "MessageFeedback";

ALTER TABLE "conversation"
ADD COLUMN "generationLeaseId" TEXT,
ADD COLUMN "generationLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "historyRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "chat_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX CONCURRENTLY "message_retryOfId_idx" ON "message"("retryOfId");
CREATE UNIQUE INDEX CONCURRENTLY "message_conversationId_clientMessageId_key" ON "message"("conversationId", "clientMessageId");
CREATE UNIQUE INDEX "chat_usage_userId_periodStart_key" ON "chat_usage"("userId", "periodStart");
CREATE INDEX "chat_usage_periodStart_idx" ON "chat_usage"("periodStart");

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "message"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "message" VALIDATE CONSTRAINT "message_retryOfId_fkey";
ALTER TABLE "chat_usage" ADD CONSTRAINT "chat_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
