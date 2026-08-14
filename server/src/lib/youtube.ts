/**
 * YouTube transcript extraction for YOUTUBE source imports.
 */

import { YoutubeTranscript } from "youtube-transcript";
import { ValidationError } from "../types/app-error.js";

/**
 * Fetches caption transcript text for a YouTube video.
 *
 * @param url - YouTube page URL
 * @returns Video id and concatenated transcript text
 * @throws {ValidationError} When the URL is invalid, captions are missing, or fetch fails
 *
 *
 */
export async function fetchYoutubeTranscript(url: string) {
    const videoId =
        url.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
        )?.[1] ?? url.match(/youtube\.com\/shorts\/([\w-]{11})/)?.[1];

    if (!videoId) {
        throw new ValidationError("Enter a valid YouTube URL");
    }

    try {
        const segments = await YoutubeTranscript.fetchTranscript(videoId);
        const transcriptSegments = segments.flatMap((segment) => {
            const text = segment.text.trim();
            return text
                ? [{ text, offset: segment.offset, duration: segment.duration }]
                : [];
        });
        const content = transcriptSegments.map((segment) => segment.text).join(" ").trim();

        if (!content) {
            throw new ValidationError(
                "No transcript found for this video",
            );
        }

        return { videoId, content, segments: transcriptSegments };
    } catch {
        throw new ValidationError(
            "Could not fetch transcript. The video may not have captions.",
        );
    }
}
