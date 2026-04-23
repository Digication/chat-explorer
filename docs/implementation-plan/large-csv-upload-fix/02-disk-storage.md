# Phase 02 — Disk Storage + 250 MB Cap

You are switching multer from in-memory storage to disk storage and raising the file-size limit from 50 MB to 250 MB for the chat-explorer project's CSV upload endpoints.

**Context:** Phase 01 added an Express error-handling middleware at `/api/upload` in `src/server/index.ts` that surfaces multer errors (including `LIMIT_FILE_SIZE`) to the client with proper status codes. Phase 01 also changed the route handlers to forward errors via `next(err)` instead of sending their own 500s. The multer config is still the original `multer.memoryStorage()` with a 50 MB limit (lines ~29–33). The services `previewUpload` and `commitUpload` in `src/server/services/upload.ts` currently accept a `Buffer` as their first argument — we are changing that to a file path in this phase.

## Overview

- Switch multer from `memoryStorage()` to `diskStorage()` writing temp files under `data/uploads/tmp/`.
- Raise the cap from 50 MB to 250 MB by changing `UPLOAD_MAX_BYTES` (already declared in Phase 01).
- Change `previewUpload(buffer, ...)` → `previewUpload(filePath, ...)` and `commitUpload(buffer, ...)` → `commitUpload(filePath, ...)`. `parseCsvBuffer(buffer)` stays as-is in this phase — phase 03 changes it.
- Update `saveUploadedFile` to **rename** the temp file into its permanent location instead of writing a new file. This avoids reading the 75 MB file into memory a second time.
- Clean up the preview temp file after the preview response is sent (success or error). Clean up the commit temp file on error only; on success, `saveUploadedFile` renames it into place.

**Note on `.gitignore`:** the existing `.gitignore` already has `data/uploads/` (line 10), which transitively covers the new `data/uploads/tmp/` subdirectory. No `.gitignore` change is needed in this phase.

## Steps

### 1. Switch multer to disk storage and raise the cap

**Files to modify:** `src/server/index.ts`

Find the block (around lines 29–33):

```typescript
// File upload middleware — stores files in memory (max 50 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});
```

Replace with:

```typescript
// File upload middleware — streams uploads to disk so we never hold the
// full file in RAM. Temp files land in data/uploads/tmp/ and are either
// moved to their final location (on successful commit) or deleted (on
// preview completion / commit failure / any other error).
//
// The 250 MB cap matches real-world CSVs we've seen (75 MB, ~250k rows
// with large pasted-paper content in some cells). Multer will reject
// anything larger with LIMIT_FILE_SIZE, which Phase 01's error handler
// maps to a 413 with a human-readable message.
const UPLOAD_TMP_DIR = path.join(process.cwd(), "data", "uploads", "tmp");

// Ensure the tmp dir exists at boot. multer.diskStorage uses it as a
// destination; if it's missing, multer throws ENOENT on the first upload.
// Top-level await is supported in this project (Node 24 + ESM).
await fs.mkdir(UPLOAD_TMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_TMP_DIR),
    filename: (_req, file, cb) => {
      // Random name so concurrent uploads can't collide. The original filename
      // is preserved on req.file.originalname and passed to commitUpload.
      const id = randomUUID();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${id}__${safeName}`);
    },
  }),
  limits: { fileSize: UPLOAD_MAX_BYTES },
});
```

**Note:** `UPLOAD_MAX_BYTES` was already declared in Phase 01 (currently `50 * 1024 * 1024`). Update its value to `250 * 1024 * 1024`:

```typescript
// (Already declared in Phase 01 — change the value to 250 MB.)
const UPLOAD_MAX_BYTES = 250 * 1024 * 1024;
```

The error handler from Phase 01 already references this constant via `formatBytes(UPLOAD_MAX_BYTES)`, so the 413 message updates automatically.

Add the new imports at the top of the file (if not already present):

```typescript
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { unlink } from "node:fs/promises";
```

`path` is already imported on line 7.

After this change, the 413 message automatically reads `"File is too large. Maximum size is 250 MB."` because Phase 01's error handler reads `UPLOAD_MAX_BYTES` directly via `formatBytes()`.

### 2. Add a helper to clean up temp files

**Files to modify:** `src/server/index.ts`

Add this helper near the multer config:

```typescript
// Best-effort temp file cleanup. We call this after preview responses and
// on error paths so tmp files don't accumulate. Never throws — if the file
// is already gone (e.g., already moved by saveUploadedFile), we log and move
// on. Used by both upload routes and tests.
async function cleanupTempUpload(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    // ENOENT means the file was already moved or cleaned up — not an error.
    if (code !== "ENOENT") {
      console.warn("[upload] failed to clean up temp file:", filePath, err);
    }
  }
}
```

### 3. Update `previewUpload` and `commitUpload` signatures

**Files to modify:** `src/server/services/upload.ts`

Change both functions to accept a file path instead of a buffer. The CSV parser still expects a buffer in this phase (phase 03 converts it to streaming), so we read the file into a buffer inside the service. This is a temporary step — phase 03 removes this read.

Find the `previewUpload` signature (around line 205):

```typescript
export async function previewUpload(
  fileBuffer: Buffer
): Promise<UploadPreviewResult> {
  const rows = parseCsvBuffer(fileBuffer);
  // ... rest unchanged
```

Replace with:

```typescript
import { readFile, rename } from "node:fs/promises";
// ...place this with the other node: imports at the top of the file...

export async function previewUpload(
  filePath: string
): Promise<UploadPreviewResult> {
  // Phase 03 will replace this with a streaming parseCsvFile(filePath).
  // For now we read the file into a buffer so parseCsvBuffer keeps working.
  const fileBuffer = await readFile(filePath);
  const rows = parseCsvBuffer(fileBuffer);
  // ... rest unchanged
```

Find the `commitUpload` signature (around line 276):

```typescript
export async function commitUpload(
  fileBuffer: Buffer,
  uploadedById: string,
  institutionId: string,
  originalFilename: string,
  replaceMode = false
): Promise<UploadCommitResult> {
  const rows = parseCsvBuffer(fileBuffer);

  // Save the original CSV to disk so we always have the raw source file
  const savedFilePath = await saveUploadedFile(fileBuffer, originalFilename);
  // ... rest unchanged (the big AppDataSource.transaction call)
```

Replace with:

```typescript
export async function commitUpload(
  filePath: string,
  uploadedById: string,
  institutionId: string,
  originalFilename: string,
  replaceMode = false
): Promise<UploadCommitResult> {
  // Phase 03 will replace this with streaming parseCsvFile(filePath).
  const fileBuffer = await readFile(filePath);
  const rows = parseCsvBuffer(fileBuffer);

  // Move the temp file to its permanent location. Keeps the original CSV on
  // disk for debugging and re-processing, but without a second in-memory copy.
  const savedFilePath = await saveUploadedFile(filePath, originalFilename);
  // ... rest unchanged
```

### 4. Rewrite `saveUploadedFile` to rename the temp file

**Files to modify:** `src/server/services/upload.ts`

Find the current implementation (around lines 24–41):

```typescript
async function saveUploadedFile(
  buffer: Buffer,
  originalFilename: string
): Promise<string> {
  const now = new Date();
  const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = join(UPLOADS_DIR, monthDir);
  await mkdir(dir, { recursive: true });

  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${randomUUID()}_${safeName}`;
  const filePath = join(dir, filename);
  await writeFile(filePath, buffer);

  return `data/uploads/${monthDir}/${filename}`;
}
```

Replace with:

```typescript
async function saveUploadedFile(
  tempPath: string,
  originalFilename: string
): Promise<string> {
  const now = new Date();
  const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = join(UPLOADS_DIR, monthDir);
  await mkdir(dir, { recursive: true });

  const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${randomUUID()}_${safeName}`;
  const destPath = join(dir, filename);

  // rename() is atomic within the same filesystem and does not load the file
  // into memory. If tempPath and destPath are on different filesystems we
  // fall back to a copy+unlink (rare — only happens if /tmp is a separate
  // mount), which still streams and doesn't hold the file in RAM.
  try {
    await rename(tempPath, destPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      // Cross-device: fall back to streaming copy.
      const { createReadStream, createWriteStream } = await import("node:fs");
      const { pipeline } = await import("node:stream/promises");
      await pipeline(createReadStream(tempPath), createWriteStream(destPath));
      await unlink(tempPath);
    } else {
      throw err;
    }
  }

  return `data/uploads/${monthDir}/${filename}`;
}
```

Remove the `writeFile` import from the top of `upload.ts` — it's no longer needed (just keep `mkdir`, `rename`, `unlink`, `readFile` as needed):

```typescript
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
```

Also remove the `randomUUID` import if it's only used by `saveUploadedFile` — it is still used there for the filename, so keep it.

### 5. Update route handlers to pass the file path and clean up

**Files to modify:** `src/server/index.ts`

Update the preview handler to pass `req.file.path` and clean up the temp file after sending the response:

```typescript
app.post(
  "/api/upload/preview",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    const tempPath = req.file?.path;
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      if (!req.file.originalname.endsWith(".csv")) {
        res.status(400).json({ error: "Only .csv files are accepted" });
        return;
      }

      const result = await previewUpload(req.file.path);
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      // Preview never keeps the file — clean up whether the preview
      // succeeded or failed. The client will re-upload for commit.
      await cleanupTempUpload(tempPath);
    }
  }
);
```

Update the commit handler similarly. The `moved` flag tracks whether `saveUploadedFile` ran successfully (which renames the temp file out of `tmp/`). On success, the file has been moved into `data/uploads/<month>/` and we DO NOT want to delete it — it's the kept-for-debugging copy. On failure before the move, the temp file is still in `tmp/` and we DO want to clean it up.

**Subtle case to be aware of:** if `commitUpload` throws AFTER `saveUploadedFile` (e.g., DB write fails), the temp file has already been moved into `data/uploads/<month>/`. The `moved` flag is still `false` at that point because we only set it after the full `commitUpload` returns successfully. Cleanup will then try to `unlink(tempPath)` and get ENOENT — which `cleanupTempUpload` handles silently. The kept file stays in `data/uploads/<month>/` as an orphan with no UploadLog row pointing at it. That's acceptable (the file IS valuable for debugging the failure) but it does mean orphaned files can accumulate over time. If this becomes a problem, the cleanup could be refined to use a "savedFilePath was returned" signal instead of "moved happened" — out of scope here.

```typescript
app.post(
  "/api/upload/commit",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    const tempPath = req.file?.path;
    let moved = false;
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const institutionId = req.body?.institutionId || req.user!.institutionId;
      if (!institutionId) {
        res.status(400).json({ error: "Institution ID required" });
        return;
      }

      const replaceMode = req.body?.replaceMode === "true";

      const result = await commitUpload(
        req.file.path,
        req.user!.id,
        institutionId,
        req.file.originalname,
        replaceMode
      );

      // commitUpload succeeded → saveUploadedFile renamed the temp file out
      // of tmp/ into data/uploads/<month>/. No cleanup needed.
      moved = true;

      void classifyUserCommentsInBackground(result.newUserCommentIds).catch(
        (err) => {
          console.error("[reflection] background classification failed:", err);
        }
      );

      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      // If commit failed before saveUploadedFile ran, the temp file is
      // still in tmp/ — delete it. If commit succeeded, moved is true
      // and we skip the cleanup.
      if (!moved) {
        await cleanupTempUpload(tempPath);
      }
    }
  }
);
```

Note: `cleanupTempUpload` must be defined before these handlers (it was added in step 2).

### 6. Verify `.gitignore` (no changes expected)

The existing `.gitignore` already has `data/uploads/` on line 10, which transitively covers the new `data/uploads/tmp/` subdirectory. Confirm with:

```bash
grep -n "data/uploads" .gitignore
```

Expected output includes `10:data/uploads/`. If it does, **do nothing** — no `.gitignore` edit needed. If it doesn't (someone removed it), add the line back.

## Verification

```bash
docker compose exec app pnpm typecheck
```

Expected: exits 0. If you see an error about `previewUpload`/`commitUpload` signatures from other call sites (e.g., a test file or `scripts/upload-direct.mjs`), check those files — the CLI scripts hit the HTTP endpoint, not the service function, so they should be unaffected.

Manual smoke test — boot the app and upload a small CSV:

```bash
docker compose up -d --build
docker compose logs -f chat-explorer &
LOG_PID=$!

# (Sign in via browser first to get a session cookie, or use an existing dev
# login script. Then curl with the cookie.)
# A proper e2e smoke test is in phase 06; for now, just confirm no crash.

# Stop log tailing when done:
kill $LOG_PID
```

Expected:
- No ENOENT errors mentioning `data/uploads/tmp/`.
- A 413 response (not a 500) if you upload a file >250 MB.
- Small CSV uploads still work end-to-end.
- `ls data/uploads/tmp/` is empty after a successful upload.
- `ls data/uploads/<current-year-month>/` contains the committed CSV.

## When done

Report:
- Files modified (two: `src/server/index.ts`, `src/server/services/upload.ts`).
- Output of `pnpm typecheck`.
- Confirmation that `previewUpload` and `commitUpload` now accept `filePath: string`.
- Confirmation that `data/uploads/tmp/` exists and is empty (not tracked by git).
- `UPLOAD_MAX_BYTES` is now `250 * 1024 * 1024`.
- Any surprises — especially if multer throws a different error type than expected when the disk destination is missing.

**Commit this phase:**

```bash
git add src/server/index.ts src/server/services/upload.ts
git commit -m "fix(upload): phase 02 - switch to disk storage and raise cap to 250 MB"
```
