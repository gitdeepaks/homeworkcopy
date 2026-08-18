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
 */

import { z } from "zod";
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
                "This video has no captions, so there is no transcript to import. Try a video with captions turned on.",
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
 * Explains a transcript failure in terms the reader can act on.
 *
 * `NO_EXTRACTABLE_CONTENT` means retrying can never help: the video has no
 * captions to import. `EXTRACTION_FAILED` means the attempt was blocked and a
 * later one may succeed. Getting this distinction right is the difference
 * between "retry the import" and "this video will never work".
 *
 * @param error - Whatever the transcript library threw
 * @param videoId - Video being imported
 * @returns The failure to raise
 */
async function toExtractionFailure(
    error: unknown,
    videoId: string,
): Promise<SourceExtractionError> {
    if (
        error instanceof YoutubeTranscriptDisabledError ||
        error instanceof YoutubeTranscriptNotAvailableError ||
        error instanceof YoutubeTranscriptNotAvailableLanguageError
    ) {
        return new SourceExtractionError(
            "NO_EXTRACTABLE_CONTENT",
            "This video has no captions, so there is no transcript to import. Try a video with captions turned on.",
        );
    }

    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
        return new SourceExtractionError(
            "NO_EXTRACTABLE_CONTENT",
            "This video is unavailable, so its transcript cannot be read.",
        );
    }

    // The library's captcha error is the ambiguous one described at the top of
    // this file, and the only case worth spending a second request to settle.
    if (error instanceof YoutubeTranscriptTooManyRequestError) {
        return failureFromCaptionAvailability(
            await probeCaptionAvailability(videoId),
            videoId,
        );
    }

    // Logged rather than surfaced: an unrecognized provider error can carry
    // response bodies and internal URLs, which are not a reader's business.
    logger.error({ error, videoId }, "youtube transcript failed");

    return new SourceExtractionError(
        "EXTRACTION_FAILED",
        "Could not read this video's transcript. Retry the import.",
    );
}

/**
 * Fetches caption transcript text for a YouTube video.
 *
 * @param url - YouTube page URL
 * @returns Video id, concatenated transcript text, and timestamped segments
 * @throws {ValidationError} When the URL is not a YouTube video URL
 * @throws {SourceExtractionError} When the transcript cannot be read, carrying
 * whether a retry could ever succeed
 */
export async function fetchYoutubeTranscript(url: string) {
    const videoId =
        url.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
        )?.[1] ?? url.match(/youtube\.com\/shorts\/([\w-]{11})/)?.[1];

    if (!videoId) {
        throw new ValidationError("Enter a valid YouTube URL");
    }

    let segments: Awaited<ReturnType<typeof YoutubeTranscript.fetchTranscript>>;
    try {
        segments = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (error) {
        throw await toExtractionFailure(error, videoId);
    }

    const transcriptSegments = segments.flatMap((segment) => {
        const text = segment.text.trim();
        return text
            ? [{ text, offset: segment.offset, duration: segment.duration }]
            : [];
    });
    const content = transcriptSegments
        .map((segment) => segment.text)
        .join(" ")
        .trim();

    // A caption track that exists but holds only music cues or blank cues has
    // nothing to ground an answer in, so it is treated as no transcript at all.
    if (!content) {
        throw new SourceExtractionError(
            "NO_EXTRACTABLE_CONTENT",
            "This video's captions contain no readable text to import.",
        );
    }

    return { videoId, content, segments: transcriptSegments };
}
