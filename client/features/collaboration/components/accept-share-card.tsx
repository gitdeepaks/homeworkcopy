"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    SHARE_REJECTION_MESSAGES,
    shareRejectionReasonSchema,
    type AcceptShareResponse,
} from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { workspaceRoutes } from "@/features/workspaces/lib/routes";
import { ApiError } from "@/shared/lib/api";
import { acceptInvitation, acceptShareLink } from "../lib/api";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../lib/permissions";

type AcceptShareCardProps = {
    kind: "invitation" | "link";
    token: string;
};

/**
 * Turns a rejection into copy the reader can act on.
 *
 * The server's error code is one of the known reasons, so the message comes from
 * the shared table rather than from whatever prose reached the client. Anything
 * unrecognized falls back to the server's own message rather than a raw error.
 */
function rejectionMessage(error: unknown): string {
    if (!(error instanceof ApiError)) {
        return "Something went wrong. Try the link again in a moment.";
    }

    const reason = shareRejectionReasonSchema.safeParse(error.code);
    return reason.success
        ? SHARE_REJECTION_MESSAGES[reason.data]
        : error.message;
}

/**
 * Redeems an invitation or share link, on purpose.
 *
 * Redemption is a button press rather than something that happens on load: a
 * link preview, a prefetch, or a mistyped URL must never be able to add someone
 * to a notebook.
 */
export function AcceptShareCard({ kind, token }: AcceptShareCardProps) {
    const router = useRouter();
    const [state, setState] = useState<
        | { status: "idle" }
        | { status: "accepting" }
        | { status: "accepted"; result: AcceptShareResponse }
        | { status: "rejected"; message: string }
    >({ status: "idle" });

    function accept() {
        setState({ status: "accepting" });
        const request =
            kind === "invitation"
                ? acceptInvitation(token)
                : acceptShareLink(token);

        void request
            .then((result) => {
                setState({ status: "accepted", result });
                router.push(workspaceRoutes.detail(result.workspaceId));
            })
            .catch((error: unknown) => {
                setState({
                    status: "rejected",
                    message: rejectionMessage(error),
                });
            });
    }

    if (state.status === "rejected") {
        return (
            <div className="space-y-4">
                <h1 className="font-heading text-3xl font-bold">
                    This link cannot be used
                </h1>
                <p role="alert" className="text-sm text-muted-foreground">
                    {state.message}
                </p>
                <Button
                    nativeButton={false}
                    className="min-h-11"
                    render={<Link href={workspaceRoutes.list} />}
                >
                    Go to your notebooks
                </Button>
            </div>
        );
    }

    if (state.status === "accepted") {
        return (
            <div className="space-y-4">
                <h1 className="font-heading text-3xl font-bold">You are in</h1>
                <p className="text-sm text-muted-foreground">
                    Opening “{state.result.workspaceTitle}” as{" "}
                    {ROLE_LABELS[state.result.role].toLowerCase()}…
                </p>
                <Button
                    nativeButton={false}
                    className="min-h-11"
                    render={
                        <Link
                            href={workspaceRoutes.detail(
                                state.result.workspaceId,
                            )}
                        />
                    }
                >
                    Open the notebook
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h1 className="font-heading text-3xl font-bold">
                {kind === "invitation"
                    ? "You have been invited to a notebook"
                    : "Join this notebook"}
            </h1>
            <p className="text-sm text-muted-foreground">
                {kind === "invitation"
                    ? "Accepting adds this notebook to the Shared tab on your dashboard. The invitation is tied to the email you signed in with."
                    : `Joining adds you as a viewer. ${ROLE_DESCRIPTIONS.VIEWER}. The owner will see you in the member list and can remove you at any time.`}
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    className="min-h-11"
                    disabled={state.status === "accepting"}
                    onClick={accept}
                >
                    {state.status === "accepting" ? <Spinner /> : null}
                    {kind === "invitation"
                        ? "Accept invitation"
                        : "Join notebook"}
                </Button>
                <Button
                    nativeButton={false}
                    variant="ghost"
                    className="min-h-11"
                    render={<Link href={workspaceRoutes.list} />}
                >
                    Not now
                </Button>
            </div>
        </div>
    );
}
