/**
 * Durable object storage for generated Audio Overviews.
 *
 * Media is uploaded as an authenticated Cloudinary asset, so it is never
 * publicly listable and every reader reaches it through a signed URL minted
 * after an ownership check.
 */

import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";
import { logger } from "./logger.js";

const AUDIO_FOLDER = "chaibook/audio";
const RESOURCE_TYPE = "video";

/** How long a minted playback/download URL is advertised as usable. */
export const AUDIO_URL_TTL_SECONDS = 15 * 60;

const uploadResponseSchema = z.object({
    public_id: z.string().min(1),
    bytes: z.number().int().nonnegative(),
    /** Seconds. Absent if the provider could not probe the stored file. */
    duration: z.number().positive().optional(),
});

export type StoredAudioObject = {
    publicId: string;
    bytes: number;
    /**
     * Duration of the stored file as reported by the provider, which can differ
     * slightly from the uploaded buffer when the provider re-encodes it.
     */
    durationMs: number | null;
};

export type SignedAudioUrls = {
    playbackUrl: string;
    downloadUrl: string;
    expiresAt: Date;
};

type CloudinaryCredentials = {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
};

function credentials(): CloudinaryCredentials | null {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
        return null;
    }

    return { cloudName, apiKey, apiSecret };
}

function configure(): CloudinaryCredentials | null {
    const config = credentials();
    if (!config) {
        return null;
    }

    cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        secure: true,
    });

    return config;
}

/**
 * Whether this deployment can store generated audio.
 *
 * Signed uploads and signed delivery both need the API key/secret pair, so the
 * unsigned preset used for PDFs is not enough.
 */
export function isAudioStorageConfigured(): boolean {
    return credentials() !== null;
}

/**
 * Uploads an assembled audio file as an authenticated asset.
 *
 * @param audio - Complete MP3 buffer
 * @param objectId - Deterministic id (the output id) used as the asset name
 * @returns Storage coordinates persisted on the output
 * @throws {Error} When storage is not configured or the upload is rejected
 */
export async function storeAudioObject(
    audio: Uint8Array,
    objectId: string,
): Promise<StoredAudioObject> {
    if (!configure()) {
        throw new Error("Audio storage is not configured on the server");
    }

    const raw = await new Promise<unknown>((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
            {
                resource_type: RESOURCE_TYPE,
                type: "authenticated",
                folder: AUDIO_FOLDER,
                public_id: objectId,
                // A retry must replace the previous attempt, never fan out.
                overwrite: true,
                invalidate: true,
                format: "mp3",
            },
            (error, result) => {
                if (error) {
                    reject(new Error(error.message));
                    return;
                }
                resolve(result);
            },
        );

        upload.end(Buffer.from(audio));
    });

    const parsed = uploadResponseSchema.safeParse(raw);
    if (!parsed.success) {
        throw new Error("Audio storage returned an unusable upload response");
    }

    return {
        publicId: parsed.data.public_id,
        bytes: parsed.data.bytes,
        durationMs:
            parsed.data.duration === undefined
                ? null
                : Math.round(parsed.data.duration * 1_000),
    };
}

/**
 * Mints signed URLs for one stored audio object.
 *
 * The playback URL is a signed delivery URL so the browser can issue range
 * requests while scrubbing; the download URL is time-limited by the provider.
 * Callers should treat `expiresAt` as the refresh deadline for both.
 *
 * @param publicId - Storage id persisted on the output
 * @returns Signed playback and download URLs plus their refresh deadline
 * @throws {Error} When storage is not configured
 */
export function createSignedAudioUrls(publicId: string): SignedAudioUrls {
    if (!configure()) {
        throw new Error("Audio storage is not configured on the server");
    }

    const expiresAt = new Date(Date.now() + AUDIO_URL_TTL_SECONDS * 1_000);

    return {
        playbackUrl: cloudinary.url(publicId, {
            resource_type: RESOURCE_TYPE,
            type: "authenticated",
            format: "mp3",
            sign_url: true,
            secure: true,
        }),
        downloadUrl: cloudinary.utils.private_download_url(publicId, "mp3", {
            resource_type: RESOURCE_TYPE,
            type: "authenticated",
            expires_at: Math.floor(expiresAt.getTime() / 1_000),
            attachment: true,
        }),
        expiresAt,
    };
}

/**
 * Deletes a stored audio object.
 *
 * Deleting an object that is already gone is a no-op, which keeps the cleanup
 * job safe to retry.
 *
 * @param publicId - Storage id persisted on the output
 * @throws {Error} When storage is not configured or the provider call fails
 */
export async function deleteAudioObject(publicId: string): Promise<void> {
    if (!configure()) {
        throw new Error("Audio storage is not configured on the server");
    }

    await cloudinary.uploader.destroy(publicId, {
        resource_type: RESOURCE_TYPE,
        type: "authenticated",
        invalidate: true,
    });

    logger.info({ publicId }, "Deleted stored audio object");
}
