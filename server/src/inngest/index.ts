import { inngest } from "./client.js";
import {
  chunkSourceContent,
  embedAndIndexSource,
  extractSourceContent,
  markSourceFailed,
  markSourceProcessing,
  markSourceStage,
} from "../services/source-processing.service.js";
import { findSourceById } from "../repositories/source.repository.js";
import { findChunksBySourceIdAndProcessingVersion } from "../repositories/source-chunk.repository.js";
import { processArtifactById } from "../services/artifact.service.js";
import { removeStoredAudio } from "../services/audio-overview.service.js";
import { summarizeConversationById } from "../services/conversation-memory.service.js";
import { cleanupSourceById } from "../services/source.service.js";
import { processDataExport } from "../services/data-export.service.js";
import { processAccountDeletion } from "../services/account-deletion.service.js";
import { applyRetentionPolicy } from "../services/retention.service.js";

export const processSource = inngest.createFunction(
  {
    id: "process-source",
    retries: 3,
    concurrency: { limit: 5, key: "event.data.workspaceId" },
    triggers: [{ event: "source/created" }],
  },
  async ({ event, step }) => {
    const { sourceId, workspaceId } = event.data;
    const processingVersion = event.data.processingVersion ?? 1;

    await step.run("mark-processing", () => markSourceProcessing(sourceId, processingVersion));

    try {
      const extracted = await step.run("extract-content", () =>
        extractSourceContent(sourceId, processingVersion),
      );

      await step.run("mark-chunking", () =>
        markSourceStage(sourceId, processingVersion, "CHUNKING"),
      );
      await step.run("chunk-content", () =>
        chunkSourceContent(
          sourceId,
          extracted.text,
          extracted.pages,
          extracted.transcriptSegments,
          processingVersion,
        ),
      );

      await step.run("mark-embedding", () =>
        markSourceStage(sourceId, processingVersion, "EMBEDDING"),
      );
      const result = await step.run("embed-and-index", async () => {
        const source = await findSourceById(sourceId);
        if (!source || source.workspaceId !== workspaceId) {
          throw new Error("Source not found");
        }

        const chunks = await findChunksBySourceIdAndProcessingVersion(
          sourceId,
          processingVersion,
        );
        await embedAndIndexSource(source, chunks, processingVersion);

        return { chunkCount: chunks.length };
      });

      return { sourceId, status: "READY", ...result };
    } catch (error) {
      await step.run("mark-failed", async () => {
        const source = await findSourceById(sourceId);
        if (source) {
          await markSourceFailed(
            sourceId,
            error instanceof Error ? error : new Error("Source processing failed"),
            source.metadata,
            processingVersion,
          );
        }
      });
      throw error;
    }
  },
);

export const deleteSource = inngest.createFunction(
  {
    id: "delete-source",
    retries: 5,
    triggers: [{ event: "source/delete" }],
  },
  async ({ event, step }) => {
    const { sourceId, workspaceId } = event.data;
    await step.run("cleanup-source", () => cleanupSourceById(sourceId, workspaceId));
    return { sourceId, status: "DELETED" };
  },
);

export const generateArtifact = inngest.createFunction(
  {
    id: "generate-artifact",
    retries: 2,
    concurrency: { limit: 5, key: "event.data.workspaceId" },
    triggers: [{ event: "artifact/generate" }],
  },
  async ({ event, step }) => {
    const { artifactId } = event.data;
    // Outputs queued before Phase 7 carried no attempt number.
    const attempt = event.data.attempt ?? 1;

    const result = await step.run("generate", () =>
      processArtifactById(artifactId, attempt),
    );

    return { artifactId, attempt, ...result };
  },
);

export const cleanupArtifactMedia = inngest.createFunction(
  {
    id: "cleanup-artifact-media",
    retries: 5,
    triggers: [{ event: "artifact/media-cleanup" }],
  },
  async ({ event, step }) => {
    const { publicId } = event.data;

    // Deleting an object that is already gone is a no-op, so replays are safe.
    await step.run("delete-object", async () => {
      await removeStoredAudio(publicId);
      return { publicId };
    });

    return { publicId, status: "DELETED" };
  },
);

export const summarizeConversation = inngest.createFunction(
  {
    id: "summarize-conversation",
    retries: 2,
    concurrency: { limit: 1, key: "event.data.conversationId" },
    triggers: [{ event: "conversation/summarize" }],
  },
  async ({ event, step }) => {
    const { conversationId, userId } = event.data;

    await step.run("summarize", () =>
      summarizeConversationById(conversationId, userId),
    );

    return { conversationId, status: "SUMMARIZED" };
  },
);

/**
 * Builds a requested export archive.
 *
 * Low concurrency on purpose: an export reads a whole account, and letting a
 * dozen run at once turns a privacy feature into a way to saturate the database
 * the rest of the product is trying to serve from.
 */
export const buildDataExport = inngest.createFunction(
  {
    id: "build-data-export",
    retries: 2,
    concurrency: { limit: 2 },
    triggers: [{ event: "privacy/export-requested" }],
  },
  async ({ event, step }) => {
    const { exportId } = event.data;
    return step.run("build-export", () => processDataExport(exportId));
  },
);

/**
 * Carries out an account deletion.
 *
 * Retried generously and serialized per account. Every target is idempotent, so
 * a retry after a provider outage resumes the walk rather than repeating work,
 * and the deletion stays open until every store confirms.
 */
export const deleteAccount = inngest.createFunction(
  {
    id: "delete-account",
    retries: 5,
    concurrency: { limit: 1, key: "event.data.userId" },
    triggers: [{ event: "privacy/account-deletion-requested" }],
  },
  async ({ event, step }) => {
    const { userId } = event.data;
    return step.run("delete-account", () => processAccountDeletion(userId));
  },
);

/**
 * Applies the retention policy.
 *
 * Runs daily rather than continuously: retention windows are measured in days,
 * so a purge that is a few hours late is not late, and a nightly run is far
 * easier to reason about when something is missing than a constant trickle.
 */
export const enforceRetention = inngest.createFunction(
  {
    id: "enforce-retention",
    retries: 1,
    triggers: [{ cron: "TZ=Etc/UTC 20 3 * * *" }],
  },
  async ({ step }) => {
    const outcomes = await step.run("apply-retention", () =>
      applyRetentionPolicy(),
    );
    return { outcomes };
  },
);

export const functions = [
  processSource,
  deleteSource,
  generateArtifact,
  cleanupArtifactMedia,
  summarizeConversation,
  buildDataExport,
  deleteAccount,
  enforceRetention,
];
