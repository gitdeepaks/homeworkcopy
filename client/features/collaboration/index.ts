export {
    NotebookAccessProvider,
    useNotebookAccess,
    useNotebookCan,
} from "./components/notebook-access-provider";
export { ShareDialog } from "./components/share-dialog";
export { LeaveNotebookDialog } from "./components/leave-notebook-dialog";
export { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from "./lib/permissions";
export { describeAuditEvent } from "./lib/activity";
export {
    sharingKeys,
    useCreateShareLink,
    useInviteMember,
    useLeaveNotebook,
    useNotebookActivity,
    useNotebookSharing,
    useRemoveMember,
    useRevokeInvitation,
    useRevokeShareLink,
    useTransferOwnership,
    useUpdateMemberRole,
} from "./hooks/use-sharing";
