/**
 * Finding the bytes a database row is responsible for.
 *
 * Deleting a row that pointed at a stored object leaves the object behind:
 * unreachable, undeletable, and still on the invoice. Worse, for a deletion
 * request it means the data is not actually gone. So every path that destroys a
 * notebook or an account walks this first.
 *
 * Objects are found from the rows themselves, never by listing a storage
 * folder. The rows are the record of what this product created; a folder listing
 * would also sweep up whatever else happens to share the prefix.
 */

import { z } from "zod";
import type { JsonReadValue } from "@homeworkcopy/contracts";
import { deleteCloudinaryObject } from "../lib/cloudinary.js";
import { deleteExportObject } from "../lib/export-storage.js";
import prisma from "../lib/db.js";
import { logger } from "../lib/logger.js";

/** Where one stored object lives, and how it has to be addressed to delete it. */
export type StoredObject = {
    publicId: string;
    resourceType: "raw" | "image" | "video";
    /**
     * Authenticated assets are not reachable under the default `upload`
     * delivery type, so passing the wrong one silently leaves a billable object
     * behind rather than failing loudly.
     */
    deliveryType: "upload" | "authenticated";
    /** Which storage helper owns it, since exports sign their URLs differently. */
    kind: "media" | "export";
};

/** Storage coordinates as written onto a source's metadata. */
const sourceStorageSchema = z.object({
    publicId: z.string().min(1),
    resourceType: z.enum(["raw", "image", "video"]).optional(),
});

/** Storage coordinates as written into an output's generated content. */
const mediaContentSchema = z.object({
    media: z.object({
        storage: z.object({
            publicId: z.string().min(1),
            resourceType: z.literal("video"),
        }),
    }),
});

/**
 * Turns a source's metadata into a stored object, when it has one.
 *
 * @param metadata - The source's `metadata` column
 * @returns The object to destroy, or `null` when the source stores no bytes
 */
function sourceObject(metadata: JsonReadValue): StoredObject | null {
    const parsed = sourceStorageSchema.safeParse(metadata);
    if (!parsed.success) return null;

    const resourceType = parsed.data.resourceType ?? "raw";
    return {
        publicId: parsed.data.publicId,
        resourceType,
        deliveryType: resourceType === "video" ? "authenticated" : "upload",
        kind: "media",
    };
}

/**
 * Turns an output's content into a stored object, when it has one.
 *
 * @param content - The output's `content` column
 * @returns The object to destroy, or `null` when the output has no media
 */
function outputObject(content: JsonReadValue): StoredObject | null {
    const parsed = mediaContentSchema.safeParse(content);
    if (!parsed.success) return null;

    return {
        publicId: parsed.data.media.storage.publicId,
        resourceType: "video",
        deliveryType: "authenticated",
        kind: "media",
    };
}

/**
 * Every stored object a notebook is responsible for.
 *
 * @param workspaceId - Notebook being destroyed
 * @returns Storage coordinates for each object
 */
export async function collectWorkspaceStoredObjects(
    workspaceId: string,
): Promise<readonly StoredObject[]> {
    const [sources, artifacts] = await Promise.all([
        prisma.source.findMany({
            where: { workspaceId },
            select: { metadata: true },
        }),
        prisma.learningArtifact.findMany({
            where: { workspaceId },
            select: { content: true },
        }),
    ]);

    return [
        ...sources.flatMap((source) => {
            const object = sourceObject(source.metadata);
            return object === null ? [] : [object];
        }),
        ...artifacts.flatMap((artifact) => {
            const object = outputObject(artifact.content);
            return object === null ? [] : [object];
        }),
    ];
}

/**
 * Every stored object an account is responsible for.
 *
 * Covers notebooks the account owns plus its own export archives. Notebooks
 * shared *with* the account are somebody else's responsibility and are
 * deliberately not touched.
 *
 * @param userId - Account being destroyed
 * @returns Storage coordinates for each object
 */
export async function collectAccountStoredObjects(
    userId: string,
): Promise<readonly StoredObject[]> {
    const [sources, artifacts, archives] = await Promise.all([
        prisma.source.findMany({
            where: { workspace: { userId } },
            select: { metadata: true },
        }),
        prisma.learningArtifact.findMany({
            where: { workspace: { userId } },
            select: { content: true },
        }),
        prisma.dataExport.findMany({
            where: { userId, storagePublicId: { not: null } },
            select: { storagePublicId: true },
        }),
    ]);

    return [
        ...sources.flatMap((source) => {
            const object = sourceObject(source.metadata);
            return object === null ? [] : [object];
        }),
        ...artifacts.flatMap((artifact) => {
            const object = outputObject(artifact.content);
            return object === null ? [] : [object];
        }),
        ...archives.flatMap((archive) =>
            archive.storagePublicId === null
                ? []
                : [
                      {
                          publicId: archive.storagePublicId,
                          resourceType: "raw",
                          deliveryType: "authenticated",
                          kind: "export",
                      } satisfies StoredObject,
                  ],
        ),
    ];
}

/**
 * Destroys one stored object.
 *
 * @param object - Storage coordinates
 */
async function destroyStoredObject(object: StoredObject): Promise<void> {
    if (object.kind === "export") {
        await deleteExportObject(object.publicId);
        return;
    }
    await deleteCloudinaryObject(
        object.publicId,
        object.resourceType,
        object.deliveryType,
    );
}

/** How a batch destruction went. */
export type StoredObjectDestruction = {
    destroyed: number;
    failed: number;
};

/**
 * Destroys a batch of objects, reporting rather than throwing.
 *
 * One object that refuses to go must not stop the rest — the failure is counted
 * so the caller decides whether that means "incomplete" or "log it and carry
 * on". Destroying an object that is already gone is a no-op in every provider
 * used here, so retrying a partial batch is safe.
 *
 * @param objects - Objects to destroy
 * @returns Counts of what went and what did not
 */
export async function destroyStoredObjects(
    objects: readonly StoredObject[],
): Promise<StoredObjectDestruction> {
    let destroyed = 0;
    let failed = 0;

    for (const object of objects) {
        try {
            await destroyStoredObject(object);
            destroyed += 1;
        } catch (error) {
            failed += 1;
            logger.error(
                { error, publicId: object.publicId, kind: object.kind },
                "stored object delete failed",
            );
        }
    }

    return { destroyed, failed };
}
