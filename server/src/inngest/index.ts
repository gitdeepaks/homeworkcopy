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
import { summarizeConversationById } from "../services/conversation-memory.service.js";
import { cleanupSourceById } from "../services/source.service.js";

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
    triggers: [{ event: "artifact/generate" }],
  },
  async ({ event, step }) => {
    const { artifactId } = event.data;

    await step.run("generate", () => processArtifactById(artifactId));

    return { artifactId, status: "READY" };
  },
);

export const summarizeConversation = inngest.createFunction(
  {
    id: "summarize-conversation",
    retries: 2,
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

export const functions = [
  processSource,
  deleteSource,
  generateArtifact,
  summarizeConversation,
];
