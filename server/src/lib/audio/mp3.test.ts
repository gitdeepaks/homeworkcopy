import { describe, expect, test } from "bun:test";
import { concatAudio, measureMp3 } from "./mp3.js";

/**
 * Builds one MPEG1 Layer III frame at 128 kbps / 44.1 kHz, which is 417 bytes
 * long and 26.122 ms of audio.
 */
function mpeg1Layer3Frame(): Uint8Array {
    const frame = new Uint8Array(417);
    frame[0] = 0xff;
    frame[1] = 0xfb; // MPEG1, Layer III, no CRC
    frame[2] = 0x90; // bitrate index 9 (128 kbps), sample rate index 0 (44.1 kHz)
    frame[3] = 0xc4;
    return frame;
}

/** MPEG2 Layer III frame at 64 kbps / 22.05 kHz: 209 bytes, 26.122 ms. */
function mpeg2Layer3Frame(): Uint8Array {
    const frame = new Uint8Array(209);
    frame[0] = 0xff;
    frame[1] = 0xf3; // MPEG2, Layer III, no CRC
    frame[2] = 0x80; // bitrate index 8 (64 kbps), sample rate index 0 (22.05 kHz)
    frame[3] = 0xc4;
    return frame;
}

function withId3(payload: Uint8Array, tagBytes: number): Uint8Array {
    const tag = new Uint8Array(tagBytes + 10);
    tag[0] = 0x49;
    tag[1] = 0x44;
    tag[2] = 0x33;
    tag[3] = 0x03;
    tag[9] = tagBytes; // syncsafe size, small enough to fit one byte
    return concatAudio([tag, payload]);
}

describe("measureMp3", () => {
    test("sums the duration of every MPEG1 Layer III frame", () => {
        const audio = concatAudio([
            mpeg1Layer3Frame(),
            mpeg1Layer3Frame(),
            mpeg1Layer3Frame(),
        ]);

        expect(measureMp3(audio)).toEqual({ durationMs: 78, frameCount: 3 });
    });

    test("handles the half-rate MPEG2 frames a TTS vendor may return", () => {
        const measurement = measureMp3(
            concatAudio([mpeg2Layer3Frame(), mpeg2Layer3Frame()]),
        );

        expect(measurement).toEqual({ durationMs: 52, frameCount: 2 });
    });

    test("skips a leading ID3v2 tag instead of resyncing through it", () => {
        const audio = withId3(mpeg1Layer3Frame(), 32);

        expect(measureMp3(audio)).toEqual({ durationMs: 26, frameCount: 1 });
    });

    test("returns null when the buffer carries no frame", () => {
        expect(measureMp3(new Uint8Array(0))).toBeNull();
        expect(measureMp3(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
        expect(measureMp3(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBeNull();
    });

    test("ignores a free-format or reserved header rather than mistiming it", () => {
        const badBitrate = mpeg1Layer3Frame();
        badBitrate[2] = 0xf0; // bitrate index 15 is invalid
        expect(measureMp3(badBitrate)).toBeNull();

        const reservedLayer = mpeg1Layer3Frame();
        reservedLayer[1] = 0xf9; // layer bits 00 are reserved
        expect(measureMp3(reservedLayer)).toBeNull();
    });
});

describe("concatAudio", () => {
    test("preserves byte order and total length", () => {
        const joined = concatAudio([
            new Uint8Array([1, 2]),
            new Uint8Array([]),
            new Uint8Array([3]),
        ]);

        expect(Array.from(joined)).toEqual([1, 2, 3]);
        expect(concatAudio([]).byteLength).toBe(0);
    });
});
