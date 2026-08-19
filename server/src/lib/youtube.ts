/**
 * YouTube transcript extraction for YOUTUBE source imports.
 *
 * The transcript library tries YouTube's InnerTube player API first and falls
 * back to scraping the watch page. That fallback is where the ambiguity lives:
 * it is only reached when InnerTube yielded no caption tracks, and when the page
 * fetch is then rate-limited the library reports "too many requests" — which
 * reads like a transient block but is usually a video with no captions at all.
 *
 * Those two outcomes need opposite handling. One is worth retrying; the other
 * can never succeed. So rather than guess, that single ambiguous error triggers
 * one confirming InnerTube probe, and the answer decides the failure code.
 *
 * A confirmed absence of captions is not a failure here, though — it is a
 * returned outcome, because the caller can still transcribe the video's audio
 * (see `./youtube-audio.js`). Only the outcomes no fallback can rescue are
 * thrown: an unplayable video, and a reader that was blocked rather than
 * out of luck.
 */

import { z } from "zod";
import type { TranscriptSegment } from "@homeworkcopy/contracts";
import {
    YoutubeTranscript,
    YoutubeTranscriptDisabledError,
    YoutubeTranscriptNotAvailableError,
    YoutubeTranscriptNotAvailableLanguageError,
    YoutubeTranscriptTooManyRequestError,
    YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { logger } from "./logger.js";
import { SourceExtractionError, ValidationError } from "../types/app-error.js";

const INNERTUBE_PLAYER_URL =
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
/**
 * Kept in step with the transcript library's own client version. A stale version
 * is refused by YouTube, which the probe reports as `unknown` rather than
 * mistaking for an answer.
 */
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;
const INNERTUBE_TIMEOUT_MS = 10_000;

/**
 * Only the three fields the probe reads. The player payload is large and
 * unstable, so everything else is ignored by construction rather than typed and
 * then left to drift.
 */
const innertubePlayerSchema = z.object({
    playabilityStatus: z.object({ status: z.string().min(1) }).optional(),
    captions: z
        .object({
            playerCaptionsTracklistRenderer: z
                .object({
                    captionTracks: z
                        .array(z.object({ languageCode: z.string() }))
                        .optional(),
                })
                .optional(),
        })
        .optional(),
});

/**
 * What YouTube says about a video's captions.
 *
 * `unknown` is a first-class answer, not a failure: when the probe itself cannot
 * get a straight response, saying so is better than inventing a cause.
 */
export type CaptionAvailability =
    | { kind: "captions-present"; languages: string[] }
    | { kind: "no-captions" }
    | { kind: "video-unavailable"; status: string }
    | { kind: "unknown" };

/**
 * Asks YouTube directly whether a video has caption tracks.
 *
 * Runs only on the ambiguous failure path, so the normal import costs nothing
 * extra. Every way this can go wrong — network, timeout, a rejected client
 * version, a changed payload shape — resolves to `unknown`, because a probe that
 * throws would replace one unclear failure with another.
 *
 * @param videoId - Video to ask about
 * @returns What YouTube reports, or `unknown` when it will not say
 */
export async function probeCaptionAvailability(
    videoId: string,
): Promise<CaptionAvailability> {
    try {
        const response = await fetch(INNERTUBE_PLAYER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": INNERTUBE_USER_AGENT,
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: "ANDROID",
                        clientVersion: INNERTUBE_CLIENT_VERSION,
                    },
                },
                videoId,
            }),
            signal: AbortSignal.timeout(INNERTUBE_TIMEOUT_MS),
        });

        if (!response.ok) {
            logger.warn(
                { videoId, status: response.status },
                "youtube caption probe rejected",
            );
            return { kind: "unknown" };
        }

        const parsed = innertubePlayerSchema.safeParse(await response.json());
        if (!parsed.success) {
            logger.warn({ videoId }, "youtube caption probe payload unreadable");
            return { kind: "unknown" };
        }

        return readCaptionAvailability(parsed.data);
    } catch (error) {
        logger.warn({ error, videoId }, "youtube caption probe failed");
        return { kind: "unknown" };
    }
}

/**
 * Reads a parsed player payload as a caption answer.
 *
 * Separated from the request so the interpretation — which is where the
 * judgement lives — can be tested without touching the network.
 *
 * @param player - Parsed InnerTube player response
 * @returns What the payload says about captions
 */
export function readCaptionAvailability(
    player: z.infer<typeof innertubePlayerSchema>,
): CaptionAvailability {
    const status = player.playabilityStatus?.status;

    // A video that will not play tells us nothing about its captions, and is
    // its own reason the import cannot proceed.
    if (status !== undefined && status !== "OK") {
        return { kind: "video-unavailable", status };
    }

    const tracks =
        player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

    return tracks.length === 0
        ? { kind: "no-captions" }
        : {
              kind: "captions-present",
              languages: tracks.map((track) => track.languageCode),
          };
}

/**
 * Turns a confirmed caption answer into the failure to raise.
 *
 * `captions-present` is the one retriable outcome: YouTube says the tracks
 * exist, so the reader was blocked rather than out of luck.
 *
 * @param availability - What the probe established
 * @param videoId - Video being imported, for the log line only
 * @returns The failure to raise
 */
export function failureFromCaptionAvailability(
    availability: CaptionAvailability,
    videoId: string,
): SourceExtractionError {
    switch (availability.kind) {
        case "no-captions":
            return new SourceExtractionError(
                "NO_EXTRACTABLE_CONTENT",
                "This video has no captions, and its audio could not be transcribed, so there is nothing to import.",
            );

        case "video-unavailable":
            logger.info(
                { videoId, status: availability.status },
                "youtube video not playable",
            );
            return new SourceExtractionError(
                "NO_EXTRACTABLE_CONTENT",
                "This video is unavailable, so its transcript cannot be read.",
            );

        case "captions-present":
            return new SourceExtractionError(
                "EXTRACTION_FAILED",
                "YouTube is rate-limiting transcript requests from this server. This video does have captions, so retry the import in a few minutes.",
            );

        case "unknown":
            // The probe could not settle it either, so the message covers both
            // possibilities rather than asserting a cause we never established.
            return new SourceExtractionError(
                "EXTRACTION_FAILED",
                "Could not read this video's transcript. YouTube may be rate-limiting this server, so retrying in a few minutes may work. If it keeps failing, the video has no captions to import.",
            );
    }
}

/**
 * How far a caption read got.
 *
 * `captions-unavailable` is deliberately not an error: YouTube has confirmed
 * there are no caption tracks, which is exactly the case the audio fallback
 * exists for. Everything the fallback cannot rescue is thrown instead.
 */
type CaptionReadFailure =
    | { kind: "captions-unavailable" }
    | { kind: "error"; error: SourceExtractionError };

/**
 * Explains a transcript failure in terms the reader can act on.
 *
 * `NO_EXTRACTABLE_CONTENT` means retrying can never help: the video has no
 * captions to import. `EXTRACTION_FAILED` means the attempt was blocked and a
 * later one may succeed. Getting this distinction right is the difference
 * between "retry the import" and "this video will never work".
 *
 * @param error - Whatever the transcript library threw
 * @param videoId - Video being imported
 * @returns Either a confirmed absence of captions, or the failure to raise
 */
async function toCaptionReadFailure(
    error: unknown,
    videoId: string,
): Promise<CaptionReadFailure> {
    if (
        error instanceof YoutubeTranscriptDisabledError ||
        error instanceof YoutubeTranscriptNotAvailableError ||
        error instanceof YoutubeTranscriptNotAvailableLanguageError
    ) {
        return { kind: "captions-unavailable" };
    }

    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
        return {
            kind: "error",
            error: failureFromCaptionAvailability(
                { kind: "video-unavailable", status: "UNPLAYABLE" },
                videoId,
            ),
        };
    }

    // The library's captcha error is the ambiguous one described at the top of
    // this file, and the only case worth spending a second request to settle.
    if (error instanceof YoutubeTranscriptTooManyRequestError) {
        const availability = await probeCaptionAvailability(videoId);

        // Only a confirmed absence hands the video to the audio fallback. An
        // unsettled probe may well be captions behind a temporary block, and a
        // free retry is preferable to paying a transcription provider on a guess.
        return availability.kind === "no-captions"
            ? { kind: "captions-unavailable" }
            : {
                  kind: "error",
                  error: failureFromCaptionAvailability(availability, videoId),
              };
    }

    // Logged rather than surfaced: an unrecognized provider error can carry
    // response bodies and internal URLs, which are not a reader's business.
    logger.error({ error, videoId }, "youtube transcript failed");

    return {
        kind: "error",
        error: new SourceExtractionError(
            "EXTRACTION_FAILED",
            "Could not read this video's transcript. Retry the import.",
        ),
    };
}

/**
 * The failure to raise for a caption-less video that cannot be transcribed
 * either — because no transcription provider is configured, the fallback is
 * switched off, or the audio itself could not be read.
 *
 * Authored in one place so the two paths that reach it cannot drift apart.
 *
 * @param videoId - Video being imported, for the log line only
 * @returns The failure to raise
 */
export function captionsUnavailableFailure(
    videoId: string,
): SourceExtractionError {
    return failureFromCaptionAvailability({ kind: "no-captions" }, videoId);
}

/**
 * Extracts the video id from any YouTube URL form.
 *
 * The single reading of a YouTube URL in the codebase, so a form accepted at
 * import time is the same form the transcript and audio paths can act on.
 *
 * @param url - Candidate YouTube URL
 * @returns The 11-character video id, or `null` when the URL names no video
 */
export function parseYoutubeVideoId(url: string): string | null {
    return (
        url.match(
            /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/,
        )?.[1] ?? null
    );
}

/**
 * Cue duration at or above which a caption reader is reporting milliseconds.
 *
 * The transcript library parses two caption formats and silently reports the
 * units of whichever one YouTube served: the current `srv3` format carries
 * milliseconds, the older one carries seconds, and nothing in the returned value
 * distinguishes them. Cue durations settle it. A caption stays on screen for
 * somewhere between a fraction of a second and about ten seconds; expressed in
 * milliseconds that same range is hundreds to thousands. A threshold of 100 sits
 * more than an order of magnitude clear of both, so no real caption track lands
 * anywhere near it.
 */
const MILLISECOND_CUE_THRESHOLD = 100;

/** One segment as the transcript library reports it, in unknown units. */
type RawCaptionSegment = { text: string; offset: number; duration: number };

/**
 * Rewrites caption timings in seconds.
 *
 * Everything downstream — chunk metadata, a citation's deep link into the video,
 * the transcript shown beside it — reads these as seconds, which is also what
 * the speech-to-text path produces. Normalising here is what lets one video's
 * citations mean the same thing whether they came from its captions or from
 * transcribing its audio.
 *
 * The unit is read from the median cue duration rather than the first, so a
 * single malformed cue cannot decide it for the whole track. A track whose cues
 * all report zero length is taken as seconds, because nothing in it says
 * otherwise.
 *
 * @param segments - Segments as the transcript library reported them
 * @returns The same segments with timings in seconds
 */
export function normalizeCaptionSegments(
    segments: readonly RawCaptionSegment[],
): TranscriptSegment[] {
    const durations = segments
        .map((segment) => segment.duration)
        .filter((duration) => Number.isFinite(duration) && duration > 0)
        .sort((left, right) => left - right);

    const median = durations[Math.floor(durations.length / 2)] ?? 0;
    const scale = median >= MILLISECOND_CUE_THRESHOLD ? 1_000 : 1;

    return segments.map((segment) => ({
        text: segment.text,
        offset: Math.round((segment.offset / scale) * 1_000) / 1_000,
        duration: Math.round((segment.duration / scale) * 1_000) / 1_000,
    }));
}

/**
 * What a caption read produced.
 *
 * A union rather than a transcript-or-throw, because "this video has no
 * captions" is a routable answer: the caller transcribes the audio instead.
 */
export type YoutubeTranscriptResult =
    | {
          kind: "transcript";
          videoId: string;
          content: string;
          segments: TranscriptSegment[];
      }
    | { kind: "captions-unavailable"; videoId: string };

/**
 * Fetches caption transcript text for a YouTube video.
 *
 * @param url - YouTube page URL
 * @returns The transcript, or the fact that the video has no captions to read
 * @throws {ValidationError} When the URL is not a YouTube video URL
 * @throws {SourceExtractionError} When the transcript cannot be read for a
 * reason transcribing the audio would not solve, carrying whether a retry could
 * ever succeed
 */
export async function fetchYoutubeTranscript(
    url: string,
): Promise<YoutubeTranscriptResult> {
    const videoId = parseYoutubeVideoId(url);

    if (!videoId) {
        throw new ValidationError("Enter a valid YouTube URL");
    }

    let segments: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>>;
    try {
        segments = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (error) {
        const failure = await toCaptionReadFailure(error, videoId);
        if (failure.kind === "error") throw failure.error;
        return { kind: "captions-unavailable", videoId };
    }

    const transcriptSegments = normalizeCaptionSegments(
        segments.flatMap((segment) => {
            const text = segment.text.trim();
            return text
                ? [{ text, offset: segment.offset, duration: segment.duration }]
                : [];
        }),
    );
    const content = transcriptSegments
        .map((segment) => segment.text)
        .join(" ")
        .trim();

    // A caption track that exists but holds only music cues or blank cues has
    // nothing to ground an answer in, so it is treated as no captions at all —
    // and the audio, which does carry speech, becomes the better source.
    if (!content) {
        return { kind: "captions-unavailable", videoId };
    }

    return { kind: "transcript", videoId, content, segments: transcriptSegments };
}
