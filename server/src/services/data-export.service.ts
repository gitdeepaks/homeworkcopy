/**
 * "Give me everything you hold about me", answered as a file.
 *
 * The interesting decisions here are about what an export is *not*:
 *
 * - **Not synchronous.** An account with a hundred notebooks is minutes of
 *   database work. Building it inside a request means a gateway timeout and a
 *   reader who cannot tell whether it worked, so it runs as a job and the page
 *   polls.
 * - **Not a public link.** The archive is the densest concentration of one
 *   person's data the product ever writes. It is stored as an authenticated
 *   object and reached only through a signature minted per download, after the
 *   ownership check.
 * - **Not permanent.** It expires in a week and the bytes are deleted, because
 *   an export that lives forever is a second copy of everything to defend.
 * - **Not other people's data.** A notebook export carries the notebook's
 *   content, not its members' names and addresses. Exercising your own access
 *   right is not a lookup tool for your collaborators.
 */

import { z } from "zod";
import {
    EXPORT_EXCLUSIONS,
    EXPORT_FORMAT_VERSION,
    EXPORT_MAX_BYTES,
    EXPORT_TTL_DAYS,
    exportManifestSchema,
    type DataExport,
    type ExportFailureCode,
    type ExportManifest,
    type ExportScope,
} from "@homeworkcopy/contracts";
import prisma from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { privacyOperations } from "../lib/metrics.js";
import {
    createSignedExportUrl,
    isExportStorageConfigured,
    storeExportObject,
} from "../lib/export-storage.js";
import {
    claimDataExport,
    completeDataExport,
    countDataExportsSince,
    createDataExportRecord,
    failDataExport,
    findDataExportByIdAndUserId,
    findDataExportsByUserId,
    type DataExportRecord,
} from "../repositories/data-export.repository.js";
import { toPrismaJson } from "../utils/prisma-json.js";
import { ConflictError, NotFoundError, ValidationError } from "../types/app-error.js";
import { authorizeNotebook } from "./notebook-access.service.js";

/** How many exports one account may request per day. */
const DAILY_EXPORT_LIMIT = 3;

/** How many export rows the settings page lists. */
export const EXPORT_HISTORY_LIMIT = 10;

/**
 * A guard against building an archive one row at a time until the process runs
 * out of memory. Well above any real notebook; a reader who trips it is told to
 * export notebook by notebook rather than being handed a crash.
 */
const MAX_ROWS_PER_COLLECTION = 50_000;

/**
 * The archive's own shape, validated before a single byte is uploaded.
 *
 * A schema rather than a type, because this is the one artifact that leaves the
 * system and outlives the build that wrote it: an archive that does not parse is
 * a bug we would otherwise discover from a support ticket a month later.
 */
const archiveSchema = z.object({
    manifest: exportManifestSchema,
    account: z.object({
        id: z.string(),
        name: z.string(),
        email: z.email(),
        createdAt: z.iso.datetime(),
    }),
    notebooks: z.array(
        z.object({
            id: z.string(),
            title: z.string(),
            description: z.string().nullable(),
            icon: z.string().nullable(),
            createdAt: z.iso.datetime(),
            updatedAt: z.iso.datetime(),
            sources: z.array(
                z.object({
                    id: z.string(),
                    type: z.string(),
                    title: z.string(),
                    url: z.string().nullable(),
                    status: z.string(),
                    content: z.string().nullable(),
                    metadata: z.json().nullable(),
                    createdAt: z.iso.datetime(),
                }),
            ),
            conversations: z.array(
                z.object({
                    id: z.string(),
                    title: z.string().nullable(),
                    createdAt: z.iso.datetime(),
                    messages: z.array(
                        z.object({
                            id: z.string(),
                            role: z.string(),
                            content: z.string(),
                            citations: z.json().nullable(),
                            createdAt: z.iso.datetime(),
                        }),
                    ),
                }),
            ),
            outputs: z.array(
                z.object({
                    id: z.string(),
                    type: z.string(),
                    title: z.string(),
                    status: z.string(),
                    content: z.json().nullable(),
                    sourceIds: z.array(z.string()),
                    createdAt: z.iso.datetime(),
                }),
            ),
            notes: z.array(
                z.object({
                    id: z.string(),
                    title: z.string(),
                    content: z.string(),
                    origin: z.string(),
                    citations: z.json().nullable(),
                    createdAt: z.iso.datetime(),
                }),
            ),
        }),
    ),
});

/** The archive as written to storage. */
export type ExportArchive = z.infer<typeof archiveSchema>;

/**
 * Reads an export row's persisted scope back into its contract shape.
 *
 * @param record - Stored export row
 * @returns What the export covers
 */
function toScope(record: DataExportRecord): ExportScope {
    if (record.scope === "NOTEBOOK" && record.workspaceId !== null) {
        return { kind: "notebook", workspaceId: record.workspaceId };
    }
    return { kind: "account" };
}

/**
 * Shapes an export row for the API, minting a download URL only when there is
 * something to download.
 *
 * @param record - Stored export row
 * @returns The export in its contract shape
 */
export function toDataExport(record: DataExportRecord): DataExport {
    const manifest = exportManifestSchema.safeParse(record.manifest);
    const canDownload = record.status === "READY" && record.storagePublicId !== null;
    const signed =
        canDownload && record.storagePublicId !== null && isExportStorageConfigured()
            ? createSignedExportUrl(record.storagePublicId)
            : null;

    const failureCode = exportFailureCode(record.failureCode);

    return {
        id: record.id,
        scope: toScope(record),
        status: record.status,
        failureCode,
        manifest: manifest.success ? manifest.data : null,
        downloadUrl: signed === null ? null : signed.url,
        expiresAt: record.expiresAt === null ? null : record.expiresAt.toISOString(),
        requestedAt: record.createdAt.toISOString(),
        completedAt:
            record.completedAt === null ? null : record.completedAt.toISOString(),
    };
}

/**
 * Narrows a stored failure string to a known code.
 *
 * A code written by an older build that this one no longer recognises reads as
 * the generic failure rather than being passed through unvalidated to a client
 * that would not know what to render for it.
 *
 * @param value - The stored `failureCode` column
 * @returns A known failure code, or `null` when there was no failure
 */
function exportFailureCode(value: string | null): ExportFailureCode | null {
    if (value === null) return null;
    const parsed = z
        .enum(["EXPORT_TOO_LARGE", "STORAGE_UNAVAILABLE", "EXPORT_FAILED"])
        .safeParse(value);
    return parsed.success ? parsed.data : "EXPORT_FAILED";
}

/**
 * Accepts an export request.
 *
 * Notebook exports are authorized through the same permission the notebook's
 * own reads use, so a viewer can export what they can already read and a
 * stranger gets the same 404 they get everywhere else.
 *
 * @param userId - Requesting user's id
 * @param scope - What the export should cover
 * @returns The queued export
 * @throws {ValidationError} When export storage is not configured
 * @throws {ConflictError} When the daily request limit is reached
 */
export async function requestDataExport(
    userId: string,
    scope: ExportScope,
): Promise<DataExport> {
    if (!isExportStorageConfigured()) {
        throw new ValidationError(
            "Exports are not available on this deployment. Contact the administrator.",
        );
    }

    if (scope.kind === "notebook") {
        await authorizeNotebook(scope.workspaceId, userId, "notebook:export");
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await countDataExportsSince(userId, since);
    if (recent >= DAILY_EXPORT_LIMIT) {
        throw new ConflictError(
            `You can request ${DAILY_EXPORT_LIMIT} exports a day. Try again tomorrow.`,
        );
    }

    const record = await createDataExportRecord({
        userId,
        scope: scope.kind === "account" ? "ACCOUNT" : "NOTEBOOK",
        workspaceId: scope.kind === "notebook" ? scope.workspaceId : null,
    });

    privacyOperations.inc({ operation: "export", outcome: "requested" });
    return toDataExport(record);
}

/**
 * Reads one of a user's exports.
 *
 * @param userId - Owner of the export
 * @param exportId - Export to read
 * @returns The export, with a freshly minted download URL when it is ready
 * @throws {NotFoundError} When it does not exist or belongs to someone else
 */
export async function getDataExport(
    userId: string,
    exportId: string,
): Promise<DataExport> {
    const record = await findDataExportByIdAndUserId(exportId, userId);
    if (record === null) throw new NotFoundError("Export not found");
    return toDataExport(record);
}

/**
 * Lists a user's recent exports.
 *
 * @param userId - Owner of the exports
 * @returns Exports, newest first
 */
export async function listDataExports(userId: string): Promise<DataExport[]> {
    const records = await findDataExportsByUserId(userId, EXPORT_HISTORY_LIMIT);
    return records.map(toDataExport);
}

/**
 * Which notebooks an export covers.
 *
 * Account exports carry only notebooks the reader owns. A notebook someone
 * shared with them is that person's data, held under their deletion request and
 * their control, and copying it into a second account's archive would put it
 * beyond their reach.
 *
 * @param record - The export being built
 * @returns Ids of the notebooks to include
 */
async function notebookIdsForExport(
    record: DataExportRecord,
): Promise<readonly string[]> {
    if (record.scope === "NOTEBOOK") {
        return record.workspaceId === null ? [] : [record.workspaceId];
    }

    const owned = await prisma.workspace.findMany({
        where: { userId: record.userId },
        select: { id: true },
        take: MAX_ROWS_PER_COLLECTION,
    });
    return owned.map((workspace) => workspace.id);
}

/**
 * Builds the archive contents.
 *
 * @param record - The export being built
 * @returns The archive, validated against {@link archiveSchema}
 * @throws {NotFoundError} When the requesting account no longer exists
 */
async function buildArchive(record: DataExportRecord): Promise<ExportArchive> {
    const account = await prisma.user.findUnique({
        where: { id: record.userId },
        select: { id: true, name: true, email: true, createdAt: true },
    });
    if (account === null) throw new NotFoundError("Account not found");

    const notebookIds = await notebookIdsForExport(record);

    const workspaces = await prisma.workspace.findMany({
        where: { id: { in: [...notebookIds] } },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            title: true,
            description: true,
            icon: true,
            createdAt: true,
            updatedAt: true,
            sources: {
                orderBy: { createdAt: "asc" },
                take: MAX_ROWS_PER_COLLECTION,
                select: {
                    id: true,
                    type: true,
                    title: true,
                    url: true,
                    status: true,
                    content: true,
                    metadata: true,
                    createdAt: true,
                },
            },
            conversations: {
                orderBy: { createdAt: "asc" },
                take: MAX_ROWS_PER_COLLECTION,
                select: {
                    id: true,
                    title: true,
                    createdAt: true,
                    messages: {
                        orderBy: { createdAt: "asc" },
                        take: MAX_ROWS_PER_COLLECTION,
                        select: {
                            id: true,
                            role: true,
                            content: true,
                            citations: true,
                            createdAt: true,
                        },
                    },
                },
            },
            artifacts: {
                orderBy: { createdAt: "asc" },
                take: MAX_ROWS_PER_COLLECTION,
                select: {
                    id: true,
                    type: true,
                    title: true,
                    status: true,
                    content: true,
                    sourceIds: true,
                    createdAt: true,
                },
            },
            notes: {
                orderBy: { createdAt: "asc" },
                take: MAX_ROWS_PER_COLLECTION,
                select: {
                    id: true,
                    title: true,
                    content: true,
                    origin: true,
                    citations: true,
                    createdAt: true,
                },
            },
        },
    });

    const notebooks = workspaces.map((workspace) => ({
        id: workspace.id,
        title: workspace.title,
        description: workspace.description,
        icon: workspace.icon,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString(),
        sources: workspace.sources.map((source) => ({
            id: source.id,
            type: source.type,
            title: source.title,
            url: source.url,
            status: source.status,
            content: source.content,
            metadata: source.metadata,
            createdAt: source.createdAt.toISOString(),
        })),
        conversations: workspace.conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.createdAt.toISOString(),
            messages: conversation.messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                citations: message.citations,
                createdAt: message.createdAt.toISOString(),
            })),
        })),
        outputs: workspace.artifacts.map((artifact) => ({
            id: artifact.id,
            type: artifact.type,
            title: artifact.title,
            status: artifact.status,
            content: artifact.content,
            sourceIds: artifact.sourceIds,
            createdAt: artifact.createdAt.toISOString(),
        })),
        notes: workspace.notes.map((note) => ({
            id: note.id,
            title: note.title,
            content: note.content,
            origin: note.origin,
            citations: note.citations,
            createdAt: note.createdAt.toISOString(),
        })),
    }));

    const manifest: ExportManifest = exportManifestSchema.parse({
        formatVersion: EXPORT_FORMAT_VERSION,
        generatedAt: new Date().toISOString(),
        scope: toScope(record),
        counts: {
            notebooks: notebooks.length,
            sources: notebooks.reduce(
                (total, notebook) => total + notebook.sources.length,
                0,
            ),
            conversations: notebooks.reduce(
                (total, notebook) => total + notebook.conversations.length,
                0,
            ),
            messages: notebooks.reduce(
                (total, notebook) =>
                    total +
                    notebook.conversations.reduce(
                        (inner, conversation) => inner + conversation.messages.length,
                        0,
                    ),
                0,
            ),
            outputs: notebooks.reduce(
                (total, notebook) => total + notebook.outputs.length,
                0,
            ),
            notes: notebooks.reduce(
                (total, notebook) => total + notebook.notes.length,
                0,
            ),
        },
        excluded: [...EXPORT_EXCLUSIONS],
        // Replaced once the archive is serialized and its real size is known.
        bytes: 0,
    });

    return archiveSchema.parse({
        manifest,
        account: {
            id: account.id,
            name: account.name,
            email: account.email,
            createdAt: account.createdAt.toISOString(),
        },
        notebooks,
    });
}

/**
 * Builds, stores, and finalizes one export.
 *
 * Called by the job runner. Claiming with a status guard makes a duplicate
 * delivery a no-op rather than a second archive, and every failure is recorded
 * as a code on the row so the reader is told what went wrong instead of watching
 * a spinner forever.
 *
 * @param exportId - Export to build
 * @returns What happened, for the job's return value
 */
export async function processDataExport(
    exportId: string,
): Promise<{ exportId: string; status: string }> {
    const record = await claimDataExport(exportId);
    if (record === null) {
        // Another attempt already has it, or it was already finished.
        return { exportId, status: "SKIPPED" };
    }

    try {
        if (!isExportStorageConfigured()) {
            await failDataExport(exportId, "STORAGE_UNAVAILABLE");
            privacyOperations.inc({ operation: "export", outcome: "failure" });
            return { exportId, status: "FAILED" };
        }

        const archive = await buildArchive(record);
        const serialized = Buffer.from(JSON.stringify(archive, null, 2), "utf8");

        if (serialized.byteLength > EXPORT_MAX_BYTES) {
            await failDataExport(exportId, "EXPORT_TOO_LARGE");
            privacyOperations.inc({ operation: "export", outcome: "failure" });
            return { exportId, status: "FAILED" };
        }

        const stored = await storeExportObject(serialized, exportId);
        const manifest: ExportManifest = {
            ...archive.manifest,
            bytes: stored.bytes,
        };

        await completeDataExport({
            exportId,
            manifest: toPrismaJson(manifest),
            storagePublicId: stored.publicId,
            bytes: stored.bytes,
            expiresAt: new Date(
                Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000,
            ),
        });

        privacyOperations.inc({ operation: "export", outcome: "success" });
        logger.info(
            { exportId, bytes: stored.bytes, counts: manifest.counts },
            "data export completed",
        );
        return { exportId, status: "READY" };
    } catch (error) {
        logger.error({ error, exportId }, "data export failed");
        await failDataExport(exportId, "EXPORT_FAILED");
        privacyOperations.inc({ operation: "export", outcome: "failure" });
        throw error;
    }
}
