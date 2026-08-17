"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeftIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { readOutputMetadata } from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { SaveExcerptButton, type NoteDraftCitation } from "@/features/notes";
import { ApiError } from "@/shared/lib/api";
import {
    useCancelOutput,
    useOutput,
    useRegenerateOutput,
} from "../hooks/use-outputs";
import { formatSpokenDuration } from "../lib/audio";
import {
    AUDIO_STYLE_LABELS,
    OUTPUT_LENGTH_LABELS,
    OUTPUT_STAGE_LABELS,
    OUTPUT_TYPE_LABELS,
} from "../lib/constants";
import { outputToMarkdown } from "../lib/export";
import { studioRoutes } from "../lib/routes";
import { isOutputGenerating } from "../lib/types";
import { OutputActionsMenu } from "./output-actions-menu";
import { OutputContentViewer } from "./output-content-viewer";
import { OutputSourceReferences } from "./output-source-references";
import { OutputStatusBadge, OutputTypeBadge } from "./output-status-badge";

type OutputDetailProps = {
    workspaceId: string;
    outputId: string;
};

export function OutputDetail({ workspaceId, outputId }: OutputDetailProps) {
    const router = useRouter();
    const { data: output, isLoading, error } = useOutput(workspaceId, outputId);
    const regenerateOutput = useRegenerateOutput(workspaceId);
    const cancelOutput = useCancelOutput(workspaceId);

    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-4 p-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full rounded-3xl" />
            </div>
        );
    }

    if (error instanceof ApiError && error.status === 404) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="font-medium">Output not found</p>
                <p className="text-sm text-muted-foreground">
                    It may have been deleted from this notebook.
                </p>
                <Button
                    nativeButton={false}
                    variant="outline"
                    render={<Link href={studioRoutes.hub(workspaceId)} />}
                >
                    Back to Studio
                </Button>
            </div>
        );
    }

    if (error || !output) {
        return (
            <div
                role="alert"
                className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
            >
                <p className="font-medium">Could not load output</p>
            </div>
        );
    }

    const metadata = readOutputMetadata(output.metadata);
    const generating = isOutputGenerating(output.status);
    const isMindMap = output.type === "MINDMAP";

    const audio = metadata?.audio;
    const video = metadata?.video;
    const media = audio ?? video;
    // The label map is what makes an excerpt verifiable: each entry points at a
    // source the reader can open from the note.
    const noteCitations: NoteDraftCitation[] = (metadata?.sourceLabels ?? []).map(
        (label) => ({
            sourceId: label.sourceId,
            title: label.title,
            excerpt: "",
        }),
    );
    const details = [
        `${output.sourceIds.length} source${output.sourceIds.length === 1 ? "" : "s"}`,
        media?.durationMs === undefined
            ? null
            : formatSpokenDuration(media.durationMs),
        audio ? AUDIO_STYLE_LABELS[audio.style] : null,
        video ? `${String(video.sceneCount)} scenes` : null,
        metadata?.options
            ? OUTPUT_LENGTH_LABELS[metadata.options.length]
            : null,
        metadata?.model ?? null,
        `Created ${formatDistanceToNow(new Date(output.createdAt), {
            addSuffix: true,
        })}`,
    ].filter((detail): detail is string => detail !== null);

    return (
        <div
            className={`flex flex-1 flex-col ${isMindMap ? "min-h-0 gap-4 p-4 md:p-5" : "gap-6 p-6"}`}
        >
            <div className="flex items-start gap-3">
                <Button
                    nativeButton={false}
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Back to Studio"
                    render={<Link href={studioRoutes.hub(workspaceId)} />}
                >
                    <ArrowLeftIcon />
                </Button>
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <OutputTypeBadge type={output.type} />
                        <h2 className="font-heading text-xl font-semibold">
                            {output.title}
                        </h2>
                        <OutputStatusBadge status={output.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {OUTPUT_TYPE_LABELS[output.type]} · {details.join(" · ")}
                    </p>
                </div>
                {output.status === "READY" ? (
                    <SaveExcerptButton
                        workspaceId={workspaceId}
                        content={outputToMarkdown(output)}
                        origin="OUTPUT"
                        savedFrom={{ kind: "output", outputId: output.id }}
                        citations={noteCitations}
                    />
                ) : null}
                <OutputActionsMenu
                    output={output}
                    onDeleted={() => router.push(studioRoutes.hub(workspaceId))}
                />
            </div>

            {generating ? (
                <div
                    role="status"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground"
                >
                    <span className="flex items-center gap-2">
                        <Spinner />
                        {OUTPUT_STAGE_LABELS[output.stage]} ·{" "}
                        {OUTPUT_TYPE_LABELS[output.type].toLowerCase()} from{" "}
                        {output.sourceIds.length} selected source
                        {output.sourceIds.length === 1 ? "" : "s"}…
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={cancelOutput.isPending}
                        onClick={() => cancelOutput.mutate(output.id)}
                    >
                        <SquareIcon />
                        Stop
                    </Button>
                </div>
            ) : output.status === "FAILED" ? (
                <div
                    role="alert"
                    className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm"
                >
                    <p className="font-medium text-destructive">
                        Generation failed
                    </p>
                    {metadata?.failure ? (
                        <p className="text-muted-foreground">
                            {metadata.failure.message}
                        </p>
                    ) : null}
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={regenerateOutput.isPending}
                        onClick={() => regenerateOutput.mutate(output.id)}
                    >
                        <RefreshCwIcon />
                        Retry generation
                    </Button>
                </div>
            ) : output.status === "CANCELLED" ? (
                <div className="space-y-3 rounded-2xl border border-dashed p-6 text-sm">
                    <p className="font-medium">Generation stopped</p>
                    <p className="text-muted-foreground">
                        This output was stopped before it finished. Retry to
                        generate it from the same sources.
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={regenerateOutput.isPending}
                        onClick={() => regenerateOutput.mutate(output.id)}
                    >
                        <RefreshCwIcon />
                        Retry generation
                    </Button>
                </div>
            ) : isMindMap ? (
                <div className="min-h-0 flex-1">
                    <OutputContentViewer
                        output={output}
                        workspaceId={workspaceId}
                    />
                </div>
            ) : (
                <div className="rounded-3xl border bg-muted/20 p-4 md:p-6">
                    <OutputContentViewer
                        output={output}
                        workspaceId={workspaceId}
                    />
                </div>
            )}

            <OutputSourceReferences output={output} />
        </div>
    );
}
