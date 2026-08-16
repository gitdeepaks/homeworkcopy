import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const artifactSelect = {
    id: true,
    workspaceId: true,
    type: true,
    title: true,
    content: true,
    contentVersion: true,
    sourceIds: true,
    status: true,
    stage: true,
    attemptCount: true,
    cancelledAt: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type ArtifactRecord = Prisma.LearningArtifactGetPayload<{
    select: typeof artifactSelect;
}>;

export type ArtifactStage = ArtifactRecord["stage"];

export type CreateArtifactData = {
    workspaceId: string;
    type: ArtifactRecord["type"];
    title: string;
    sourceIds: string[];
    status?: ArtifactRecord["status"];
    stage?: ArtifactStage;
    attemptCount?: number;
    contentVersion?: number;
    content?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
};

/** Statuses a generation worker may take over for a given attempt. */
const CLAIMABLE_STATUSES = ["PENDING", "PROCESSING", "FAILED"] as const;

export function findArtifactsByWorkspaceId(workspaceId: string) {
    return prisma.learningArtifact.findMany({
        where: { workspaceId },
        select: artifactSelect,
        orderBy: { createdAt: "desc" },
    });
}

export function findArtifactByIdAndWorkspaceId(
    artifactId: string,
    workspaceId: string,
) {
    return prisma.learningArtifact.findFirst({
        where: { id: artifactId, workspaceId },
        select: artifactSelect,
    });
}

export function createArtifactRecord(data: CreateArtifactData) {
    return prisma.learningArtifact.create({
        data: {
            workspaceId: data.workspaceId,
            type: data.type,
            title: data.title,
            sourceIds: data.sourceIds,
            status: data.status ?? "PENDING",
            stage: data.stage ?? "QUEUED",
            attemptCount: data.attemptCount ?? 0,
            contentVersion: data.contentVersion ?? 1,
            content: data.content,
            metadata: data.metadata,
        },
        select: artifactSelect,
    });
}

export function updateArtifactRecord(
    artifactId: string,
    data: {
        title?: string;
        content?: Prisma.InputJsonValue;
        contentVersion?: number;
        status?: ArtifactRecord["status"];
        metadata?: Prisma.InputJsonValue;
    },
) {
    return prisma.learningArtifact.update({
        where: { id: artifactId },
        data,
        select: artifactSelect,
    });
}

/**
 * Starts a new generation attempt, invalidating any job still running for the
 * previous attempt.
 *
 * @param artifactId - Output to requeue
 * @param metadata - Metadata to write alongside the reset, when supplied
 * @returns The updated record, including its new attempt number
 */
export function startArtifactAttempt(
    artifactId: string,
    metadata?: Prisma.InputJsonValue,
) {
    return prisma.learningArtifact.update({
        where: { id: artifactId },
        data: {
            status: "PENDING",
            stage: "QUEUED",
            cancelledAt: null,
            attemptCount: { increment: 1 },
            ...(metadata === undefined ? {} : { metadata }),
        },
        select: artifactSelect,
    });
}

/**
 * Cancels an output that has not finished generating.
 *
 * The attempt counter is bumped so an in-flight worker cannot write results
 * after the cancellation.
 *
 * @param artifactId - Output to cancel
 * @returns Number of rows cancelled (`0` when it already reached a final state)
 */
export async function cancelArtifactRecord(artifactId: string) {
    const result = await prisma.learningArtifact.updateMany({
        where: { id: artifactId, status: { in: ["PENDING", "PROCESSING"] } },
        data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            attemptCount: { increment: 1 },
        },
    });
    return result.count;
}

/**
 * Atomically marks an output as generating for one specific attempt.
 *
 * @param artifactId - Output being generated
 * @param attempt - Attempt number carried by the job event
 * @param stage - First pipeline stage this output type runs
 * @returns `true` when this worker owns the attempt, `false` when it is stale
 */
export async function claimArtifactGeneration(
    artifactId: string,
    attempt: number,
    stage: ArtifactStage,
) {
    const result = await prisma.learningArtifact.updateMany({
        where: {
            id: artifactId,
            attemptCount: attempt,
            cancelledAt: null,
            status: { in: [...CLAIMABLE_STATUSES] },
        },
        data: { status: "PROCESSING", stage },
    });
    return result.count === 1;
}

/**
 * Whether this worker still owns the attempt.
 *
 * Long pipelines check between stages so a cancellation or a newer attempt
 * stops work instead of paying a provider for a result nobody will read.
 *
 * @param artifactId - Output being generated
 * @param attempt - Attempt number carried by the job event
 * @returns `true` while this attempt is current and not cancelled
 */
export async function isArtifactAttemptCurrent(
    artifactId: string,
    attempt: number,
) {
    const count = await prisma.learningArtifact.count({
        where: { id: artifactId, attemptCount: attempt, cancelledAt: null },
    });
    return count === 1;
}

/**
 * Records intermediate progress for an attempt that is still running.
 *
 * Writing the stage and any work completed so far is what lets a reader watch a
 * long generation move, and what lets a retry skip a stage it already paid for.
 *
 * @param artifactId - Output being generated
 * @param attempt - Attempt number the progress belongs to
 * @param data - Stage, and optionally the partial content and metadata
 * @returns `true` when the progress was stored, `false` when it was superseded
 */
export async function saveArtifactProgress(
    artifactId: string,
    attempt: number,
    data: {
        stage: ArtifactStage;
        content?: Prisma.InputJsonValue;
        contentVersion?: number;
        metadata?: Prisma.InputJsonValue;
    },
) {
    const result = await prisma.learningArtifact.updateMany({
        where: {
            id: artifactId,
            attemptCount: attempt,
            cancelledAt: null,
            status: "PROCESSING",
        },
        data,
    });
    return result.count === 1;
}

/**
 * Writes a terminal generation result, but only while this attempt is still the
 * current one.
 *
 * @param artifactId - Output being finalized
 * @param attempt - Attempt number the result belongs to
 * @param data - Status, content, and metadata to persist
 * @returns `true` when the result was stored, `false` when it was superseded
 */
export async function finalizeArtifactGeneration(
    artifactId: string,
    attempt: number,
    data: {
        status: ArtifactRecord["status"];
        stage: ArtifactStage;
        content?: Prisma.InputJsonValue;
        contentVersion?: number;
        metadata: Prisma.InputJsonValue;
    },
) {
    const result = await prisma.learningArtifact.updateMany({
        where: { id: artifactId, attemptCount: attempt, cancelledAt: null },
        data,
    });
    return result.count === 1;
}

export async function deleteArtifactRecord(artifactId: string) {
    await prisma.learningArtifact.delete({
        where: { id: artifactId },
    });
}

export function findArtifactById(artifactId: string) {
    return prisma.learningArtifact.findUnique({
        where: { id: artifactId },
        select: artifactSelect,
    });
}
