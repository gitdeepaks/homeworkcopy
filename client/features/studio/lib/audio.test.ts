import { describe, expect, test } from "bun:test";
import type { AudioSegmentTiming } from "@homeworkcopy/contracts";
import {
    activeSegmentId,
    formatSpokenDuration,
    formatTimecode,
    segmentSources,
} from "./audio";

const TIMINGS: AudioSegmentTiming[] = [
    { segmentId: "s1", startMs: 0, endMs: 4_000 },
    { segmentId: "s2", startMs: 4_000, endMs: 9_500 },
    { segmentId: "s3", startMs: 9_500, endMs: 12_000 },
];

describe("formatTimecode", () => {
    test("formats minutes and seconds", () => {
        expect(formatTimecode(0)).toBe("0:00");
        expect(formatTimecode(9_500)).toBe("0:09");
        expect(formatTimecode(187_000)).toBe("3:07");
    });

    test("adds an hours field only when it is needed", () => {
        expect(formatTimecode(3_723_000)).toBe("1:02:03");
    });

    test("clamps values a media element can briefly report", () => {
        expect(formatTimecode(-5)).toBe("0:00");
        expect(formatTimecode(Number.NaN)).toBe("0:00");
        expect(formatTimecode(Number.POSITIVE_INFINITY)).toBe("0:00");
    });
});

describe("formatSpokenDuration", () => {
    test("reads as a length rather than a time of day", () => {
        expect(formatSpokenDuration(45_000)).toBe("45 sec");
        expect(formatSpokenDuration(252_000)).toBe("4 min 12 sec");
        expect(formatSpokenDuration(240_000)).toBe("4 min");
    });
});

describe("activeSegmentId", () => {
    test("tracks the segment being spoken", () => {
        expect(activeSegmentId(TIMINGS, 0)).toBe("s1");
        expect(activeSegmentId(TIMINGS, 3_999)).toBe("s1");
        expect(activeSegmentId(TIMINGS, 4_000)).toBe("s2");
        expect(activeSegmentId(TIMINGS, 9_499)).toBe("s2");
    });

    test("holds the last segment through the end of the file", () => {
        expect(activeSegmentId(TIMINGS, 12_000)).toBe("s3");
        expect(activeSegmentId(TIMINGS, 99_000)).toBe("s3");
    });

    test("returns null when there is no timeline", () => {
        expect(activeSegmentId([], 1_000)).toBeNull();
    });
});

describe("segmentSources", () => {
    const labels = [
        { label: "S1", sourceId: "source-1", title: "Alpha" },
        { label: "S2", sourceId: "source-2", title: "Beta" },
    ];

    test("resolves declared labels in citation order", () => {
        expect(segmentSources(labels, ["S2", "S1"])).toEqual([
            { label: "S2", sourceId: "source-2", title: "Beta" },
            { label: "S1", sourceId: "source-1", title: "Alpha" },
        ]);
    });

    test("drops a label the output never declared", () => {
        expect(segmentSources(labels, ["S9"])).toEqual([]);
        expect(segmentSources([], ["S1"])).toEqual([]);
    });
});
