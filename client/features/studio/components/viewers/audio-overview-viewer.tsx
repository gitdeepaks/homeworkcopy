"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    DownloadIcon,
    HeadphonesIcon,
    PauseIcon,
    PlayIcon,
    RotateCcwIcon,
    RotateCwIcon,
    Volume2Icon,
    VolumeXIcon,
} from "lucide-react";
import type {
    AudioOverviewOutputContent,
    OutputSourceLabel,
} from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { useOutputAudio } from "../../hooks/use-outputs";
import {
    AUDIO_PLAYBACK_RATES,
    AUDIO_SKIP_SECONDS,
    AUDIO_STYLE_LABELS,
} from "../../lib/constants";
import {
    activeSegmentId,
    formatSpokenDuration,
    formatTimecode,
} from "../../lib/audio";
import { AudioTranscript } from "./audio-transcript";

type AudioOverviewViewerProps = {
    workspaceId: string;
    outputId: string;
    title: string;
    content: AudioOverviewOutputContent;
    sourceLabels: readonly OutputSourceLabel[];
};

/** Base UI reports a single-thumb slider as a number, but types it broadly. */
function sliderValue(value: number | readonly number[]): number {
    return typeof value === "number" ? value : (value[0] ?? 0);
}

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
    const audioRef = useRef<HTMLAudioElement | null>(null);
    /** Survives the element reload that a refreshed signed URL causes. */
    const positionRef = useRef(0);

    const [positionMs, setPositionMs] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackError, setPlaybackError] = useState<string | null>(null);

    const timings = content.timings ?? [];
    const hasMedia = content.media !== undefined && timings.length > 0;
    const {
        data: access,
        isLoading: accessLoading,
        error: accessError,
    } = useOutputAudio(workspaceId, outputId, hasMedia);

    const durationMs = content.media?.durationMs ?? 0;
    const startsMs = new Map(
        timings.map((timing) => [timing.segmentId, timing.startMs]),
    );
    const currentSegmentId = activeSegmentId(timings, positionMs);

    const seekTo = useCallback(
        (nextMs: number) => {
            const audio = audioRef.current;
            if (!audio) {
                return;
            }
            const clamped = Math.min(Math.max(nextMs, 0), durationMs);
            audio.currentTime = clamped / 1_000;
            positionRef.current = clamped;
            setPositionMs(clamped);
        },
        [durationMs],
    );

    // Hand the browser enough metadata to drive lock-screen and headset
    // controls, so playback keeps working once the tab is in the background.
    useEffect(() => {
        if (!("mediaSession" in navigator)) {
            return;
        }

        const session = navigator.mediaSession;
        session.metadata = new MediaMetadata({
            title,
            artist: "Homeworkcopy",
            album: "Audio Overview",
        });
        session.setActionHandler("play", () => {
            void audioRef.current?.play();
        });
        session.setActionHandler("pause", () => {
            audioRef.current?.pause();
        });
        session.setActionHandler("seekbackward", () => {
            seekTo(positionRef.current - AUDIO_SKIP_SECONDS * 1_000);
        });
        session.setActionHandler("seekforward", () => {
            seekTo(positionRef.current + AUDIO_SKIP_SECONDS * 1_000);
        });
        session.setActionHandler("seekto", (details) => {
            if (details.seekTime !== undefined) {
                seekTo(details.seekTime * 1_000);
            }
        });

        return () => {
            session.metadata = null;
            for (const action of [
                "play",
                "pause",
                "seekbackward",
                "seekforward",
                "seekto",
            ] as const) {
                session.setActionHandler(action, null);
            }
        };
    }, [title, seekTo]);

    function togglePlay() {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        if (audio.paused) {
            void audio.play().catch(() => {
                setPlaybackError(
                    "Playback could not start. Try again, or download the audio.",
                );
            });
            return;
        }

        audio.pause();
    }

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

                {!hasMedia ? (
                    <p role="status" className="mt-3 text-sm">
                        The script is ready and the audio is still being
                        recorded. You can read the full transcript below in the
                        meantime.
                    </p>
                ) : accessLoading ? (
                    <p
                        role="status"
                        className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
                    >
                        <Spinner />
                        Preparing playback…
                    </p>
                ) : accessError || !access ? (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                        The audio could not be loaded right now. The full
                        transcript is below.
                    </p>
                ) : (
                    <>
                        {/* The transcript below is this audio's text alternative. */}
                        <audio
                            ref={audioRef}
                            src={access.playbackUrl}
                            preload="metadata"
                            onLoadedMetadata={(event) => {
                                const audio = event.currentTarget;
                                audio.playbackRate = playbackRate;
                                audio.muted = isMuted;
                                // A refreshed signed URL reloads the element;
                                // put the listener back where they were.
                                if (positionRef.current > 0) {
                                    audio.currentTime =
                                        positionRef.current / 1_000;
                                    if (isPlaying) {
                                        void audio.play().catch(() => {
                                            setIsPlaying(false);
                                        });
                                    }
                                }
                            }}
                            onTimeUpdate={(event) => {
                                const next = Math.round(
                                    event.currentTarget.currentTime * 1_000,
                                );
                                positionRef.current = next;
                                setPositionMs(next);
                            }}
                            onPlay={() => {
                                setPlaybackError(null);
                                setIsPlaying(true);
                            }}
                            onPause={() => setIsPlaying(false)}
                            onEnded={() => setIsPlaying(false)}
                            onError={() =>
                                setPlaybackError(
                                    "Playback failed. Try again, or download the audio.",
                                )
                            }
                        />

                        <div className="mt-4 flex items-center gap-3">
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {formatTimecode(positionMs)}
                            </span>
                            <Slider
                                className="flex-1"
                                value={Math.min(positionMs, durationMs)}
                                min={0}
                                max={Math.max(durationMs, 1)}
                                step={1_000}
                                thumbProps={{
                                    "aria-label": "Playback position",
                                    getAriaValueText: (_formatted, value) =>
                                        `${formatTimecode(value)} of ${formatTimecode(durationMs)}`,
                                }}
                                onValueChange={(value) =>
                                    seekTo(sliderValue(value))
                                }
                            />
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {formatTimecode(durationMs)}
                            </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-11"
                                aria-label={`Back ${AUDIO_SKIP_SECONDS} seconds`}
                                onClick={() =>
                                    seekTo(
                                        positionMs -
                                            AUDIO_SKIP_SECONDS * 1_000,
                                    )
                                }
                            >
                                <RotateCcwIcon />
                            </Button>
                            <Button
                                size="icon"
                                className="size-11"
                                aria-label={isPlaying ? "Pause" : "Play"}
                                onClick={togglePlay}
                            >
                                {isPlaying ? <PauseIcon /> : <PlayIcon />}
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-11"
                                aria-label={`Forward ${AUDIO_SKIP_SECONDS} seconds`}
                                onClick={() =>
                                    seekTo(
                                        positionMs +
                                            AUDIO_SKIP_SECONDS * 1_000,
                                    )
                                }
                            >
                                <RotateCwIcon />
                            </Button>

                            <Button
                                variant="outline"
                                size="icon"
                                className="size-11"
                                aria-pressed={isMuted}
                                aria-label={isMuted ? "Unmute" : "Mute"}
                                onClick={() => {
                                    const audio = audioRef.current;
                                    if (!audio) {
                                        return;
                                    }
                                    audio.muted = !audio.muted;
                                    setIsMuted(audio.muted);
                                }}
                            >
                                {isMuted ? <VolumeXIcon /> : <Volume2Icon />}
                            </Button>

                            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Speed</span>
                                <NativeSelect
                                    className="w-24"
                                    value={String(playbackRate)}
                                    onChange={(event) => {
                                        const next = AUDIO_PLAYBACK_RATES.find(
                                            (rate) =>
                                                String(rate) ===
                                                event.target.value,
                                        );
                                        if (next === undefined) {
                                            return;
                                        }
                                        setPlaybackRate(next);
                                        if (audioRef.current) {
                                            audioRef.current.playbackRate =
                                                next;
                                        }
                                    }}
                                >
                                    {AUDIO_PLAYBACK_RATES.map((rate) => (
                                        <NativeSelectOption
                                            key={rate}
                                            value={String(rate)}
                                        >
                                            {rate}×
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </label>

                            <Button
                                nativeButton={false}
                                variant="outline"
                                className="min-h-11"
                                render={
                                    <a
                                        href={access.downloadUrl}
                                        rel="noopener noreferrer"
                                    />
                                }
                            >
                                <DownloadIcon />
                                Download
                            </Button>
                        </div>

                        {playbackError ? (
                            <p
                                role="alert"
                                className="mt-3 text-sm text-destructive"
                            >
                                {playbackError}
                            </p>
                        ) : null}
                    </>
                )}
            </div>

            <AudioTranscript
                workspaceId={workspaceId}
                script={content.script}
                sourceLabels={sourceLabels}
                startsMs={startsMs}
                activeSegmentId={hasMedia ? currentSegmentId : null}
                onSeek={hasMedia && access ? seekTo : undefined}
            />
        </div>
    );
}
