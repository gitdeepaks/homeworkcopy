/**
 * Where an export archive lives between being built and being downloaded.
 *
 * Stored as an authenticated asset, exactly like generated audio: an archive is
 * the single densest concentration of one person's data the product ever
 * produces, so it is never publicly addressable and every download goes through
 * a short-lived signature minted after an ownership check.
 */

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { z } from "zod";
import { EXPORT_URL_TTL_SECONDS } from "@homeworkcopy/contracts";

const EXPORT_FOLDER = "chaibook/exports";
/** Archives are JSON, which Cloudinary treats as an opaque `raw` asset. */
const RESOURCE_TYPE = "raw";

const uploadResponseSchema = z.object({
    public_id: z.string().min(1),
    bytes: z.number().int().nonnegative(),
});

export type StoredExportObject = {
    publicId: string;
    bytes: number;
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

    if (!cloudName || !apiKey || !apiSecret) return null;

    return { cloudName, apiKey, apiSecret };
}

function configure(): CloudinaryCredentials | null {
    const config = credentials();
    if (!config) return null;

    cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        secure: true,
    });

    return config;
}

/**
 * Whether this deployment can store an export archive.
 *
 * Signed upload and signed delivery both need the API key/secret pair, so the
 * unsigned preset used for PDF uploads is not enough.
 */
export function isExportStorageConfigured(): boolean {
    return credentials() !== null;
}

/**
 * Uploads a built archive.
 *
 * @param archive - The complete archive bytes
 * @param objectId - Deterministic id (the export id) used as the asset name
 * @returns Storage id and stored size
 * @throws {Error} When storage is not configured or the upload is rejected
 */
export async function storeExportObject(
    archive: Uint8Array,
    objectId: string,
): Promise<StoredExportObject> {
    if (!configure()) {
        throw new Error("Export storage is not configured on the server");
    }

    const raw = await new Promise<UploadApiResponse | undefined>(
        (resolve, reject) => {
            const upload = cloudinary.uploader.upload_stream(
                {
                    resource_type: RESOURCE_TYPE,
                    type: "authenticated",
                    folder: EXPORT_FOLDER,
                    public_id: objectId,
                    // A retried export replaces the previous attempt rather than
                    // leaving a second copy of someone's data lying around.
                    overwrite: true,
                    invalidate: true,
                    format: "json",
                },
                (error, result) => {
                    if (error) {
                        reject(new Error(error.message));
                        return;
                    }
                    resolve(result);
                },
            );

            upload.end(Buffer.from(archive));
        },
    );

    const parsed = uploadResponseSchema.safeParse(raw);
    if (!parsed.success) {
        throw new Error("Export storage returned an unusable upload response");
    }

    return { publicId: parsed.data.public_id, bytes: parsed.data.bytes };
}

/** A minted download URL and the moment it stops working. */
export type SignedExportUrl = {
    url: string;
    expiresAt: Date;
};

/**
 * Mints a time-limited download URL.
 *
 * Minted per request and never persisted, so a signature cannot outlive the
 * authorization that produced it.
 *
 * @param publicId - Storage id persisted on the export row
 * @returns The signed URL and its expiry
 * @throws {Error} When storage is not configured
 */
export function createSignedExportUrl(publicId: string): SignedExportUrl {
    if (!configure()) {
        throw new Error("Export storage is not configured on the server");
    }

    const expiresAt = new Date(Date.now() + EXPORT_URL_TTL_SECONDS * 1_000);

    return {
        url: cloudinary.utils.private_download_url(publicId, "json", {
            resource_type: RESOURCE_TYPE,
            type: "authenticated",
            expires_at: Math.floor(expiresAt.getTime() / 1_000),
            attachment: true,
        }),
        expiresAt,
    };
}

/**
 * Deletes a stored archive.
 *
 * Deleting an object that is already gone is a no-op, which keeps the retention
 * job safe to retry.
 *
 * @param publicId - Storage id persisted on the export row
 * @throws {Error} When storage is not configured or the provider call fails
 */
export async function deleteExportObject(publicId: string): Promise<void> {
    if (!configure()) {
        throw new Error("Export storage is not configured on the server");
    }

    await cloudinary.uploader.destroy(publicId, {
        resource_type: RESOURCE_TYPE,
        type: "authenticated",
        invalidate: true,
    });
}
