"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { RefreshCwIcon } from "lucide-react";
import { readOutputMetadata } from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRegenerateOutput } from "../hooks/use-outputs";
import { formatSpokenDuration } from "../lib/audio";
import {
    OUTPUT_LENGTH_LABELS,
    OUTPUT_STAGE_LABELS,
    OUTPUT_TYPE_LABELS,
} from "../lib/constants";
import { studioRoutes } from "../lib/routes";
import { isOutputGenerating, type StudioOutput } from "../lib/types";
import { OutputActionsMenu } from "./output-actions-menu";
import { OutputStatusBadge, OutputTypeBadge } from "./output-status-badge";

type OutputCardProps = {
    output: StudioOutput;
    className?: string;
};

/**
 * One saved output on the Studio shelf: what it is, how it is doing, what it
 * was made from, and every action it supports.
 */
export function OutputCard({ output, className }: OutputCardProps) {
    const regenerateOutput = useRegenerateOutput(output.workspaceId);
    const metadata = readOutputMetadata(output.metadata);
    const sourceCount = output.sourceIds.length;
    const generating = isOutputGenerating(output.status);
    const options = metadata?.options;
    const audio = metadata?.audio;

    const details = [
        `${sourceCount} source${sourceCount === 1 ? "" : "s"}`,
        audio?.durationMs === undefined
            ? null
            : formatSpokenDuration(audio.durationMs),
        audio ? audio.language.toUpperCase() : null,
        options && !audio ? OUTPUT_LENGTH_LABELS[options.length] : null,
        formatDistanceToNow(new Date(output.createdAt), { addSuffix: true }),
    ].filter((detail): detail is string => detail !== null);

    return (
        <div
            className={cn(
                "paper-sheet relative rounded-md border-t-4 border-t-sticky-blue p-3 transition-colors hover:bg-muted/20",
                className,
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                    <OutputTypeBadge type={output.type} />
                    <OutputStatusBadge status={output.status} />
                </div>
                <OutputActionsMenu output={output} />
            </div>

            <Link
                href={studioRoutes.detail(output.workspaceId, output.id)}
                className="mt-2 block rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
                <span className="line-clamp-2 text-sm font-medium">
                    {output.title}
                </span>
                <span className="sr-only">
                    {" "}
                    — open {OUTPUT_TYPE_LABELS[output.type]}
                </span>
            </Link>

            <p className="mt-1 text-xs text-muted-foreground">
                {details.join(" · ")}
            </p>

            {generating ? (
                <p
                    role="status"
                    className="mt-2 text-xs text-muted-foreground"
                >
                    {OUTPUT_STAGE_LABELS[output.stage]} from {sourceCount}{" "}
                    selected source{sourceCount === 1 ? "" : "s"}…
                </p>
            ) : null}

            {output.status === "FAILED" && metadata?.failure ? (
                <p role="alert" className="mt-2 line-clamp-3 text-xs text-destructive">
                    {metadata.failure.message}
                </p>
            ) : null}

            {output.status === "CANCELLED" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    Stopped before it finished.
                </p>
            ) : null}

            {output.status === "FAILED" || output.status === "CANCELLED" ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    disabled={regenerateOutput.isPending}
                    onClick={() => regenerateOutput.mutate(output.id)}
                >
                    <RefreshCwIcon />
                    Retry
                </Button>
            ) : null}

            {regenerateOutput.error ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                    {regenerateOutput.error.message}
                </p>
            ) : null}
        </div>
    );
}
