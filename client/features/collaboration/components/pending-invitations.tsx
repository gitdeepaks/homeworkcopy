"use client";

import type { NotebookInvitation } from "@homeworkcopy/contracts";
import { formatDistanceToNow } from "date-fns";
import { MailIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "../lib/permissions";

type PendingInvitationsProps = {
    invitations: NotebookInvitation[];
    pendingId: string | null;
    onRevoke: (invitation: NotebookInvitation) => void;
};

/** Invitations that have been sent but not yet accepted. */
export function PendingInvitations({
    invitations,
    pendingId,
    onRevoke,
}: PendingInvitationsProps) {
    if (invitations.length === 0) {
        return null;
    }

    return (
        <section className="space-y-2">
            <h3 className="text-sm font-medium">Waiting to accept</h3>
            <ul className="divide-y rounded-md border">
                {invitations.map((invitation) => (
                    <li
                        key={invitation.id}
                        className="flex flex-wrap items-center gap-3 p-3"
                    >
                        <MailIcon
                            aria-hidden
                            className="size-4 text-muted-foreground"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                                {invitation.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Expires{" "}
                                {formatDistanceToNow(
                                    new Date(invitation.expiresAt),
                                    { addSuffix: true },
                                )}
                            </p>
                        </div>
                        <Badge variant="outline">
                            {ROLE_LABELS[invitation.role]}
                        </Badge>
                        <Button
                            variant="ghost"
                            className="min-h-11 text-destructive"
                            disabled={pendingId === invitation.id}
                            onClick={() => onRevoke(invitation)}
                        >
                            Revoke
                        </Button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
