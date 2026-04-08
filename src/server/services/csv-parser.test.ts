/**
 * Tests for the CSV parser's encoding-detection logic (Bug 6).
 *
 * The parser must accept both UTF-8 and Windows-1252 encoded CSVs without
 * mangling characters like the curly apostrophe (Win-1252 byte 0x92), which
 * would otherwise become U+FFFD replacement characters.
 */
import { describe, it, expect } from "vitest";
import { parseCsvBuffer } from "./csv-parser.js";

// Minimal CSV header that satisfies parseCsvBuffer's row filter
// (only commentId is required to be non-empty).
const HEADER =
  "Comment Id,Comment Full Text,Comment Author Type\n";

describe("csv-parser encoding detection", () => {
  it("decodes a UTF-8 buffer with a curly apostrophe", () => {
    const csv = HEADER + 'c1,"don\u2019t stop","USER"\n';
    const buf = Buffer.from(csv, "utf-8");
    const rows = parseCsvBuffer(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].commentFullText).toBe("don\u2019t stop");
    expect(rows[0].commentFullText).not.toContain("\uFFFD");
  });

  it("decodes a Windows-1252 buffer with a curly apostrophe", () => {
    // Build the bytes manually: 0x92 is the curly apostrophe in Win-1252
    // and is invalid as a standalone UTF-8 byte (so strict UTF-8 will throw
    // and the decoder will fall back to Win-1252).
    const prefix = Buffer.from(HEADER + 'c1,"don', "ascii");
    const apostrophe = Buffer.from([0x92]);
    const suffix = Buffer.from('t stop","USER"\n', "ascii");
    const buf = Buffer.concat([prefix, apostrophe, suffix]);

    const rows = parseCsvBuffer(buf);
    expect(rows).toHaveLength(1);
    // The result should be the proper Unicode curly apostrophe, not U+FFFD.
    expect(rows[0].commentFullText).toBe("don\u2019t stop");
    expect(rows[0].commentFullText).not.toContain("\uFFFD");
  });

  it("strips a UTF-8 BOM from the first header", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csv = Buffer.from(HEADER + 'c1,"hello","USER"\n', "utf-8");
    const buf = Buffer.concat([bom, csv]);
    const rows = parseCsvBuffer(buf);
    expect(rows).toHaveLength(1);
    // The BOM should not have leaked into the first column header — if it had,
    // commentId would be undefined and the row would have been filtered out.
    expect(rows[0].commentId).toBe("c1");
    expect(rows[0].commentFullText).toBe("hello");
  });
});
