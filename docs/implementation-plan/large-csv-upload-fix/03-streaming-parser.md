# Phase 03 — Streaming CSV Parser

You are replacing the synchronous CSV parser in chat-explorer with a streaming one so uploads don't block the Node.js event loop.

**Context:** Phase 02 switched multer to disk storage and changed `previewUpload`/`commitUpload` to accept a `filePath: string`. Both services currently call `readFile(filePath)` to load the buffer, then pass it to `parseCsvBuffer(buffer)` (defined in `src/server/services/csv-parser.ts`), which uses `csv-parse/sync`. That sync parse blocks the event loop for the duration of parsing a 75 MB file (~5–15 seconds of frozen event loop — no other HTTP requests serviced during that time). The `decodeCsvBuffer` helper inside the parser decodes the whole buffer twice in the Windows-1252 fallback path.

This phase replaces `parseCsvBuffer(buffer)` with `parseCsvFile(filePath)` that uses `csv-parse`'s streaming API with `createReadStream`. The row array is still materialized in memory at the end (dedup and parent-entity logic in `upload.ts` depend on having all rows available) — end-to-end streaming is a larger refactor we're deferring. The win here is: (a) event loop stays responsive during parsing, (b) no second-buffer copy in the fallback encoding path, (c) better error messages (parser errors include line numbers).

## Overview

- Add `parseCsvFile(filePath): Promise<RawCsvRow[]>` using streaming `csv-parse` + `createReadStream`.
- Sniff the first 8 KB of the file for UTF-8 vs Windows-1252 and pipe through a `TextDecoder` transform when the file is Windows-1252.
- Keep `parseCsvBuffer(buffer)` for backward compatibility — just have it delegate to the same streaming parser via a temp file, or keep its sync implementation as-is since no production code path will call it after phase 04 finishes (we keep it for any scripts that still call it).
- Update `previewUpload` and `commitUpload` to call `parseCsvFile(filePath)` and drop the `readFile` step added in phase 02.

## Steps

### 1. Add the streaming parser

**Files to modify:** `src/server/services/csv-parser.ts`

At the top of the file, add new imports alongside the existing ones:

```typescript
import { parse as parseStream } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { Transform } from "node:stream";
```

Rename the existing `import { parse }` to `import { parse as parseSync }` as shown above, and update its one use-site in `parseCsvBuffer` (step 4 below). Keeping both names disambiguates the sync and streaming APIs.

Add an encoding sniffer helper below `decodeCsvBuffer`:

```typescript
/**
 * Sniffs the encoding of a CSV file by reading its first ~8 KB and testing
 * whether the bytes are valid UTF-8. Returns "utf-8" for valid UTF-8 (or
 * ASCII, which is a subset), and "windows-1252" otherwise.
 *
 * Why 8 KB: enough to hit multi-byte characters in the header row and the
 * first few data rows, small enough to read instantly. Real-world CSVs
 * don't change encoding mid-file, so a prefix sample is definitive.
 */
async function sniffEncoding(
  filePath: string
): Promise<"utf-8" | "windows-1252"> {
  const fh = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fh.read(buf, 0, 8192, 0);
    const sample =
      bytesRead >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
        ? buf.subarray(3, bytesRead) // strip UTF-8 BOM before sniffing
        : buf.subarray(0, bytesRead);

    try {
      // fatal: true throws on invalid UTF-8. Plain ASCII is valid UTF-8,
      // so we default to utf-8 for both cases.
      new TextDecoder("utf-8", { fatal: true }).decode(sample);
      return "utf-8";
    } catch {
      return "windows-1252";
    }
  } finally {
    await fh.close();
  }
}

/**
 * Stream transform that decodes Windows-1252 bytes to UTF-8 strings.
 * Used when sniffEncoding reports windows-1252 — csv-parse does not
 * natively understand that encoding, so we decode upstream of it.
 */
function windows1252Decoder(): Transform {
  const decoder = new TextDecoder("windows-1252");
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      try {
        // stream: true so the decoder doesn't finalize between chunks.
        const text = decoder.decode(chunk, { stream: true });
        cb(null, text);
      } catch (err) {
        cb(err as Error);
      }
    },
    flush(cb) {
      try {
        const tail = decoder.decode();
        cb(null, tail || undefined);
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}

/**
 * Stream-parse a CSV file from disk, returning all non-empty rows with
 * normalized headers. This is the preferred entry point — it doesn't block
 * the event loop and doesn't require the whole file as a Buffer in memory
 * before parsing starts.
 *
 * Rows are still collected into an array at the end (the upload service
 * needs the full set for deduplication), so peak memory is proportional to
 * parsed rows, not raw file size. For a 75 MB file with 250k rows and some
 * large text fields, expect ~300–500 MB of row-object memory. That's still
 * substantially less than the sync path (which needs the raw buffer PLUS
 * the decoded string PLUS the row array all at once).
 */
export async function parseCsvFile(filePath: string): Promise<RawCsvRow[]> {
  const encoding = await sniffEncoding(filePath);

  // The parser emits objects keyed by our normalized header names.
  const parser = parseStream({
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true, // strip a UTF-8 BOM if the file starts with one
  });

  const source = createReadStream(filePath);

  if (encoding === "windows-1252") {
    // Decode bytes → UTF-8 strings before csv-parse sees them.
    source.pipe(windows1252Decoder()).pipe(parser);
  } else {
    // csv-parse handles UTF-8 buffers directly.
    source.pipe(parser);
  }

  // Read rows off the parser as an async iterable. This keeps us in the
  // streaming world — each microtask handles one row, then yields to the
  // event loop. Compare to csv-parse/sync, which processes everything
  // inside a single synchronous call and starves other requests.
  const rows: RawCsvRow[] = [];
  for await (const record of parser as AsyncIterable<RawCsvRow>) {
    // Same filter the sync path applies: drop rows with no commentId.
    if (record.commentId?.trim()) {
      rows.push(record);
    }
  }

  return rows;
}
```

Notes:
- `parseStream` from `csv-parse` (no `/sync` suffix) is the streaming implementation. It returns a Node `Transform` stream that emits one object per row.
- Using `for await` on the parser yields control to the event loop between rows. `csv-parse` internally buffers some rows per microtask but never processes the whole file in one synchronous turn.
- We don't wrap with `pipeline()` from `node:stream/promises` because the `for await` already handles backpressure and error propagation. If any stream in the pipe errors, the async iteration rejects with that error.

**Known limitation — mixed-encoding files:** `sniffEncoding` reads only the first 8 KB. If the first 8 KB is pure ASCII (valid UTF-8) and a later chunk contains a Windows-1252 byte (e.g., 0x92 for a curly apostrophe), csv-parse will emit a parse error mid-stream. Real-world CSVs don't change encoding mid-file, so this is unlikely. If it ever happens in production, the failure surfaces with the parser error message — and Phase 06's `/fix-csv` step would have caught it pre-upload anyway. Not worth a retry-with-fallback in this phase.

### 2. Keep `parseCsvBuffer` for backward compatibility

**Files to modify:** `src/server/services/csv-parser.ts`

Find the current `parseCsvBuffer` function (lines 188–198):

```typescript
export function parseCsvBuffer(buffer: Buffer): RawCsvRow[] {
  const text = decodeCsvBuffer(buffer);
  const records = parse(text, {
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as RawCsvRow[];

  return records.filter((row) => row.commentId?.trim());
}
```

Update it to use the renamed sync import:

```typescript
export function parseCsvBuffer(buffer: Buffer): RawCsvRow[] {
  const text = decodeCsvBuffer(buffer);
  const records = parseSync(text, {
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as RawCsvRow[];

  return records.filter((row) => row.commentId?.trim());
}
```

This keeps the function working for any existing callers (tests, scripts). Production upload routes will use `parseCsvFile` directly after step 3.

### 3. Swap upload service to the streaming parser

**Files to modify:** `src/server/services/upload.ts`

Update the import at the top:

```typescript
import { parseCsvFile, decodeEntities, type RawCsvRow } from "./csv-parser.js";
```

(Remove `parseCsvBuffer` from the import list — we're not using it here anymore.)

Also remove the `readFile` usage in both services since we no longer need the buffer:

Update `previewUpload`:

```typescript
export async function previewUpload(
  filePath: string
): Promise<UploadPreviewResult> {
  const rows = await parseCsvFile(filePath);
  // ... rest unchanged
```

Update `commitUpload`:

```typescript
export async function commitUpload(
  filePath: string,
  uploadedById: string,
  institutionId: string,
  originalFilename: string,
  replaceMode = false
): Promise<UploadCommitResult> {
  const rows = await parseCsvFile(filePath);

  // Move the temp file to its permanent location BEFORE the DB transaction.
  // If this fails, we want to fail fast without touching the DB.
  const savedFilePath = await saveUploadedFile(filePath, originalFilename);

  return AppDataSource.transaction(async (manager: EntityManager) => {
    // ... rest unchanged (phase 04 restructures the transaction)
```

Remove the `readFile` import from `upload.ts` if it was added in phase 02 and is now unused — keep only `{ mkdir, rename, unlink }`:

```typescript
import { mkdir, rename, unlink } from "node:fs/promises";
```

### 4. Update imports at the top of csv-parser.ts

**Files to modify:** `src/server/services/csv-parser.ts`

The very first line currently reads:

```typescript
import { parse } from "csv-parse/sync";
```

Replace with the combined import block (which you already added at the top of step 1, but make sure the old `import { parse } from "csv-parse/sync"` line is removed):

```typescript
import { parse as parseStream } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { Transform } from "node:stream";
```

## Verification

### Typecheck

```bash
docker compose exec app pnpm typecheck
```

Expected: exits 0.

### Unit test (smoke)

A full unit-test suite for the parser is in phase 05. For this phase, write a quick ad-hoc check using the Node REPL inside the container:

```bash
docker compose exec app node --input-type=module -e "
import { parseCsvFile } from './src/server/services/csv-parser.ts';
const path = 'test/fixtures/ai-chat-report.csv';
try {
  const rows = await parseCsvFile(path);
  console.log('ok, rows=' + rows.length, 'first commentId=' + rows[0]?.commentId);
} catch (err) {
  console.error('parseCsvFile threw:', err);
  process.exit(1);
}
"
```

(Skip this step if no existing test fixture is present — phase 05 generates one.)

### Event-loop-blocking check

Boot the app and confirm the event loop stays responsive during a large upload. A second HTTP request to `/api/health` (or any unauth'd endpoint) should respond within ~200 ms even while a big upload is being parsed. The exact measurement is covered in phase 06 — for now, just confirm there are no obvious synchronous stalls in the logs.

## When done

Report:
- Files modified (two: `src/server/services/csv-parser.ts`, `src/server/services/upload.ts`).
- Output of `pnpm typecheck`.
- Confirmation that `parseCsvBuffer` is still exported (for backward compat) and that `parseCsvFile` is the new primary entry point.
- Confirmation that both `previewUpload` and `commitUpload` call `parseCsvFile` directly (no intermediate `readFile` + `parseCsvBuffer`).
- Any surprises — especially if `csv-parse`'s streaming types required an `AsyncIterable` cast.

**Commit this phase:**

```bash
git add src/server/services/csv-parser.ts src/server/services/upload.ts
git commit -m "feat(upload): phase 03 - stream-parse CSV files instead of synchronous buffer parse"
```
