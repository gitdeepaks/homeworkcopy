import {
    AUDIO_OVERVIEW_CONTENT_VERSION,
    DATA_TABLE_CONTENT_VERSION,
    isEditableOutputType,
    OUTPUT_CONTENT_VERSION,
    OUTPUT_METADATA_VERSION,
    outputGenerationOptionsInputSchema,
    parsePlayableAudioOverview,
    parsePlayableVideoExplainer,
    readOutputMetadata,
    SLIDES_CONTENT_VERSION,
    VIDEO_EXPLAINER_CONTENT_VERSION,
    type AudioMedia,
    type AudioOverviewOutputContent,
    type EditOutputContentRequest,
    type OutputAudioAccess,
    type OutputFailureCode,
    type OutputGenerationOptions,
    type OutputMetadata,
    type OutputSourceSnapshot,
    type OutputType,
    type SourceSelectionMode,
    type VideoExplainerOutputContent,
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
    OutputNotEditableError,
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
    assertVideoExplainerAvailable,
    buildVideoSummary,
    generateVideoStoryboard,
    reusableStoryboard,
    storedVideoPublicId,
    storeVideoExplainer,
    storyboardFingerprint,
    synthesizeStoryboard,
} from "./video-explainer.service.js";
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
import { recordAuditEvent } from "./audit.service.js";
import {
    authorizeNotebook,
    type Actor,
} from "./notebook-access.service.js";
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
    VIDEO_EXPLAINER: "Video Explainer",
    SLIDES: "Slide Deck",
    DATA_TABLE: "Data Tables",
};

/**
 * Output types whose pipeline synthesizes narration, so they share the
 * scripting/synthesis/assembly stages, the voice option, and media cleanup.
 */
const NARRATED_OUTPUT_TYPES: ReadonlySet<OutputType> = new Set([
    "AUDIO_OVERVIEW",
    "VIDEO_EXPLAINER",
]);

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

    // Voice/style options are dropped for types that never speak, so a snapshot
    // never records settings that had no effect on the result.
    return NARRATED_OUTPUT_TYPES.has(type)
        ? { ...base, audio: audioOptionsOf({ ...base, audio: parsed.audio }) }
        : base;
}

/**
 * Guards creation of an output whose providers may not be configured.
 *
 * Checked before the row exists so the reader is told immediately rather than
 * watching a job fail minutes later.
 *
 * @param type - Output type being created
 * @throws {OutputGenerationError} When the deployment cannot produce this type
 */
function assertOutputTypeAvailable(type: OutputType): void {
    if (type === "AUDIO_OVERVIEW") {
        assertAudioOverviewAvailable();
    }
    if (type === "VIDEO_EXPLAINER") {
        assertVideoExplainerAvailable();
    }
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
    await authorizeNotebook(workspaceId, userId, "notebook:read");
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
    await authorizeNotebook(workspaceId, userId, "notebook:read");

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
    await authorizeNotebook(workspaceId, userId, "output:create");
    assertOutputTypeAvailable(input.type);

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
    await authorizeNotebook(workspaceId, userId, "output:update");
    await getArtifactForWorkspace(workspaceId, artifactId, userId);
    return updateArtifactRecord(artifactId, { title });
}

/**
 * Replaces an editable output's generated content with the reader's own edit.
 *
 * The payload is validated against the same contract the generator produces, so
 * an edited output renders and exports exactly like a generated one. The source
 * snapshot, labels, and generation options are left untouched: an edit changes
 * the wording, never the record of what evidence the output was built from.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Output to edit
 * @param userId - Authenticated user's id
 * @param input - Replacement content, discriminated by output type
 * @returns The updated output record
 * @throws {OutputNotEditableError} When the type or status forbids editing
 */
export async function updateArtifactContentForWorkspace(
    workspaceId: string,
    artifactId: string,
    userId: string,
    input: EditOutputContentRequest,
) {
    await authorizeNotebook(workspaceId, userId, "output:update");
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        userId,
    );

    if (!isEditableOutputType(artifact.type)) {
        throw new OutputNotEditableError(
            "This output type cannot be edited by hand.",
        );
    }

    if (artifact.type !== input.type) {
        throw new OutputNotEditableError(
            "The edit does not match this output's type.",
        );
    }

    if (artifact.status !== "READY") {
        throw new OutputNotEditableError(
            "Wait for this output to finish generating before editing it.",
        );
    }

    const metadata = metadataOf(artifact);
    const { content, contentVersion } =
        input.type === "SLIDES"
            ? {
                  content: {
                      version: SLIDES_CONTENT_VERSION,
                      deck: input.deck,
                  },
                  contentVersion: SLIDES_CONTENT_VERSION,
              }
            : {
                  content: {
                      version: DATA_TABLE_CONTENT_VERSION,
                      tables: input.tables,
                  },
                  contentVersion: DATA_TABLE_CONTENT_VERSION,
              };

    return updateArtifactRecord(artifactId, {
        content: toPrismaJson(content),
        contentVersion,
        metadata: toPrismaJson({
            ...metadata,
            editedAt: new Date().toISOString(),
        } satisfies OutputMetadata),
    });
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
    await authorizeNotebook(workspaceId, userId, "output:update");
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        userId,
    );

    if (artifact.status === "PENDING" || artifact.status === "PROCESSING") {
        throw new ConflictError("This output is already being generated.");
    }

    assertOutputTypeAvailable(artifact.type);

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
    await authorizeNotebook(workspaceId, userId, "output:create");
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        userId,
    );
    assertOutputTypeAvailable(artifact.type);

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
    await authorizeNotebook(workspaceId, userId, "output:update");
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
    actor: Actor,
) {
    await authorizeNotebook(workspaceId, actor.id, "output:delete");
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        actor.id,
    );

    await recordAuditEvent({
        workspaceId,
        type: "OUTPUT_DELETED",
        actor,
        context: { targetResourceId: artifactId, targetTitle: artifact.title },
    });

    const publicId = storedMediaPublicId(artifact);

    if (publicId) {
        // Queued before the row is removed so a failed enqueue leaves the
        // output intact and retryable, rather than orphaning a billable object
        // with nothing left pointing at it. The job itself is idempotent.
        await enqueueArtifactMediaCleanup({ workspaceId, publicId });
    }

    await deleteArtifactRecord(artifactId);
}

/**
 * Reads the storage id of any media attached to an output.
 *
 * @param artifact - Output row, whose type selects the content contract
 * @returns The stored object id, or `null` when the output owns no media
 */
function storedMediaPublicId(artifact: ArtifactRecord): string | null {
    switch (artifact.type) {
        case "AUDIO_OVERVIEW":
            return storedAudioPublicId(artifact.content);
        case "VIDEO_EXPLAINER":
            return storedVideoPublicId(artifact.content);
        default:
            return null;
    }
}

/**
 * Reads the playable media attached to a narrated output.
 *
 * @param artifact - Output row, whose type selects the content contract
 * @returns Media metadata, or `null` when nothing is playable yet
 */
function playableMediaOf(artifact: ArtifactRecord): AudioMedia | null {
    switch (artifact.type) {
        case "AUDIO_OVERVIEW":
            return parsePlayableAudioOverview(artifact.content)?.media ?? null;
        case "VIDEO_EXPLAINER":
            return parsePlayableVideoExplainer(artifact.content)?.media ?? null;
        default:
            return null;
    }
}

/**
 * Mints short-lived signed URLs for a narrated output's stored media.
 *
 * Serves Audio Overviews and video explainers, which store the same kind of
 * object; every other type has no media and is rejected.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param artifactId - Narrated output to play
 * @param userId - Authenticated user's id
 * @returns Signed playback and download URLs with their expiry
 * @throws {NotFoundError} When the output has no playable media
 */
export async function getArtifactAudioForWorkspace(
    workspaceId: string,
    artifactId: string,
    actor: Actor,
): Promise<OutputAudioAccess> {
    await authorizeNotebook(workspaceId, actor.id, "output:download");
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        actor.id,
    );

    if (!NARRATED_OUTPUT_TYPES.has(artifact.type)) {
        throw new NotFoundError("This output has no audio");
    }

    const media = playableMediaOf(artifact);
    if (!media) {
        throw new NotFoundError("This output has no audio yet");
    }

    const urls = signAudioUrls(media.storage.publicId);

    // Signed URLs are the one path by which generated media leaves the product,
    // so minting them is the export event worth recording.
    await recordAuditEvent({
        workspaceId,
        type: "OUTPUT_MEDIA_EXPORTED",
        actor,
        context: { targetResourceId: artifactId, targetTitle: artifact.title },
    });

    return {
        version: 1,
        playbackUrl: urls.playbackUrl,
        downloadUrl: urls.downloadUrl,
        expiresAt: urls.expiresAt.toISOString(),
        format: media.format,
        bytes: media.bytes,
        durationMs: media.durationMs,
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
 * Runs the video explainer pipeline for one attempt.
 *
 * ```
 * SCRIPTING (storyboard, reused when the fingerprint still matches)
 *   → SYNTHESIS (narration) → ASSEMBLY → durable storage → READY
 * ```
 *
 * Captions and the poster are derived from this content rather than stored, so
 * there is exactly one media object per output to key, replace, and retire.
 *
 * @param artifact - Output being generated, as claimed by this attempt
 * @param attempt - Attempt number carried by the job event
 * @param options - Persisted generation options
 * @param metadata - Metadata to extend and persist
 * @param sources - Resolved READY sources, used to fingerprint the storyboard
 * @param context - Labelled source material for this attempt
 * @param startedAt - Epoch millis the attempt began, for metrics
 * @returns What the worker did
 * @throws {OutputGenerationError} When a stage fails
 */
async function runVideoExplainerPipeline(
    artifact: ArtifactRecord,
    attempt: number,
    options: OutputGenerationOptions,
    metadata: OutputMetadata,
    sources: SourceRecord[],
    context: SourceContext,
    startedAt: number,
): Promise<ProcessArtifactResult> {
    assertVideoExplainerAvailable();

    const provider = getTextToSpeechProvider();
    if (!provider) {
        throw new OutputGenerationError(
            "SYNTHESIS",
            "VIDEO_UNAVAILABLE",
            "No speech provider is configured on this deployment.",
        );
    }

    const fingerprint = storyboardFingerprint(
        sources.map((source) => ({
            sourceId: source.id,
            processingVersion: source.processingVersion,
        })),
        options,
    );

    const reused = reusableStoryboard(
        artifact.content,
        metadata.video?.storyboardFingerprint,
        fingerprint,
    );
    let repairAttempts = 0;
    let storyboard = reused;

    if (!storyboard) {
        const generated = await generateVideoStoryboard(
            context.text,
            options,
            context.sourceLabels,
        );
        storyboard = generated.storyboard;
        repairAttempts = generated.repairAttempts;

        const scripted: VideoExplainerOutputContent = {
            version: VIDEO_EXPLAINER_CONTENT_VERSION,
            storyboard,
        };
        const stored = await saveArtifactProgress(artifact.id, attempt, {
            stage: "SYNTHESIS",
            content: toPrismaJson(scripted),
            contentVersion: VIDEO_EXPLAINER_CONTENT_VERSION,
            metadata: toPrismaJson({
                ...metadata,
                sourceLabels: context.sourceLabels,
                video: buildVideoSummary(scripted, options, fingerprint),
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

    const synthesis = await synthesizeStoryboard(
        storyboard,
        options,
        provider,
        () => isArtifactAttemptCurrent(artifact.id, attempt),
    );

    if (!synthesis) {
        return { status: "SKIPPED", reason: "cancelled" };
    }

    if (
        !(await saveArtifactProgress(artifact.id, attempt, {
            stage: "ASSEMBLY",
        }))
    ) {
        return { status: "SKIPPED", reason: "cancelled" };
    }

    const content = await storeVideoExplainer(
        artifact.id,
        storyboard,
        synthesis,
        options,
    );

    const finalized = await finalizeArtifactGeneration(artifact.id, attempt, {
        status: "READY",
        stage: "READY",
        content: toPrismaJson(content),
        contentVersion: VIDEO_EXPLAINER_CONTENT_VERSION,
        metadata: toPrismaJson({
            ...metadata,
            provider: OUTPUT_PROVIDER,
            model: CHAT_MODEL,
            options,
            sourceLabels: context.sourceLabels,
            video: buildVideoSummary(content, options, fingerprint),
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

    const isNarrated = NARRATED_OUTPUT_TYPES.has(artifact.type);

    if (
        !(await claimArtifactGeneration(
            artifactId,
            attempt,
            isNarrated ? "SCRIPTING" : "GENERATING",
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

        if (artifact.type === "AUDIO_OVERVIEW") {
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

        if (artifact.type === "VIDEO_EXPLAINER") {
            return await runVideoExplainerPipeline(
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
