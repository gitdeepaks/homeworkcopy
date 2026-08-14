import { describe, expect, test } from "bun:test";
import { chunkText } from "./chunking.js";

describe("chunkText", () => {
  test("recursively splits oversized sections after a sparse separator", () => {
    const text = `${"first ".repeat(20_000)}\n${"second ".repeat(20_000)}`;

    const chunks = chunkText(text, { chunkSize: 1000, chunkOverlap: 100 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(
      Math.max(...chunks.map((chunk) => chunk.content.length)),
    ).toBeLessThanOrEqual(1000);
  });
});
