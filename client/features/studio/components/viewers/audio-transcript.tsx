"use client";

import Link from "next/link";
import type {
    AudioOverviewScript,
    OutputSourceLabel,
} from "@homeworkcopy/contracts";
import { sourceRoutes } from "@/features/sources";
import { cn } from "@/lib/utils";
import { formatTimecode, segmentSources } from "../../lib/audio";

type AudioTranscriptProps = {
    workspaceId: string;
    script: AudioOverviewScript;
    sourceLabels: readonly OutputSourceLabel[];
    /** Start of each segment, when the audio has been assembled. */
    startsMs: ReadonlyMap<string, number>;
    activeSegmentId: string | null;
    /** Absent while there is no audio to seek. */
    onSeek?: ((positionMs: number) => void) | undefined;
};

/**
 * The full spoken text of an Audio Overview.
 *
 * The transcript is not an enhancement: it is how the output is read without
 * listening, so it renders whether or not audio exists and carries the same
 * citations the script was grounded in.
 */
export function AudioTranscript({
    workspaceId,
    script,
    sourceLabels,
    startsMs,
    activeSegmentId,
    onSeek,
}: AudioTranscriptProps) {
    const isDialogue = script.style === "dialogue";

    return (
        <section aria-labelledby="audio-transcript-title" className="mt-6">
            <h3 id="audio-transcript-title" className="text-sm font-semibold">
                Transcript
            </h3>

            <ol className="mt-3 space-y-2">
                {script.segments.map((segment) => {
                    const startMs = startsMs.get(segment.id);
                    const isActive = segment.id === activeSegmentId;
                    const sources = segmentSources(
                        sourceLabels,
                        segment.sourceLabels,
                    );

                    return (
                        <li
                            key={segment.id}
                            aria-current={isActive ? "true" : undefined}
                            className={cn(
                                "rounded-md border-l-2 py-1.5 pl-3 transition-colors",
                                isActive
                                    ? "border-l-primary bg-highlighter"
                                    : "border-l-transparent",
                            )}
                        >
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                {startMs !== undefined && onSeek ? (
                                    <button
                                        type="button"
                                        onClick={() => onSeek(startMs)}
                                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm font-mono text-xs text-muted-foreground tabular-nums hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    >
                                        <span className="sr-only">
                                            Play from{" "}
                                        </span>
                                        {formatTimecode(startMs)}
                                    </button>
                                ) : null}

                                {isDialogue ? (
                                    <span className="text-xs font-semibold tracking-wide uppercase">
                                        {segment.speaker === "host"
                                            ? "Host"
                                            : "Guest"}
                                    </span>
                                ) : null}
                            </div>

                            <p className="mt-0.5 text-sm leading-relaxed">
                                {segment.text}
                            </p>

                            {sources.length > 0 ? (
                                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                    {sources.map((source) => (
                                        <li key={source.label}>
                                            <Link
                                                href={sourceRoutes.detail(
                                                    workspaceId,
                                                    source.sourceId,
                                                )}
                                                className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            >
                                                <span className="font-medium">
                                                    {source.label}
                                                </span>
                                                <span className="truncate text-muted-foreground">
                                                    {source.title}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
