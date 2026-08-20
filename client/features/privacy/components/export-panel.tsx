"use client";

import { formatDistanceToNow } from "date-fns";
import { DownloadIcon, PackageIcon } from "lucide-react";
import {
    EXPORT_EXCLUSIONS,
    EXPORT_FAILURE_MESSAGES,
    type DataExport,
} from "@homeworkcopy/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Renders one export's size without pretending to more precision than a reader
 * needs.
 *
 * @param bytes - Archive size
 * @returns A short human-readable size
 */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What an export is currently doing, in the reader's words.
 *
 * `EXPIRED` gets its own line rather than sharing one with `FAILED`: an archive
 * that aged out means "ask for another", and a failure means "something went
 * wrong", and telling a reader the wrong one wastes their time.
 */
function statusLabel(record: DataExport): string {
    switch (record.status) {
        case "PENDING":
            return "Queued";
        case "PROCESSING":
            return "Building your archive";
        case "READY":
            return "Ready to download";
        case "EXPIRED":
            return "Expired — request a new one";
        case "FAILED":
            return record.failureCode === null
                ? EXPORT_FAILURE_MESSAGES.EXPORT_FAILED
                : EXPORT_FAILURE_MESSAGES[record.failureCode];
    }
}

export function ExportPanel({
    exports,
    onRequestExport,
    isRequesting,
    requestError,
}: {
    exports: readonly DataExport[];
    onRequestExport: () => void;
    isRequesting: boolean;
    requestError: string | null;
}) {
    const building = exports.some(
        (record) => record.status === "PENDING" || record.status === "PROCESSING",
    );

    return (
        <section className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <PackageIcon className="size-4" />
                        <h2 className="font-heading text-lg font-semibold">
                            Export your data
                        </h2>
                    </div>
                    <p className="max-w-xl text-sm text-muted-foreground">
                        A JSON archive of your notebooks, sources, conversations,
                        outputs, and notes. Building it takes a few minutes; the
                        download link works for seven days and then the archive is
                        deleted.
                    </p>
                </div>
                <Button
                    onClick={onRequestExport}
                    disabled={isRequesting || building}
                >
                    {isRequesting ? <Spinner /> : <PackageIcon />}
                    Request export
                </Button>
            </div>

            <div className="rounded-2xl border border-dashed p-4">
                <p className="text-xs font-medium">Not included</p>
                <ul className="mt-2 space-y-1">
                    {EXPORT_EXCLUSIONS.map((line) => (
                        <li key={line} className="text-xs text-muted-foreground">
                            {line}
                        </li>
                    ))}
                </ul>
            </div>

            {requestError === null ? null : (
                <p role="alert" className="text-sm text-destructive">
                    {requestError}
                </p>
            )}

            {exports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    You have not requested an export yet.
                </p>
            ) : (
                <div className="space-y-3">
                    {exports.map((record) => (
                        <div
                            key={record.id}
                            className="paper-sheet flex items-center justify-between gap-4 rounded-md p-4"
                        >
                            <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">
                                        {record.scope.kind === "account"
                                            ? "Whole account"
                                            : "One notebook"}
                                    </Badge>
                                    <span
                                        className="text-sm"
                                        aria-live={
                                            record.status === "PROCESSING"
                                                ? "polite"
                                                : "off"
                                        }
                                    >
                                        {statusLabel(record)}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Requested{" "}
                                    {formatDistanceToNow(
                                        new Date(record.requestedAt),
                                        { addSuffix: true },
                                    )}
                                    {record.manifest === null
                                        ? null
                                        : ` · ${record.manifest.counts.notebooks} notebooks · ${formatBytes(record.manifest.bytes)}`}
                                </p>
                            </div>

                            {record.downloadUrl === null ? null : (
                                <Button
                                    nativeButton={false}
                                    variant="outline"
                                    size="sm"
                                    render={
                                        <a
                                            href={record.downloadUrl}
                                            rel="noreferrer noopener"
                                        />
                                    }
                                >
                                    <DownloadIcon />
                                    Download
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
