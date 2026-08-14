ALTER TABLE "message" ADD COLUMN "grounding" JSONB;

CREATE INDEX "source_chunk_content_fts_idx"
ON "source_chunk"
USING GIN (to_tsvector('english', "content"));
