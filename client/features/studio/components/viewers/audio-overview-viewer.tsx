"use client";

import { useCallback, useRef, useState } from "react";
import { HeadphonesIcon } from "lucide-react";
import type {
    AudioOverviewOutputContent,
    OutputSourceLabel,
} from "@homeworkcopy/contracts";
import { AUDIO_STYLE_LABELS } from "../../lib/constants";
import { activeSegmentId, formatSpokenDuration } from "../../lib/audio";
import { AudioTranscript } from "./audio-transcript";
import {
    NarratedMediaPlayer,
    type NarratedMediaPlayerHandle,
} from "./narrated-media-player";

type AudioOverviewViewerProps = {
    workspaceId: string;
    outputId: string;
    title: string;
    content: AudioOverviewOutputContent;
    sourceLabels: readonly OutputSourceLabel[];
};

/**
 * Audio Overview player with a synchronized, citation-carrying transcript.
 *
 * Audio is never the only way to consume the output: the transcript renders
 * even when playback is unavailable, and every control is a real button with a
 * label rather than a bare icon.
 */
export function AudioOverviewViewer({
    workspaceId,
    outputId,
    title,
    content,
    sourceLabels,
}: AudioOverviewViewerProps) {
    const playerRef = useRef<NarratedMediaPlayerHandle | null>(null);
    const [positionMs, setPositionMs] = useState(0);
    const [canSeek, setCanSeek] = useState(false);

    const timings = content.timings ?? [];
    const hasMedia = content.media !== undefined && timings.length > 0;
    const durationMs = content.media?.durationMs ?? 0;
    const startsMs = new Map(
        timings.map((timing) => [timing.segmentId, timing.startMs]),
    );

    const seekTo = useCallback((nextMs: number) => {
        playerRef.current?.seekTo(nextMs);
    }, []);

    return (
        <div>
            <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <HeadphonesIcon aria-hidden className="size-4" />
                    <span>{AUDIO_STYLE_LABELS[content.script.style]}</span>
                    <span aria-hidden>·</span>
                    <span>{content.script.segments.length} segments</span>
                    {durationMs > 0 ? (
                        <>
                            <span aria-hidden>·</span>
                            <span>{formatSpokenDuration(durationMs)}</span>
                        </>
                    ) : null}
                </div>

                <NarratedMediaPlayer
                    ref={playerRef}
                    workspaceId={workspaceId}
                    outputId={outputId}
                    title={title}
                    mediaLabel="Audio Overview"
                    durationMs={durationMs}
                    hasMedia={hasMedia}
                    pendingMessage="The script is ready and the audio is still being recorded. You can read the full transcript below in the meantime."
                    onPositionChange={setPositionMs}
                    onPlaybackAvailable={setCanSeek}
                />
            </div>

            <AudioTranscript
                workspaceId={workspaceId}
                script={content.script}
                sourceLabels={sourceLabels}
                startsMs={startsMs}
                activeSegmentId={
                    hasMedia ? activeSegmentId(timings, positionMs) : null
                }
                onSeek={canSeek ? seekTo : undefined}
            />
        </div>
    );
}
