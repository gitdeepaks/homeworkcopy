"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { TriangleAlertIcon } from "lucide-react";
import {
    DELETE_ACCOUNT_CONFIRMATION,
    DELETION_TARGET_LABELS,
    DELETION_TARGETS,
} from "@homeworkcopy/contracts";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { DeletionPreview } from "../lib/api";

/**
 * The last screen before an account is destroyed.
 *
 * Three things it deliberately does. It states the counts, so "delete" is a
 * decision with a size rather than a word. It names the collaborators who lose
 * access, because that consequence lands on other people and is the one a reader
 * is least likely to have thought about. And it requires the phrase to be typed,
 * which a misplaced click cannot produce.
 */
export function DeleteAccountDialog({
    open,
    onOpenChange,
    preview,
    onConfirm,
    isPending,
    error,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    preview: DeletionPreview | undefined;
    onConfirm: () => Promise<void>;
    isPending: boolean;
    error: string | null;
}) {
    const [typed, setTyped] = useState("");
    const { signOut } = useClerk();
    const confirmed = typed.trim() === DELETE_ACCOUNT_CONFIRMATION;

    async function handleConfirm() {
        await onConfirm();
        // The account row and the sign-in identity are both being removed, so
        // the session in this tab is about to stop meaning anything. Ending it
        // deliberately is kinder than letting the next request 401.
        await signOut({ redirectUrl: "/" });
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!next) setTyped("");
                onOpenChange(next);
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <TriangleAlertIcon className="size-4 text-destructive" />
                        Delete your account
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This cannot be undone, and there is no grace period.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-4">
                    {preview === undefined ? null : (
                        <div className="rounded-2xl border border-dashed p-4 text-sm">
                            <p className="font-medium">This will delete</p>
                            <ul className="mt-2 space-y-1 text-muted-foreground">
                                <li>
                                    {preview.notebooks} notebooks,{" "}
                                    {preview.sources} sources,{" "}
                                    {preview.conversations} conversations
                                </li>
                                <li>
                                    {preview.outputs} Studio outputs and{" "}
                                    {preview.notes} notes
                                </li>
                            </ul>

                            {preview.collaboratorsLosingAccess === 0 ? null : (
                                <p className="mt-3 text-destructive">
                                    {preview.collaboratorsLosingAccess} other{" "}
                                    {preview.collaboratorsLosingAccess === 1
                                        ? "person"
                                        : "people"}{" "}
                                    will lose access to{" "}
                                    {preview.sharedNotebooks} shared{" "}
                                    {preview.sharedNotebooks === 1
                                        ? "notebook"
                                        : "notebooks"}
                                    . Transfer ownership first if you want them to
                                    keep it.
                                </p>
                            )}

                            {preview.notebooksSharedWithYou === 0 ? null : (
                                <p className="mt-3 text-muted-foreground">
                                    {preview.notebooksSharedWithYou}{" "}
                                    {preview.notebooksSharedWithYou === 1
                                        ? "notebook"
                                        : "notebooks"}{" "}
                                    shared with you belong to other people and are
                                    not affected.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="rounded-2xl border border-dashed p-4">
                        <p className="text-xs font-medium">
                            Removed from every store
                        </p>
                        <ul className="mt-2 space-y-1">
                            {DELETION_TARGETS.map((target) => (
                                <li
                                    key={target}
                                    className="text-xs text-muted-foreground"
                                >
                                    {DELETION_TARGET_LABELS[target]}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="delete-confirmation">
                            Type {DELETE_ACCOUNT_CONFIRMATION} to confirm
                        </Label>
                        <Input
                            id="delete-confirmation"
                            value={typed}
                            autoComplete="off"
                            onChange={(event) => {
                                setTyped(event.target.value);
                            }}
                        />
                    </div>

                    {error === null ? null : (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>
                        Keep my account
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={!confirmed || isPending}
                        onClick={(event) => {
                            // The dialog would otherwise close the moment this
                            // is pressed, taking the pending state with it.
                            event.preventDefault();
                            void handleConfirm();
                        }}
                    >
                        {isPending ? <Spinner /> : null}
                        Delete everything
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
