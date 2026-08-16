import type {
    AudioSegmentTiming,
    OutputSourceLabel,
} from "@homeworkcopy/contracts";

/**
 * Formats a position or duration as a timecode.
 *
 * @param ms - Milliseconds, negative and non-finite values clamp to zero
 * @returns `m:ss`, or `h:mm:ss` once the value passes an hour
 */
export function formatTimecode(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(Number.isFinite(ms) ? ms : 0) / 1_000);
    const seconds = Math.floor(totalSeconds % 60);
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3_600);
    const paddedSeconds = String(seconds).padStart(2, "0");

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`
        : `${minutes}:${paddedSeconds}`;
}

/**
 * Formats a duration for assistive technology and card metadata, where a bare
 * timecode reads as a time of day rather than a length.
 *
 * @param ms - Duration in milliseconds
 * @returns A spoken-form duration such as `4 min 12 sec`
 */
export function formatSpokenDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0) / 1_000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);

    if (minutes === 0) {
        return `${seconds} sec`;
    }

    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} sec`;
}

/**
 * Finds the segment being spoken at a playback position.
 *
 * The last segment stays active once playback runs past its end, so the
 * transcript does not blank out on the final frames of the file.
 *
 * @param timings - Segment timings in playback order
 * @param positionMs - Current playback position
 * @returns The active segment id, or `null` when there are no timings
 */
export function activeSegmentId(
    timings: readonly AudioSegmentTiming[],
    positionMs: number,
): string | null {
    if (timings.length === 0) {
        return null;
    }

    const position = Math.max(0, positionMs);

    for (const timing of timings) {
        if (position < timing.endMs) {
            return timing.segmentId;
        }
    }

    return timings[timings.length - 1]?.segmentId ?? null;
}

/**
 * Resolves a segment's citation labels to the sources they point at.
 *
 * Labels the output never declared are dropped, so the transcript never offers
 * a citation the reader cannot open.
 *
 * @param labels - Label map persisted with the output
 * @param sourceLabels - Labels carried by one script segment
 * @returns The declared sources, in the order the segment cited them
 */
export function segmentSources(
    labels: readonly OutputSourceLabel[],
    sourceLabels: readonly string[],
): OutputSourceLabel[] {
    const byLabel = new Map(labels.map((entry) => [entry.label, entry]));

    return sourceLabels.flatMap((label) => {
        const source = byLabel.get(label);
        return source ? [source] : [];
    });
}
