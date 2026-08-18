-- Phase 10: notebook membership, invitations, link sharing, and the audit trail.
--
-- Existing notebooks are untouched: `workspace.userId` remains the only record
-- of ownership, and a notebook with no membership rows is private, which is
-- exactly what every notebook is before this migration runs. No backfill is
-- required or performed.

-- CreateEnum
CREATE TYPE "NotebookMemberRole" AS ENUM ('EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "NotebookInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM (
    'MEMBER_INVITED',
    'INVITATION_ACCEPTED',
    'INVITATION_REVOKED',
    'MEMBER_ROLE_CHANGED',
    'MEMBER_REMOVED',
    'MEMBER_LEFT',
    'OWNERSHIP_TRANSFERRED',
    'SHARE_LINK_CREATED',
    'SHARE_LINK_REVOKED',
    'SHARE_LINK_JOINED',
    'NOTEBOOK_DELETED',
    'SOURCE_DELETED',
    'CONVERSATION_DELETED',
    'OUTPUT_DELETED',
    'NOTE_DELETED',
    'OUTPUT_MEDIA_EXPORTED'
);

-- CreateTable
CREATE TABLE "notebook_member" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "NotebookMemberRole" NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notebook_member_workspaceId_userId_key" ON "notebook_member"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "notebook_member_userId_updatedAt_idx" ON "notebook_member"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "notebook_member_workspaceId_idx" ON "notebook_member"("workspaceId");

-- CreateTable
CREATE TABLE "notebook_invitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "NotebookMemberRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "NotebookInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notebook_invitation_tokenHash_key" ON "notebook_invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "notebook_invitation_workspaceId_status_idx" ON "notebook_invitation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "notebook_invitation_email_status_idx" ON "notebook_invitation"("email", "status");

-- One live invitation per address per notebook. Enforced partially so that a
-- revoked or accepted invitation never blocks re-inviting the same person.
CREATE UNIQUE INDEX "notebook_invitation_pending_unique"
    ON "notebook_invitation"("workspaceId", "email")
    WHERE "status" = 'PENDING';

-- CreateTable
CREATE TABLE "notebook_share_link" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "lastJoinedAt" TIMESTAMP(3),
    "joinCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_share_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notebook_share_link_workspaceId_key" ON "notebook_share_link"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_share_link_tokenHash_key" ON "notebook_share_link"("tokenHash");

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_event_workspaceId_createdAt_idx" ON "audit_event"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_event_actorUserId_idx" ON "audit_event"("actorUserId");

-- AddForeignKey
ALTER TABLE "notebook_member" ADD CONSTRAINT "notebook_member_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_member" ADD CONSTRAINT "notebook_member_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_invitation" ADD CONSTRAINT "notebook_invitation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_invitation" ADD CONSTRAINT "notebook_invitation_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_share_link" ADD CONSTRAINT "notebook_share_link_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_share_link" ADD CONSTRAINT "notebook_share_link_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting an account must not erase the record of what it did to other
-- people's access, so the actor link is cleared rather than cascaded.
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- The owner can never also hold a membership row: ownership lives on
-- `workspace.userId`, and a second answer here would be a privilege bug waiting
-- to happen. Enforced in the database so no code path can create one.
CREATE OR REPLACE FUNCTION "notebook_member_reject_owner"() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "workspace"
        WHERE "id" = NEW."workspaceId" AND "userId" = NEW."userId"
    ) THEN
        RAISE EXCEPTION 'A notebook owner cannot also be a member';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notebook_member_reject_owner_trigger"
    BEFORE INSERT OR UPDATE ON "notebook_member"
    FOR EACH ROW EXECUTE FUNCTION "notebook_member_reject_owner"();
