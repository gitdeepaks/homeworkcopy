import { z } from "zod";
import {
    createShareLinkRequestSchema,
    inviteMemberRequestSchema,
    notebookScopeSchema,
    shareTokenSchema,
    transferOwnershipRequestSchema,
    updateMemberRoleRequestSchema,
} from "@homeworkcopy/contracts";

export const listNotebooksQuerySchema = z.object({
    scope: notebookScopeSchema.default("mine"),
});

export const memberIdParamSchema = z.object({
    workspaceId: z.string().trim().min(1),
    memberUserId: z.string().trim().min(1),
});

export const invitationIdParamSchema = z.object({
    workspaceId: z.string().trim().min(1),
    invitationId: z.string().trim().min(1),
});

export const shareTokenParamSchema = z.object({
    token: shareTokenSchema,
});

export {
    createShareLinkRequestSchema,
    inviteMemberRequestSchema,
    transferOwnershipRequestSchema,
    updateMemberRoleRequestSchema,
};

export type ListNotebooksQuery = z.infer<typeof listNotebooksQuerySchema>;
