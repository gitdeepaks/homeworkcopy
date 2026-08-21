-- Keyword retrieval now matches chunks under the 'simple' configuration as well
-- as 'english', so that non-Latin sources (Devanagari, Han, Cyrillic) are
-- reachable at all. Without a matching index the added predicate would force a
-- sequential scan over every chunk in the workspace.
CREATE INDEX "source_chunk_content_fts_simple_idx"
ON "source_chunk"
USING GIN (to_tsvector('simple', "content"));
