ALTER TABLE "user" ADD COLUMN "clerkUserId" TEXT;

CREATE UNIQUE INDEX "user_clerkUserId_key" ON "user"("clerkUserId");
