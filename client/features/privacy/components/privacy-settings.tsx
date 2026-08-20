"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, ShieldIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { workspaceRoutes } from "@/features/workspaces/lib/routes";
import { ApiError } from "@/shared/lib/api";
import {
    useCreateExport,
    useDeleteAccount,
    useDeletionPreview,
    useExports,
    usePrivacyDisclosure,
    usePrivacySettings,
    useUpdatePrivacyPreferences,
} from "../hooks/use-privacy";
import { ConsentControls } from "./consent-controls";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { ExportPanel } from "./export-panel";
import { ProcessorTable } from "./processor-table";

/**
 * Turns a thrown error into something a reader can act on.
 *
 * An `ApiError` carries copy the server authored for exactly this situation —
 * the daily export limit, the storage that is not configured — so it is shown
 * rather than replaced with a generic line.
 *
 * @param error - Whatever a mutation rejected with
 * @returns Reader-facing text, or `null` when there is no error
 */
function errorMessage(error: Error | null): string | null {
    if (error === null) return null;
    if (error instanceof ApiError) return error.message;
    return "Something went wrong. Try again.";
}

export function PrivacySettings() {
    const settings = usePrivacySettings();
    const disclosure = usePrivacyDisclosure();
    const exports = useExports();
    const preview = useDeletionPreview();

    const updatePreferences = useUpdatePrivacyPreferences();
    const createExport = useCreateExport();
    const deleteAccount = useDeleteAccount();

    const [deleteOpen, setDeleteOpen] = useState(false);

    return (
        <main id="main-content" className="notebook-canvas min-h-svh p-4 md:p-8">
            <div className="ruled-paper mx-auto flex min-h-[calc(100svh-2rem)] w-full max-w-3xl flex-col gap-10 rounded-md p-6 pl-10 md:p-10 md:pl-20">
                <div className="space-y-3">
                    <Button
                        nativeButton={false}
                        variant="ghost"
                        size="sm"
                        className="-ml-2"
                        render={<Link href={workspaceRoutes.list} />}
                    >
                        <ArrowLeftIcon />
                        Dashboard
                    </Button>
                    <div className="flex items-center gap-2">
                        <ShieldIcon className="size-5" />
                        <h1 className="font-heading text-2xl font-semibold">
                            Privacy
                        </h1>
                    </div>
                    <p className="max-w-xl text-sm text-muted-foreground">
                        What leaves Homeworkcopy, who receives it, how long it is
                        kept, and how to take it back or remove it entirely.
                    </p>
                </div>

                <section className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="font-heading text-lg font-semibold">
                            Your choices
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Both start off. Turning one off takes effect on your
                            next request — there is nothing cached to wait out.
                        </p>
                    </div>

                    {settings.isLoading ? (
                        <Skeleton className="h-40 rounded-md" />
                    ) : settings.data === undefined ? (
                        <p className="text-sm text-muted-foreground">
                            Could not load your privacy settings.
                        </p>
                    ) : (
                        <>
                            <ConsentControls
                                preferences={settings.data.preferences}
                                isPending={updatePreferences.isPending}
                                onChange={(input) => {
                                    updatePreferences.mutate(input);
                                }}
                            />
                            {settings.data.updatedAt === null ? null : (
                                <p className="text-xs text-muted-foreground">
                                    Last changed{" "}
                                    {new Date(
                                        settings.data.updatedAt,
                                    ).toLocaleString()}
                                    .
                                </p>
                            )}
                        </>
                    )}
                </section>

                <section className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="font-heading text-lg font-semibold">
                            Where your data goes
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Every service that can receive your data under your
                            current choices. Turning a choice off removes its
                            provider from this list.
                        </p>
                    </div>

                    {disclosure.isLoading ? (
                        <Skeleton className="h-64 rounded-md" />
                    ) : disclosure.data === undefined ? (
                        <p className="text-sm text-muted-foreground">
                            Could not load the disclosure.
                        </p>
                    ) : (
                        <ProcessorTable processors={disclosure.data.processors} />
                    )}
                </section>

                <section className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="font-heading text-lg font-semibold">
                            How long things are kept
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Anything you delete goes immediately. These are the
                            records that clear themselves.
                        </p>
                    </div>

                    {disclosure.data === undefined ? null : (
                        <div className="space-y-2">
                            {disclosure.data.retention.map((rule) => (
                                <div
                                    key={rule.resource}
                                    className="flex items-start justify-between gap-4 border-b border-dashed py-2 last:border-0"
                                >
                                    <p className="text-sm text-muted-foreground">
                                        {rule.summary}
                                    </p>
                                    <p className="shrink-0 text-sm font-medium">
                                        {rule.retainedDays === null
                                            ? "Kept"
                                            : `${rule.retainedDays} days`}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <ExportPanel
                    exports={exports.data ?? []}
                    isRequesting={createExport.isPending}
                    requestError={errorMessage(createExport.error)}
                    onRequestExport={() => {
                        createExport.mutate({ scope: { kind: "account" } });
                    }}
                />

                <section className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="font-heading text-lg font-semibold">
                            Delete your account
                        </h2>
                        <p className="max-w-xl text-sm text-muted-foreground">
                            Removes your notebooks, sources, conversations,
                            outputs, notes, uploaded files, generated media,
                            search index, learned memories, and sign-in identity.
                            Export first if you want a copy.
                        </p>
                    </div>

                    <Button
                        variant="destructive"
                        onClick={() => {
                            setDeleteOpen(true);
                        }}
                    >
                        Delete account
                    </Button>
                </section>

                <DeleteAccountDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    preview={preview.data}
                    isPending={deleteAccount.isPending}
                    error={errorMessage(deleteAccount.error)}
                    onConfirm={async () => {
                        await deleteAccount.mutateAsync();
                    }}
                />
            </div>
        </main>
    );
}
