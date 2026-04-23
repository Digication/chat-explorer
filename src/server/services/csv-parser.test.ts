/**
 * Unit tests for the streaming CSV parser (parseCsvFile) and the sync buffer
 * parser (parseCsvBuffer). Covers encoding detection, BOM stripping, header
 * normalization, row filtering, and multiline-cell handling.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseCsvFile, parseCsvBuffer } from "./csv-parser.js";

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "csv-parser-test-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function writeFixture(name: string, content: string | Buffer): Promise<string> {
  const p = join(workDir, name);
  await writeFile(p, content);
  return p;
}

describe("parseCsvFile", () => {
  it("parses a small UTF-8 CSV and normalizes headers", async () => {
    const csv =
      "Thread ID,Comment ID,Comment Role,Comment full text,Assignment ID\n" +
      "t1,c1,USER,Hello,a1\n" +
      "t1,c2,ASSISTANT,Hi there,a1\n";
    const p = await writeFixture("small-utf8.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(2);
    expect(rows[0].threadId).toBe("t1");
    expect(rows[0].commentId).toBe("c1");
    expect(rows[0].commentRole).toBe("USER");
    expect(rows[0].commentFullText).toBe("Hello");
    expect(rows[1].commentRole).toBe("ASSISTANT");
  });

  it("filters rows with no commentId", async () => {
    const csv =
      "Thread ID,Comment ID,Comment Role,Comment full text\n" +
      "t1,c1,USER,Real row\n" +
      "t1,,USER,Junk row with no commentId\n" +
      "t1,c2,USER,Another real row\n";
    const p = await writeFixture("no-commentid.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.commentId)).toEqual(["c1", "c2"]);
  });

  it("strips a UTF-8 BOM without including it in the first header", async () => {
    const csv =
      "\ufeffThread ID,Comment ID,Comment Role,Comment full text\n" +
      "t1,c1,USER,Hello\n";
    const p = await writeFixture("bom.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].threadId).toBe("t1");
  });

  it("decodes Windows-1252 when the file is not valid UTF-8", async () => {
    // 0x92 is a curly apostrophe in Windows-1252 and invalid UTF-8.
    const headerUtf8 = Buffer.from(
      "Thread ID,Comment ID,Comment Role,Comment full text\n",
      "utf8"
    );
    const row = Buffer.concat([
      Buffer.from("t1,c1,USER,It", "utf8"),
      Buffer.from([0x92]),
      Buffer.from("s working\n", "utf8"),
    ]);
    const p = await writeFixture("win1252.csv", Buffer.concat([headerUtf8, row]));

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(1);
    // The right-single-quote is U+2019 in Windows-1252 decode.
    expect(rows[0].commentFullText).toBe("It\u2019s working");
  });

  it("handles rows with many columns (relax_column_count)", async () => {
    const csv =
      "Thread ID,Comment ID,Comment Role,Comment full text\n" +
      "t1,c1,USER,hello,extra1,extra2\n";
    const p = await writeFixture("extra-cols.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].commentId).toBe("c1");
  });

  it("handles embedded newlines inside quoted cells", async () => {
    const csv =
      'Thread ID,Comment ID,Comment Role,Comment full text\n' +
      't1,c1,USER,"line1\nline2\nline3"\n';
    const p = await writeFixture("multiline.csv", csv);

    const rows = await parseCsvFile(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].commentFullText).toBe("line1\nline2\nline3");
  });

  it("agrees with parseCsvBuffer on the same input", async () => {
    const csv =
      "Thread ID,Comment ID,Comment Role,Comment full text,Assignment ID\n" +
      "t1,c1,USER,Hello,a1\n" +
      "t2,c2,ASSISTANT,Hi,a1\n";
    const p = await writeFixture("compat.csv", csv);

    const streamed = await parseCsvFile(p);
    const sync = parseCsvBuffer(Buffer.from(csv, "utf8"));
    expect(streamed).toEqual(sync);
  });
});

// ── Legacy sync-path tests (parseCsvBuffer) ───────────────────────────────────
// These cover the same encoding/BOM scenarios via the synchronous path, kept
// for regression coverage of the older code path.

describe("parseCsvBuffer — encoding detection (legacy path)", () => {
  // Minimal CSV header that satisfies parseCsvBuffer's row filter
  // (only commentId is required to be non-empty).
  const HEADER = "Comment Id,Comment Full Text,Comment Author Type\n";

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
