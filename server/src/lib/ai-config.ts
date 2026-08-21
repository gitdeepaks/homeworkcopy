
/** Default chat model when the client or workspace does not specify one. */
export const CHAT_MODEL = "gpt-4o-mini";

/** Allowed chat models exposed to the client and workspace settings. */
export const CHAT_MODELS = ["gpt-4o-mini", "gpt-4o"] as const;

/** OpenAI embedding model used for RAG vector indexing and query embedding. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Vector dimension count — must match Pinecone index configuration. */
export const EMBEDDING_DIMENSIONS = 1536;

/** Target max characters per text chunk during source processing. */
export const CHUNK_SIZE = 1000;

/** Character overlap between consecutive chunks at split boundaries. */
export const CHUNK_OVERLAP = 100;

/** Number of Pinecone chunks to retrieve per chat query. */
export const RAG_TOP_K = 6;

/**
 * Absolute cosine floor for a vector match to enter the candidate pool.
 *
 * Deliberately close to zero: it drops noise, it does not decide relevance.
 * Relevance is decided by rank in {@link rerankHybridCandidates}, because cosine
 * scores are not comparable across languages — an English question against a
 * Hindi transcript tops out near 0.13 even when the chunk is the right one, so
 * any floor high enough to mean something for a same-language query silently
 * returns nothing cross-lingually.
 */
export const RAG_VECTOR_SCORE_FLOOR = 0.05;

/**
 * Cosine score below which a first retrieval pass is considered weak enough to
 * be worth re-running with the question translated into the sources' language.
 *
 * This is the old hard cutoff, repurposed: instead of emptying the result it now
 * only decides whether to spend one extra model call on a cross-lingual retry.
 */
export const RAG_CROSS_LINGUAL_TRIGGER_SCORE = 0.35;

/** Max translated variants of a question embedded alongside the original. */
export const RAG_MAX_QUERY_VARIANTS = 2;

/** Enqueue a conversation summary job every N persisted messages. */
export const CONVERSATION_SUMMARY_INTERVAL = 8;

/** Max recent UI messages sent to the model when a rolling summary exists. */
export const RECENT_MESSAGE_WINDOW = 12;

/** Hard output ceiling used by chat generation and quota reservation. */
export const CHAT_MAX_OUTPUT_TOKENS = 2_000;
