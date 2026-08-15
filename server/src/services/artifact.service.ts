import {
    OUTPUT_CONTENT_VERSION,
    OUTPUT_METADATA_VERSION,
    outputGenerationOptionsInputSchema,
    readOutputMetadata,
    type OutputFailureCode,
    type OutputGenerationOptions,
    type OutputMetadata,
    type OutputSourceSnapshot,
    type OutputType,
    type SourceSelectionMode,
} from "@homeworkcopy/contracts";
import { enqueueArtifactGeneration } from "../lib/artifact-events.js";
import { logger } from "../lib/logger.js";
import {
    cancelArtifactRecord,
    claimArtifactGeneration,
    createArtifactRecord,
    deleteArtifactRecord,
    finalizeArtifactGeneration,
    findArtifactById,
    findArtifactByIdAndWorkspaceId,
    findArtifactsByWorkspaceId,
    startArtifactAttempt,
    updateArtifactRecord,
    type ArtifactRecord,
} from "../repositories/artifact.repository.js";
import type { SourceRecord } from "../repositories/source.repository.js";
import { ConflictError, NotFoundError } from "../types/app-error.js";
import {
    describeOutputFailure,
    isRetriableOutputFailure,
} from "./output-failure.js";
import { toPrismaJson } from "../utils/prisma-json.js";
import { CHAT_MODEL } from "../lib/ai-config.js";
import {
    gatherSourceContext,
    generateOutputContent,
    OUTPUT_PROVIDER,
} from "./artifact-generation.service.js";
import { getWorkspaceByIdForUser } from "./workspace.service.js";
import {
    resolveReadySourceRecords,
    resolveReadySourcesForWorkspace,
} from "./source.service.js";
import type { CreateArtifactInput } from "../validators/artifact.validator.js";

/** Fallback titles used when the reader does not supply one. */
const DEFAULT_OUTPUT_TITLES: Record<OutputType, string> = {
    SUMMARY: "Summary",
    TAKEAWAYS: "Key Takeaways",
    FLASHCARDS: "Flashcards",
    QUIZ: "Quiz",
    MINDMAP: "Mind Map",
    REPORT: "Report",
    STUDY_GUIDE: "Study Guide",
    FAQ: "FAQ",
    TIMELINE: "Timeline",
    BRIEFING: "Briefing Document",
};

const DEFAULT_GENERATION_OPTIONS: OutputGenerationOptions = {
    version: 1,
    length: "standard",
    locale: "en",
};

function defaultTitle(type: OutputType): string {
    return `${DEFAULT_OUTPUT_TITLES[type]} · ${new Date().toLocaleDateString()}`;
}

function buildSourceSnapshot(
    sources: SourceRecord[],
    selectionMode: SourceSelectionMode,
): OutputSourceSnapshot {
    return {
        version: 1,
        capturedAt: new Date().toISOString(),
        selectionMode,
        sources: sources.map((source) => ({
            id: source.id,
            title: source.title,
            type: source.type,
            processingVersion: source.processingVersion,
        })),
    };
}

function resolveGenerationOptions(
    input: CreateArtifactInput["options"],
): OutputGenerationOptions {
    const parsed = outputGenerationOptionsInputSchema.parse(input ?? {});
    return {
        version: 1,
        length: parsed.length,
        locale: parsed.locale,
        ...(parsed.focus ? { focus: parsed.focus } : {}),
    };
}

/** Reads persisted metadata, falling back to an empty versioned envelope. */
function metadataOf(artifact: ArtifactRecord): OutputMetadata {
    return (
        readOutputMetadata(artifact.metadata) ?? {
            version: OUTPUT_METADATA_VERSION,
        }
    );
}

/**
 * Lists every Studio output in a notebook.
 *
 * @param workspaceId - Notebook to list outputs from
 * @param userId - Authenticated user's id
 * @returns Output records ordered newest first
 */
export async function listArtifactsForWorkspace(
    workspaceId: string,
    userId: string,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);
    return findArtifactsByWorkspaceId(workspaceId);
}

/**
 * Loads a single output after verifying notebook ownership.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Output to fetch
 * @param userId - Authenticated user's id
 * @returns Output record with content when its status is `READY`
 * @throws {NotFoundError} When the output does not exist in this notebook
 */
export async function getArtifactForWorkspace(
    workspaceId: string,
    artifactId: string,
    userId: string,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);

    const artifact = await findArtifactByIdAndWorkspaceId(
        artifactId,
        workspaceId,
    );

    if (!artifact) {
        throw new NotFoundError("Output not found");
    }

    return artifact;
}

/**
 * Creates a pending output from the caller's source selection and queues
 * background generation.
 *
 * The exact sources, generation options, and model are snapshotted on the row
 * so the output stays explainable and reproducible after the notebook changes.
 *
 * @param workspaceId - Notebook to attach the output to
 * @param userId - Authenticated user's id
 * @param input - Output type, optional title, generation options, and selection
 * @returns New output with status `PENDING`
 * @throws {SourceSelectionError} When the selection is unavailable or not ready
 */
export async function createArtifactForWorkspace(
    workspaceId: string,
    userId: string,
    input: CreateArtifactInput,
) {
    const sources = await resolveReadySourcesForWorkspace(
        workspaceId,
        userId,
        input,
    );
    const options = resolveGenerationOptions(input.options);
    const metadata: OutputMetadata = {
        version: OUTPUT_METADATA_VERSION,
        provider: OUTPUT_PROVIDER,
        model: CHAT_MODEL,
        options,
        sourceSnapshot: buildSourceSnapshot(sources, input.selectionMode),
    };

    const artifact = await createArtifactRecord({
        workspaceId,
        type: input.type,
        title: input.title ?? defaultTitle(input.type),
        sourceIds: sources.map((source) => source.id),
        status: "PENDING",
        attemptCount: 1,
        metadata: toPrismaJson(metadata),
    });

    await enqueueArtifactGeneration({
        artifactId: artifact.id,
        workspaceId,
        attempt: artifact.attemptCount,
    });

    return artifact;
}

/**
 * Renames an output without touching its generated content.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Output to rename
 * @param userId - Authenticated user's id
 * @param title - New title
 * @returns The updated output record
 */
export async function renameArtifactForWorkspace(
    workspaceId: string,
    artifactId: string,
    userId: string,
    title: string,
) {
    await getArtifactForWorkspace(workspaceId, artifactId, userId);
    return updateArtifactRecord(artifactId, { title });
}

/**
 * Requeues generation for an existing output using its original sources and
 * options. Any job still running for the previous attempt is invalidated.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Output to regenerate
 * @param userId - Authenticated user's id
 * @returns The output reset to `PENDING`
 * @throws {ConflictError} When generation is already in flight
 */
export async function regenerateArtifactForWorkspace(
    workspaceId: string,
    artifactId: string,
    userId: string,
) {
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        userId,
    );

    if (artifact.status === "PENDING" || artifact.status === "PROCESSING") {
        throw new ConflictError("This output is already being generated.");
    }

    const metadata = metadataOf(artifact);
    const requeued = await startArtifactAttempt(
        artifactId,
        toPrismaJson({
            ...metadata,
            failure: undefined,
        } satisfies OutputMetadata),
    );

    await enqueueArtifactGeneration({
        artifactId,
        workspaceId,
        attempt: requeued.attemptCount,
    });

    return requeued;
}

/**
 * Creates a new output that repeats an existing one's type, sources, and
 * options, then queues it for generation.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Output to duplicate
 * @param userId - Authenticated user's id
 * @returns The new pending output
 */
export async function duplicateArtifactForWorkspace(
    workspaceId: string,
    artifactId: string,
    userId: string,
) {
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        userId,
    );
    const source = metadataOf(artifact);
    const metadata: OutputMetadata = {
        version: OUTPUT_METADATA_VERSION,
        provider: OUTPUT_PROVIDER,
        model: CHAT_MODEL,
        options: source.options ?? DEFAULT_GENERATION_OPTIONS,
        ...(source.sourceSnapshot
            ? { sourceSnapshot: source.sourceSnapshot }
            : {}),
        duplicatedFromOutputId: artifact.id,
    };

    const duplicate = await createArtifactRecord({
        workspaceId,
        type: artifact.type,
        title: `Copy of ${artifact.title}`.slice(0, 120),
        sourceIds: artifact.sourceIds,
        status: "PENDING",
        attemptCount: 1,
        metadata: toPrismaJson(metadata),
    });

    await enqueueArtifactGeneration({
        artifactId: duplicate.id,
        workspaceId,
        attempt: duplicate.attemptCount,
    });

    return duplicate;
}

/**
 * Cancels an output that has not finished generating.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Output to cancel
 * @param userId - Authenticated user's id
 * @returns The cancelled output record
 * @throws {ConflictError} When the output already reached a final state
 */
export async function cancelArtifactForWorkspace(
    workspaceId: string,
    artifactId: string,
    userId: string,
) {
    await getArtifactForWorkspace(workspaceId, artifactId, userId);

    const cancelled = await cancelArtifactRecord(artifactId);
    if (cancelled === 0) {
        throw new ConflictError(
            "This output already finished generating and cannot be cancelled.",
        );
    }

    return getArtifactForWorkspace(workspaceId, artifactId, userId);
}

/**
 * Deletes an output from the notebook.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Output to delete
 * @param userId - Authenticated user's id
 * @returns Resolves when the row is deleted
 * @throws {NotFoundError} When the output is not found
 */
export async function deleteArtifactForWorkspace(
    workspaceId: string,
    artifactId: string,
    userId: string,
) {
    await getArtifactForWorkspace(workspaceId, artifactId, userId);
    await deleteArtifactRecord(artifactId);
}

export type ProcessArtifactResult =
    | { status: "READY" }
    | { status: "FAILED"; failureCode: OutputFailureCode }
    | { status: "SKIPPED"; reason: "stale-attempt" | "cancelled" };

/**
 * Runs the full output generation pipeline for one attempt (Inngest worker).
 *
 * ```
 * claim attempt → resolve snapshot sources → assemble context
 *   → generate + validate → READY (or FAILED with a stage/code)
 * ```
 *
 * The attempt number makes the job idempotent: cancelled or superseded work
 * never overwrites a newer result.
 *
 * @param artifactId - Output to generate content for
 * @param attempt - Attempt number carried by the job event
 * @returns What the worker did, so the job log stays readable
 * @throws When an unexpected provider error should be retried by Inngest
 */
export async function processArtifactById(
    artifactId: string,
    attempt: number,
): Promise<ProcessArtifactResult> {
    const artifact = await findArtifactById(artifactId);
    if (!artifact) {
        throw new NotFoundError("Output not found");
    }

    if (artifact.cancelledAt !== null) {
        return { status: "SKIPPED", reason: "cancelled" };
    }

    if (!(await claimArtifactGeneration(artifactId, attempt))) {
        return { status: "SKIPPED", reason: "stale-attempt" };
    }

    const metadata = metadataOf(artifact);
    const options = metadata.options ?? DEFAULT_GENERATION_OPTIONS;
    const startedAt = Date.now();
    let contextChars = 0;

    try {
        const sources = await resolveReadySourceRecords(artifact.workspaceId, {
            selectionMode: "custom",
            sourceIds: artifact.sourceIds,
        });
        const context = gatherSourceContext(sources);
        contextChars = context.contextChars;
        const { content, repairAttempts } = await generateOutputContent(
            artifact.type,
            context.text,
            options,
            context.sourceLabels,
        );

        const stored = await finalizeArtifactGeneration(artifactId, attempt, {
            status: "READY",
            content: toPrismaJson(content.data),
            contentVersion: OUTPUT_CONTENT_VERSION,
            metadata: toPrismaJson({
                ...metadata,
                provider: OUTPUT_PROVIDER,
                model: CHAT_MODEL,
                options,
                sourceLabels: context.sourceLabels,
                generatedAt: new Date().toISOString(),
                failure: undefined,
                metrics: {
                    contextChars: context.contextChars,
                    durationMs: Date.now() - startedAt,
                    attempts: attempt,
                    repairAttempts,
                },
            } satisfies OutputMetadata),
        });

        if (!stored) {
            return { status: "SKIPPED", reason: "cancelled" };
        }

        return { status: "READY" };
    } catch (caught) {
        const error =
            caught instanceof Error
                ? caught
                : new Error("Output generation failed unexpectedly.");
        const failure = describeOutputFailure(error);

        await finalizeArtifactGeneration(artifactId, attempt, {
            status: "FAILED",
            metadata: toPrismaJson({
                ...metadata,
                failure,
                metrics: {
                    contextChars,
                    durationMs: Date.now() - startedAt,
                    attempts: attempt,
                },
            } satisfies OutputMetadata),
        });

        logger.warn(
            {
                artifactId,
                attempt,
                failureCode: failure.code,
                failureStage: failure.stage,
            },
            "Studio output generation failed",
        );

        if (isRetriableOutputFailure(error)) {
            throw error;
        }

        return { status: "FAILED", failureCode: failure.code };
    }
}

export type { ArtifactRecord };
