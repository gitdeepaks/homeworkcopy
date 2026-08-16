import {
    AUDIO_OVERVIEW_CONTENT_VERSION,
    OUTPUT_CONTENT_VERSION,
    OUTPUT_METADATA_VERSION,
    outputGenerationOptionsInputSchema,
    parsePlayableAudioOverview,
    readOutputMetadata,
    type AudioOverviewOutputContent,
    type OutputAudioAccess,
    type OutputFailureCode,
    type OutputGenerationOptions,
    type OutputMetadata,
    type OutputSourceSnapshot,
    type OutputType,
    type SourceSelectionMode,
} from "@homeworkcopy/contracts";
import {
    enqueueArtifactGeneration,
    enqueueArtifactMediaCleanup,
} from "../lib/artifact-events.js";
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
    isArtifactAttemptCurrent,
    saveArtifactProgress,
    startArtifactAttempt,
    updateArtifactRecord,
    type ArtifactRecord,
} from "../repositories/artifact.repository.js";
import type { SourceRecord } from "../repositories/source.repository.js";
import {
    ConflictError,
    NotFoundError,
    OutputGenerationError,
} from "../types/app-error.js";
import {
    assertAudioOverviewAvailable,
    audioOptionsOf,
    buildAudioSummary,
    generateAudioScript,
    getTextToSpeechProvider,
    reusableScript,
    scriptFingerprint,
    signAudioUrls,
    storeAudioOverview,
    storedAudioPublicId,
    synthesizeScript,
} from "./audio-overview.service.js";
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
    AUDIO_OVERVIEW: "Audio Overview",
};

const DEFAULT_GENERATION_OPTIONS: OutputGenerationOptions = {
    version: 1,
    length: "standard",
    locale: "en",
};

/** Labelled source material assembled for one generation attempt. */
type SourceContext = ReturnType<typeof gatherSourceContext>;

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
    type: OutputType,
    input: CreateArtifactInput["options"],
): OutputGenerationOptions {
    const parsed = outputGenerationOptionsInputSchema.parse(input ?? {});
    const base: OutputGenerationOptions = {
        version: 1,
        length: parsed.length,
        locale: parsed.locale,
        ...(parsed.focus ? { focus: parsed.focus } : {}),
    };

    // Audio-only options are dropped for every other type so a snapshot never
    // records settings that had no effect on the result.
    return type === "AUDIO_OVERVIEW"
        ? { ...base, audio: audioOptionsOf({ ...base, audio: parsed.audio }) }
        : base;
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
 * @throws {OutputGenerationError} When audio is requested but not configured
 */
export async function createArtifactForWorkspace(
    workspaceId: string,
    userId: string,
    input: CreateArtifactInput,
) {
    if (input.type === "AUDIO_OVERVIEW") {
        assertAudioOverviewAvailable();
    }

    const sources = await resolveReadySourcesForWorkspace(
        workspaceId,
        userId,
        input,
    );
    const options = resolveGenerationOptions(input.type, input.options);
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

    if (artifact.type === "AUDIO_OVERVIEW") {
        assertAudioOverviewAvailable();
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
    if (artifact.type === "AUDIO_OVERVIEW") {
        assertAudioOverviewAvailable();
    }

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
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        userId,
    );
    const publicId = storedAudioPublicId(artifact.content);

    if (publicId) {
        // Queued before the row is removed so a failed enqueue leaves the
        // output intact and retryable, rather than orphaning a billable object
        // with nothing left pointing at it. The job itself is idempotent.
        await enqueueArtifactMediaCleanup({ workspaceId, publicId });
    }

    await deleteArtifactRecord(artifactId);
}

/**
 * Mints short-lived signed URLs for an Audio Overview's stored media.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Audio Overview to play
 * @param userId - Authenticated user's id
 * @returns Signed playback and download URLs with their expiry
 * @throws {NotFoundError} When the output is not a playable Audio Overview
 */
export async function getArtifactAudioForWorkspace(
    workspaceId: string,
    artifactId: string,
    userId: string,
): Promise<OutputAudioAccess> {
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        userId,
    );

    if (artifact.type !== "AUDIO_OVERVIEW") {
        throw new NotFoundError("This output has no audio");
    }

    const content = parsePlayableAudioOverview(artifact.content);
    if (!content) {
        throw new NotFoundError("This Audio Overview has no audio yet");
    }

    const urls = signAudioUrls(content.media.storage.publicId);

    return {
        version: 1,
        playbackUrl: urls.playbackUrl,
        downloadUrl: urls.downloadUrl,
        expiresAt: urls.expiresAt.toISOString(),
        format: content.media.format,
        bytes: content.media.bytes,
        durationMs: content.media.durationMs,
    };
}

export type ProcessArtifactResult =
    | { status: "READY" }
    | { status: "FAILED"; failureCode: OutputFailureCode }
    | { status: "SKIPPED"; reason: "stale-attempt" | "cancelled" };

/**
 * Runs the Audio Overview pipeline for one attempt.
 *
 * ```
 * SCRIPTING (reused when the fingerprint still matches)
 *   → SYNTHESIS → ASSEMBLY → durable storage → READY
 * ```
 *
 * Stored media is keyed by the output id and overwritten, so a regeneration
 * replaces the previous file instead of leaking a new one.
 *
 * @param artifact - Output being generated, as claimed by this attempt
 * @param attempt - Attempt number carried by the job event
 * @param options - Persisted generation options
 * @param metadata - Metadata to extend and persist
 * @param sources - Resolved READY sources, used to fingerprint the script
 * @param context - Labelled source material for this attempt
 * @param startedAt - Epoch millis the attempt began, for metrics
 * @returns What the worker did
 * @throws {OutputGenerationError} When a stage fails
 */
async function runAudioOverviewPipeline(
    artifact: ArtifactRecord,
    attempt: number,
    options: OutputGenerationOptions,
    metadata: OutputMetadata,
    sources: SourceRecord[],
    context: SourceContext,
    startedAt: number,
): Promise<ProcessArtifactResult> {
    assertAudioOverviewAvailable();

    const provider = getTextToSpeechProvider();
    if (!provider) {
        throw new OutputGenerationError(
            "SYNTHESIS",
            "AUDIO_UNAVAILABLE",
            "No speech provider is configured on this deployment.",
        );
    }

    const fingerprint = scriptFingerprint(
        sources.map((source) => ({
            sourceId: source.id,
            processingVersion: source.processingVersion,
        })),
        options,
    );

    const reused = reusableScript(
        artifact.content,
        metadata.audio?.scriptFingerprint,
        fingerprint,
    );
    let repairAttempts = 0;
    let script = reused;

    if (!script) {
        const generated = await generateAudioScript(
            context.text,
            options,
            context.sourceLabels,
        );
        script = generated.script;
        repairAttempts = generated.repairAttempts;

        const scripted: AudioOverviewOutputContent = {
            version: AUDIO_OVERVIEW_CONTENT_VERSION,
            script,
        };
        const stored = await saveArtifactProgress(artifact.id, attempt, {
            stage: "SYNTHESIS",
            content: toPrismaJson(scripted),
            contentVersion: AUDIO_OVERVIEW_CONTENT_VERSION,
            metadata: toPrismaJson({
                ...metadata,
                sourceLabels: context.sourceLabels,
                audio: buildAudioSummary(scripted, options, fingerprint),
            } satisfies OutputMetadata),
        });

        if (!stored) {
            return { status: "SKIPPED", reason: "cancelled" };
        }
    } else {
        await saveArtifactProgress(artifact.id, attempt, {
            stage: "SYNTHESIS",
        });
    }

    const synthesis = await synthesizeScript(script, options, provider, () =>
        isArtifactAttemptCurrent(artifact.id, attempt),
    );

    if (!synthesis) {
        return { status: "SKIPPED", reason: "cancelled" };
    }

    if (!(await saveArtifactProgress(artifact.id, attempt, { stage: "ASSEMBLY" }))) {
        return { status: "SKIPPED", reason: "cancelled" };
    }

    const content = await storeAudioOverview(
        artifact.id,
        script,
        synthesis,
        options,
    );

    const finalized = await finalizeArtifactGeneration(artifact.id, attempt, {
        status: "READY",
        stage: "READY",
        content: toPrismaJson(content),
        contentVersion: AUDIO_OVERVIEW_CONTENT_VERSION,
        metadata: toPrismaJson({
            ...metadata,
            provider: OUTPUT_PROVIDER,
            model: CHAT_MODEL,
            options,
            sourceLabels: context.sourceLabels,
            audio: buildAudioSummary(content, options, fingerprint),
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

    if (!finalized) {
        // The reader cancelled while the file was uploading. Retire the object
        // rather than leaving it billable and unreachable.
        await enqueueArtifactMediaCleanup({
            workspaceId: artifact.workspaceId,
            publicId: content.media.storage.publicId,
        });
        return { status: "SKIPPED", reason: "cancelled" };
    }

    return { status: "READY" };
}

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

    const isAudio = artifact.type === "AUDIO_OVERVIEW";

    if (
        !(await claimArtifactGeneration(
            artifactId,
            attempt,
            isAudio ? "SCRIPTING" : "GENERATING",
        ))
    ) {
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

        if (isAudio) {
            return await runAudioOverviewPipeline(
                artifact,
                attempt,
                options,
                metadata,
                sources,
                context,
                startedAt,
            );
        }

        const { content, repairAttempts } = await generateOutputContent(
            artifact.type,
            context.text,
            options,
            context.sourceLabels,
        );

        const stored = await finalizeArtifactGeneration(artifactId, attempt, {
            status: "READY",
            stage: "READY",
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
            stage: "FAILED",
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
