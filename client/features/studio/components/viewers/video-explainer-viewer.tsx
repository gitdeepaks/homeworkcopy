"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FilmIcon } from "lucide-react";
import {
    buildWebVtt,
    playableVideoExplainerContentSchema,
    videoExplainerCaptionCues,
    type OutputSourceLabel,
    type VideoExplainerOutputContent,
} from "@homeworkcopy/contracts";
import { sourceRoutes } from "@/features/sources";
import { cn } from "@/lib/utils";
import { useCaptionTrackUrl } from "../../hooks/use-caption-track";
import {
    activeSegmentId,
    formatSpokenDuration,
    formatTimecode,
    segmentSources,
} from "../../lib/audio";
import {
    NarratedMediaPlayer,
    type NarratedMediaPlayerHandle,
} from "./narrated-media-player";
import { StoryboardStage } from "./storyboard-stage";

type VideoExplainerViewerProps = {
    workspaceId: string;
    outputId: string;
    title: string;
    content: VideoExplainerOutputContent;
    sourceLabels: readonly OutputSourceLabel[];
};

/**
 * Video-style explainer: a narrated storyboard with captions and a cited
 * transcript.
 *
 * The frame advances with the narration, captions ride on the audio element, and
 * the transcript below repeats every spoken line with the sources behind it — so
 * the output is fully usable with the sound off.
 */
export function VideoExplainerViewer({
    workspaceId,
    outputId,
    title,
    content,
    sourceLabels,
}: VideoExplainerViewerProps) {
    const playerRef = useRef<NarratedMediaPlayerHandle | null>(null);
    const [positionMs, setPositionMs] = useState(0);
    const [canSeek, setCanSeek] = useState(false);

    const { scenes, language } = content.storyboard;
    const timings = content.timings ?? [];
    const hasMedia = content.media !== undefined && timings.length > 0;
    const durationMs = content.media?.durationMs ?? 0;

    const startsMs = new Map(
        timings.map((timing) => [timing.segmentId, timing.startMs]),
    );

    const currentSceneId = hasMedia
        ? activeSegmentId(timings, positionMs)
        : null;
    const currentIndex = Math.max(
        0,
        scenes.findIndex((scene) => scene.id === currentSceneId),
    );
    const currentScene = scenes[currentIndex] ?? scenes[0];

    // Captions are derived from the same timings the transcript uses, so the two
    // can never disagree, and are only offered once there is audio to ride on.
    const vtt = useMemo(() => {
        const playable = playableVideoExplainerContentSchema.safeParse(content);
        return playable.success
            ? buildWebVtt(videoExplainerCaptionCues(playable.data))
            : null;
    }, [content]);
    const captionUrl = useCaptionTrackUrl(vtt);

    const seekTo = useCallback((nextMs: number) => {
        playerRef.current?.seekTo(nextMs);
    }, []);

    if (!currentScene) {
        return (
            <p role="alert" className="py-8 text-center text-sm text-muted-foreground">
                This explainer has no scenes. Regenerate it to rebuild the
                storyboard.
            </p>
        );
    }

    return (
        <div>
            <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <FilmIcon aria-hidden className="size-4" />
                    <span>Narrated explainer</span>
                    <span aria-hidden>·</span>
                    <span>{scenes.length} scenes</span>
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
                    mediaLabel="Video Explainer"
                    durationMs={durationMs}
                    hasMedia={hasMedia}
                    pendingMessage="The storyboard is ready and the narration is still being recorded. You can read every scene below in the meantime."
                    onPositionChange={setPositionMs}
                    onPlaybackAvailable={setCanSeek}
                    stage={
                        <div className="mt-3">
                            <StoryboardStage
                                title={content.storyboard.title}
                                scene={currentScene}
                                index={currentIndex}
                                total={scenes.length}
                            />
                        </div>
                    }
                    {...(captionUrl
                        ? {
                              captionTrack: {
                                  src: captionUrl,
                                  label: "Narration captions",
                                  language,
                              },
                          }
                        : {})}
                />
            </div>

            <section aria-labelledby="storyboard-title" className="mt-6">
                <h3 id="storyboard-title" className="text-sm font-semibold">
                    Storyboard and transcript
                </h3>

                <ol className="mt-3 space-y-3">
                    {scenes.map((scene, index) => {
                        const startMs = startsMs.get(scene.id);
                        const isActive = scene.id === currentSceneId;
                        const sources = segmentSources(
                            sourceLabels,
                            scene.sourceLabels,
                        );

                        return (
                            <li
                                key={scene.id}
                                aria-current={isActive ? "true" : undefined}
                                className={cn(
                                    "rounded-md border-l-2 py-1.5 pl-3 transition-colors",
                                    isActive
                                        ? "border-l-primary bg-highlighter"
                                        : "border-l-transparent",
                                )}
                            >
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    {startMs !== undefined && canSeek ? (
                                        <button
                                            type="button"
                                            onClick={() => seekTo(startMs)}
                                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm font-mono text-xs text-muted-foreground tabular-nums hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                        >
                                            <span className="sr-only">
                                                Play from{" "}
                                            </span>
                                            {formatTimecode(startMs)}
                                        </button>
                                    ) : null}
                                    <span className="text-xs font-semibold tracking-wide uppercase">
                                        Scene {index + 1}
                                    </span>
                                </div>

                                <p className="mt-0.5 text-sm font-medium">
                                    {scene.title}
                                </p>

                                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                                    {scene.bullets.map((bullet, bulletIndex) => (
                                        <li
                                            key={`${scene.id}-${String(bulletIndex)}`}
                                            className="flex gap-2"
                                        >
                                            <span aria-hidden>—</span>
                                            <span>{bullet}</span>
                                        </li>
                                    ))}
                                </ul>

                                <p className="mt-1.5 text-sm leading-relaxed">
                                    {scene.narration}
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
        </div>
    );
}
