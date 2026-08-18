import type { AuditEvent, AuditEventType } from "@homeworkcopy/contracts";
import { ROLE_LABELS } from "./permissions";

/**
 * Renders one audit row as a sentence.
 *
 * Written from the stored context rather than free text, so the trail says the
 * same thing however it is read back, and nothing it prints can have come from
 * source or chat content.
 *
 * @param event - The stored audit event
 * @returns A sentence naming the actor and what they did
 */
export function describeAuditEvent(event: AuditEvent): string {
    const actor = event.actorName ?? "A removed account";
    const { targetEmail, targetUserId, targetTitle, fromRole, toRole } =
        event.context;
    const who = targetEmail ?? targetTitle ?? targetUserId ?? "someone";

    const sentences: Record<AuditEventType, string> = {
        MEMBER_INVITED: `${actor} invited ${who}${
            toRole ? ` as ${ROLE_LABELS[toRole].toLowerCase()}` : ""
        }`,
        INVITATION_ACCEPTED: `${actor} accepted an invitation${
            toRole ? ` as ${ROLE_LABELS[toRole].toLowerCase()}` : ""
        }`,
        INVITATION_REVOKED: `${actor} revoked the invitation for ${who}`,
        MEMBER_ROLE_CHANGED: `${actor} changed a member's role${
            fromRole && toRole
                ? ` from ${ROLE_LABELS[fromRole].toLowerCase()} to ${ROLE_LABELS[toRole].toLowerCase()}`
                : ""
        }`,
        MEMBER_REMOVED: `${actor} removed a member`,
        MEMBER_LEFT: `${actor} left the notebook`,
        OWNERSHIP_TRANSFERRED: `${actor} transferred ownership`,
        SHARE_LINK_CREATED: `${actor} created a share link`,
        SHARE_LINK_REVOKED: `${actor} turned off link sharing`,
        SHARE_LINK_JOINED: `${actor} joined through a share link`,
        NOTEBOOK_DELETED: `${actor} deleted the notebook`,
        SOURCE_DELETED: `${actor} removed the source “${targetTitle ?? "a source"}”`,
        CONVERSATION_DELETED: `${actor} deleted a conversation`,
        OUTPUT_DELETED: `${actor} deleted the output “${targetTitle ?? "an output"}”`,
        NOTE_DELETED: `${actor} deleted the note “${targetTitle ?? "a note"}”`,
        OUTPUT_MEDIA_EXPORTED: `${actor} downloaded media from “${targetTitle ?? "an output"}”`,
    };

    return sentences[event.type];
}
