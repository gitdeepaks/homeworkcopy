"use client";

import { useState } from "react";
import {
    inviteMemberRequestSchema,
    type CreatedInvitation,
    type NotebookMemberRole,
} from "@homeworkcopy/contracts";
import { UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/shared/lib/api";
import { useInviteMember } from "../hooks/use-sharing";
import { CopyLinkField } from "./copy-link-field";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../lib/permissions";

type InviteFormProps = {
    workspaceId: string;
};

/**
 * Invites one person by email.
 *
 * The invitation link is shown once, right here, because this deployment sends
 * no mail: the inviter is the delivery mechanism. The copy says so plainly
 * rather than implying an email is on its way.
 */
export function InviteForm({ workspaceId }: InviteFormProps) {
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<NotebookMemberRole>("VIEWER");
    const [validationError, setValidationError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedInvitation | null>(null);
    const invite = useInviteMember(workspaceId);

    const serverError =
        invite.error instanceof ApiError ? invite.error.message : null;
    const error = validationError ?? serverError;

    return (
        <form
            className="space-y-3"
            onSubmit={(event) => {
                event.preventDefault();
                setCreated(null);
                invite.reset();

                const parsed = inviteMemberRequestSchema.safeParse({
                    email,
                    role,
                });
                if (!parsed.success) {
                    setValidationError("Enter a valid email address");
                    return;
                }
                setValidationError(null);

                void invite
                    .mutateAsync(parsed.data)
                    .then((result) => {
                        setCreated(result);
                        setEmail("");
                    })
                    // The mutation's own error state renders the reason; this
                    // keeps the rejection from escaping as unhandled.
                    .catch(() => undefined);
            }}
        >
            <div className="flex flex-wrap items-start gap-2">
                <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="teammate@example.com"
                    aria-label="Email address to invite"
                    aria-invalid={error !== null}
                    aria-describedby={error ? "invite-error" : undefined}
                    className="min-w-48 flex-1"
                    required
                />
                <NativeSelect
                    className="w-32"
                    aria-label="Role for the invited person"
                    value={role}
                    onChange={(event) => {
                        const next = event.target.value;
                        if (next === "EDITOR" || next === "VIEWER") {
                            setRole(next);
                        }
                    }}
                >
                    <NativeSelectOption value="VIEWER">
                        {ROLE_LABELS.VIEWER}
                    </NativeSelectOption>
                    <NativeSelectOption value="EDITOR">
                        {ROLE_LABELS.EDITOR}
                    </NativeSelectOption>
                </NativeSelect>
                <Button
                    type="submit"
                    className="min-h-11"
                    disabled={invite.isPending}
                >
                    {invite.isPending ? <Spinner /> : <UserPlusIcon aria-hidden />}
                    Invite
                </Button>
            </div>

            <p className="text-xs text-muted-foreground">
                {ROLE_DESCRIPTIONS[role]}
            </p>

            {error ? (
                <p id="invite-error" role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            {created ? (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                    <p className="text-sm font-medium">
                        Send this link to {created.invitation.email}
                    </p>
                    <CopyLinkField
                        label={`Invitation link for ${created.invitation.email}`}
                        url={created.inviteUrl}
                        description="Shown once. Only that email address can accept it, and it expires on its own. If it is lost, revoke the invitation and send a new one."
                    />
                </div>
            ) : null}
        </form>
    );
}
