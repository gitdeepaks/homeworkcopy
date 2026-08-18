"use client";

import { useState } from "react";
import {
    SHARE_LINK_MAX_TTL_DAYS,
    type CreatedShareLink,
    type ShareLink,
} from "@homeworkcopy/contracts";
import { formatDistanceToNow } from "date-fns";
import { LinkIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/shared/lib/api";
import { useCreateShareLink, useRevokeShareLink } from "../hooks/use-sharing";
import { CopyLinkField } from "./copy-link-field";

type ShareLinkPanelProps = {
    workspaceId: string;
    shareLink: ShareLink | null;
};

/**
 * Link sharing: on, off, and rotate.
 *
 * The URL appears only in the response that minted it, because only its hash is
 * stored. So the panel shows the live link's state — when it expires, how many
 * people used it — and offers a rotation when the URL itself is needed again.
 * Rotating kills every forwarded copy, which the copy states before you do it.
 */
export function ShareLinkPanel({ workspaceId, shareLink }: ShareLinkPanelProps) {
    const [minted, setMinted] = useState<CreatedShareLink | null>(null);
    const create = useCreateShareLink(workspaceId);
    const revoke = useRevokeShareLink(workspaceId);

    const error =
        create.error instanceof ApiError
            ? create.error.message
            : revoke.error instanceof ApiError
              ? revoke.error.message
              : null;

    function mint() {
        void create
            .mutateAsync({})
            .then(setMinted)
            .catch(() => undefined);
    }

    return (
        <section className="space-y-3">
            <div className="space-y-1">
                <h3 className="text-sm font-medium">Anyone with the link</h3>
                <p className="text-xs text-muted-foreground">
                    A link lets signed-in people join as viewers. They appear in
                    the member list, so you can always see and remove them. Links
                    are never indexed by search engines and always expire.
                </p>
            </div>

            {shareLink ? (
                <div className="space-y-3 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <LinkIcon
                            aria-hidden
                            className="size-4 text-muted-foreground"
                        />
                        <p className="flex-1 text-sm">
                            Link sharing is on. Expires{" "}
                            {formatDistanceToNow(new Date(shareLink.expiresAt), {
                                addSuffix: true,
                            })}
                            .
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {shareLink.joinCount === 0
                                ? "No one has joined yet"
                                : `${shareLink.joinCount} joined`}
                        </p>
                    </div>

                    {minted ? (
                        <CopyLinkField
                            label="Notebook share link"
                            url={minted.shareUrl}
                            description="Shown once. Rotate the link to see a URL again."
                        />
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={create.isPending}
                            onClick={mint}
                        >
                            {create.isPending ? (
                                <Spinner />
                            ) : (
                                <RefreshCwIcon aria-hidden />
                            )}
                            Rotate link
                        </Button>
                        <Button
                            variant="ghost"
                            className="min-h-11 text-destructive"
                            disabled={revoke.isPending}
                            onClick={() => {
                                setMinted(null);
                                void revoke.mutateAsync().catch(() => undefined);
                            }}
                        >
                            {revoke.isPending ? <Spinner /> : null}
                            Turn off link sharing
                        </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Rotating invalidates every copy of the current link.
                        Turning sharing off stops new people joining; anyone who
                        already joined stays a member until you remove them.
                    </p>
                </div>
            ) : (
                <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={create.isPending}
                    onClick={mint}
                >
                    {create.isPending ? <Spinner /> : <LinkIcon aria-hidden />}
                    Create a share link
                </Button>
            )}

            {shareLink ? null : (
                <p className="text-xs text-muted-foreground">
                    Links expire after {SHARE_LINK_MAX_TTL_DAYS} days.
                </p>
            )}

            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}
        </section>
    );
}
