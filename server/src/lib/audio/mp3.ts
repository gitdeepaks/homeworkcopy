/**
 * Minimal MPEG audio frame reader.
 *
 * Audio Overviews are synthesized one script segment at a time and stitched
 * together, so the pipeline needs the exact duration of every part to build the
 * transcript timeline. Parsing frame headers keeps that measurement dependency
 * free — no ffmpeg or native decoder in the deployment image.
 */

type MpegVersion = "mpeg1" | "mpeg2" | "mpeg2.5";
type MpegLayer = "layer1" | "layer2" | "layer3";

const BITRATES_KBPS = {
    mpeg1: {
        layer1: [
            0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416,
            448,
        ],
        layer2: [
            0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384,
        ],
        layer3: [
            0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
        ],
    },
    mpeg2: {
        layer1: [
            0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256,
        ],
        layer2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
        layer3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    },
} as const;

const SAMPLE_RATES_HZ = {
    mpeg1: [44_100, 48_000, 32_000],
    mpeg2: [22_050, 24_000, 16_000],
    "mpeg2.5": [11_025, 12_000, 8_000],
} as const;

const SAMPLES_PER_FRAME = {
    layer1: 384,
    layer2: 1_152,
    layer3: { mpeg1: 1_152, low: 576 },
} as const;

function readVersion(byte: number): MpegVersion | null {
    switch ((byte >> 3) & 0b11) {
        case 0b00:
            return "mpeg2.5";
        case 0b10:
            return "mpeg2";
        case 0b11:
            return "mpeg1";
        default:
            return null;
    }
}

function readLayer(byte: number): MpegLayer | null {
    switch ((byte >> 1) & 0b11) {
        case 0b01:
            return "layer3";
        case 0b10:
            return "layer2";
        case 0b11:
            return "layer1";
        default:
            return null;
    }
}

function bitrateBps(
    version: MpegVersion,
    layer: MpegLayer,
    index: number,
): number | null {
    const table =
        version === "mpeg1" ? BITRATES_KBPS.mpeg1 : BITRATES_KBPS.mpeg2;
    const kbps = table[layer][index];
    return kbps === undefined || kbps === 0 ? null : kbps * 1_000;
}

function sampleRateHz(version: MpegVersion, index: number): number | null {
    return SAMPLE_RATES_HZ[version][index] ?? null;
}

function samplesPerFrame(version: MpegVersion, layer: MpegLayer): number {
    if (layer === "layer1") {
        return SAMPLES_PER_FRAME.layer1;
    }
    if (layer === "layer2") {
        return SAMPLES_PER_FRAME.layer2;
    }
    return version === "mpeg1"
        ? SAMPLES_PER_FRAME.layer3.mpeg1
        : SAMPLES_PER_FRAME.layer3.low;
}

type Mp3Frame = {
    byteLength: number;
    durationMs: number;
};

/**
 * Reads the frame header at `offset`.
 *
 * @param bytes - Buffer being scanned
 * @param offset - Position of a candidate frame sync
 * @returns Frame size and playback duration, or `null` when this is not a frame
 */
function readFrame(bytes: Uint8Array, offset: number): Mp3Frame | null {
    if (offset + 4 > bytes.length) {
        return null;
    }

    const [byte0, byte1, byte2] = [
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
    ];

    if (byte0 === undefined || byte1 === undefined || byte2 === undefined) {
        return null;
    }

    if (byte0 !== 0xff || (byte1 & 0xe0) !== 0xe0) {
        return null;
    }

    const version = readVersion(byte1);
    const layer = readLayer(byte1);
    if (!version || !layer) {
        return null;
    }

    const bitrate = bitrateBps(version, layer, (byte2 >> 4) & 0b1111);
    const sampleRate = sampleRateHz(version, (byte2 >> 2) & 0b11);
    if (bitrate === null || sampleRate === null) {
        return null;
    }

    const padding = (byte2 >> 1) & 0b1;
    const samples = samplesPerFrame(version, layer);
    const byteLength =
        layer === "layer1"
            ? (Math.floor((12 * bitrate) / sampleRate) + padding) * 4
            : Math.floor((samples / 8) * (bitrate / sampleRate)) + padding;

    if (byteLength <= 4) {
        return null;
    }

    return { byteLength, durationMs: (samples / sampleRate) * 1_000 };
}

/** Length of the ID3v2 tag at the start of the buffer, if there is one. */
function id3v2Length(bytes: Uint8Array): number {
    if (bytes.length < 10) {
        return 0;
    }
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
        return 0;
    }

    const sizeBytes = [bytes[6], bytes[7], bytes[8], bytes[9]];
    let size = 0;
    for (const byte of sizeBytes) {
        if (byte === undefined || byte > 0x7f) {
            return 0;
        }
        size = (size << 7) | byte;
    }

    return size + 10;
}

export type Mp3Measurement = {
    durationMs: number;
    frameCount: number;
};

/**
 * Measures MPEG audio by summing the duration of every frame it contains.
 *
 * Works for constant and variable bitrate streams because each frame is timed
 * from its own header rather than from a file-level average.
 *
 * @param bytes - Complete MPEG audio buffer
 * @returns Rounded duration and frame count, or `null` when no frame was found
 */
export function measureMp3(bytes: Uint8Array): Mp3Measurement | null {
    let offset = id3v2Length(bytes);
    let durationMs = 0;
    let frameCount = 0;

    while (offset < bytes.length) {
        const frame = readFrame(bytes, offset);
        if (frame) {
            durationMs += frame.durationMs;
            frameCount += 1;
            offset += frame.byteLength;
            continue;
        }
        offset += 1;
    }

    return frameCount === 0
        ? null
        : { durationMs: Math.round(durationMs), frameCount };
}

/**
 * Joins synthesized parts into one MPEG stream.
 *
 * Frames are self-contained, so concatenation produces a file every browser
 * plays back as a single track.
 *
 * @param parts - Audio buffers in playback order
 * @returns One buffer containing every part
 */
export function concatAudio(parts: readonly Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const joined = new Uint8Array(total);

    let offset = 0;
    for (const part of parts) {
        joined.set(part, offset);
        offset += part.byteLength;
    }

    return joined;
}
