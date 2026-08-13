CREATE TYPE "ClerkWebhookStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');

CREATE TABLE "clerk_webhook_event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ClerkWebhookStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorCode" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "clerk_webhook_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clerk_webhook_event_status_receivedAt_idx"
ON "clerk_webhook_event"("status", "receivedAt");
