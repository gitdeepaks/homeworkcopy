import { MemoryClient } from "mem0ai";
import { z } from "zod";
import { withTimeout } from "./timeout.js";
import { NotFoundError } from "../types/app-error.js";

let client: MemoryClient | null = null;
const providerMemorySchema = z.object({
  id: z.string().min(1),
  memory: z.string().optional(),
  data: z.object({ memory: z.string() }).nullable().optional(),
  userId: z.string().min(1).optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
  updatedAt: z.union([z.date(), z.string()]).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  categories: z.array(z.string()).optional(),
});

/**
 * Returns a singleton Mem0 API client.
 *
 * @returns Configured `MemoryClient`
 * @throws When `MEM0_API_KEY` is missing
 */
export function getMem0Client() {
  const apiKey = process.env.MEM0_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("MEM0_API_KEY is not configured");
  }

  if (!client) {
    client = new MemoryClient({ apiKey });
  }

  return client;
}

/** Message shape accepted by Mem0 for inferred memory extraction. */
export type Mem0Message = {
  role: "user" | "assistant";
  content: string;
};

/** Normalized memory record returned by Homeworkcopy memory APIs. */
export type AppMemory = {
  id: string;
  memory: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
  categories?: string[];
  source: "manual" | "learned";
};

/**
 * Maps a raw Mem0 record into the app's {@link AppMemory} shape.
 *
 * @param record - Raw Mem0 memory object
 * @returns Normalized memory with `source` derived from metadata
 */
function mapMemory(value: unknown): AppMemory {
  const record = providerMemorySchema.parse(value);
  const metadata = record.metadata ?? null;
  const source: AppMemory["source"] =
    metadata?.source === "manual" ? "manual" : "learned";
  const createdAt = record.createdAt ?? new Date().toISOString();
  const updatedAt = record.updatedAt ?? createdAt;

  return {
    id: record.id,
    memory: record.memory ?? record.data?.memory ?? "",
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
    metadata,
    categories: record.categories,
    source,
  };
}

async function assertMemoryOwnership(userId: string, memoryId: string) {
  const value: unknown = await withTimeout(
    "Mem0 memory lookup",
    10_000,
    getMem0Client().get(memoryId),
  );
  const memory = providerMemorySchema.parse(value);
  if (memory.userId !== userId) throw new NotFoundError("Memory not found");
}

/**
 * Lists all memories stored for a user (up to 100).
 *
 * @param userId - Authenticated user's id
 * @returns Array of memories, or `[]` when Mem0 is not configured
 *
 */
export async function listUserMemories(userId: string) {
  if (!process.env.MEM0_API_KEY?.trim()) {
    return [];
  }

  const page = await withTimeout(
    "Mem0 memory list",
    10_000,
    getMem0Client().getAll({
      filters: { user_id: userId },
      page: 1,
      pageSize: 100,
    }),
  );

  return page.results.map(mapMemory);
}

/**
 * Semantic search over a user's memories for RAG chat context.
 *
 * @param userId - Authenticated user's id
 * @param query - Current user message or search text
 * @returns Top matching memories (up to 8), or `[]` when Mem0 is off or query is empty
 *
 */
export async function searchUserMemories(userId: string, query: string) {
  if (!process.env.MEM0_API_KEY?.trim() || !query.trim()) {
    return [];
  }

  const results = await withTimeout(
    "Mem0 memory search",
    10_000,
    getMem0Client().search(query, {
      filters: { user_id: userId },
      topK: 8,
      threshold: 0.1,
    }),
  );

  return results.results.map(mapMemory);
}

/**
 * Creates a single user memory (manual or explicit text).
 *
 * @param userId - Owner of the memory
 * @param input - Memory text, optional infer flag, optional metadata
 * @returns Created memory record
 * @throws When Mem0 returns no created record
 *
 */
export async function addUserMemory(
  userId: string,
  input: {
    memory: string;
    infer?: boolean;
    metadata?: Record<string, unknown>;
  },
) {
  const created = await withTimeout(
    "Mem0 memory create",
    15_000,
    getMem0Client().add([{ role: "user", content: input.memory }], {
      userId,
      infer: input.infer ?? false,
      metadata: input.metadata,
    }),
  );

  const first = created[0];
  if (!first) {
    throw new Error("Mem0 did not return a created memory");
  }

  return mapMemory(first);
}

/**
 * Extracts inferred memories from a conversation transcript (fire-and-forget in chat).
 *
 * @param userId - Owner of extracted memories
 * @param messages - Recent user/assistant turns
 * @param metadata - Optional metadata (e.g. `{ source: "learned", conversationId }`)
 * @returns Resolves immediately when Mem0 is off or messages are empty
 *
 */
export async function addMemoriesFromMessages(
  userId: string,
  messages: Mem0Message[],
  metadata?: Record<string, unknown>,
) {
  if (!process.env.MEM0_API_KEY?.trim() || messages.length === 0) {
    return;
  }

  await withTimeout(
    "Mem0 memory extraction",
    15_000,
    getMem0Client().add(messages, {
      userId,
      infer: true,
      metadata,
    }),
  );
}

/**
 * Updates the text of an existing memory by id.
 *
 * @param memoryId - Mem0 memory id
 * @param input - New memory text
 * @returns Updated memory record
 * @throws When Mem0 returns no updated record
 *
 */
export async function updateUserMemory(
  userId: string,
  memoryId: string,
  input: { memory: string },
) {
  await assertMemoryOwnership(userId, memoryId);
  const updated = await withTimeout(
    "Mem0 memory update",
    10_000,
    getMem0Client().update(memoryId, {
      text: input.memory,
    }),
  );

  const first = updated[0];
  if (!first) {
    throw new Error("Mem0 did not return an updated memory");
  }

  return mapMemory(first);
}

/**
 * Permanently deletes a memory from Mem0.
 *
 * @param memoryId - Mem0 memory id to delete
 * @returns Resolves when deletion completes
 *
 */
export async function deleteUserMemory(userId: string, memoryId: string) {
  await assertMemoryOwnership(userId, memoryId);
  await withTimeout(
    "Mem0 memory delete",
    10_000,
    getMem0Client().delete(memoryId),
  );
}

/**
 * Removes every memory the provider holds for a user.
 *
 * Deleting one at a time rather than through a bulk endpoint, because the
 * provider's bulk delete is filter-based and a filter that silently matches
 * nothing is indistinguishable from one that deleted everything — which is the
 * exact question an account deletion has to answer truthfully.
 *
 * Paged until the provider reports nothing left, so an account with more
 * memories than one page holds is fully cleared rather than mostly.
 *
 * @param userId - Owner of the memories
 * @returns How many memories were removed
 * @throws When the provider refuses, so the deletion receipt records the failure
 */
export async function deleteAllUserMemories(userId: string): Promise<number> {
  if (!process.env.MEM0_API_KEY?.trim()) {
    return 0;
  }

  const client = getMem0Client();
  let removed = 0;

  // Bounded so a provider that keeps returning the same page cannot spin here
  // forever; 100 passes of 100 is far beyond any real account.
  for (let pass = 0; pass < 100; pass += 1) {
    const batch = await withTimeout(
      "Mem0 memory list",
      15_000,
      client.getAll({
        filters: { user_id: userId },
        page: 1,
        pageSize: 100,
      }),
    );

    if (batch.results.length === 0) {
      return removed;
    }

    for (const record of batch.results) {
      const memory = providerMemorySchema.parse(record);
      await withTimeout("Mem0 memory delete", 10_000, client.delete(memory.id));
      removed += 1;
    }
  }

  throw new Error("Mem0 did not stop returning memories for this user");
}
