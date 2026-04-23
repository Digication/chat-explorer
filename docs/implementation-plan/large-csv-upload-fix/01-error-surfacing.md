# Phase 01 — Error Surfacing

You are adding proper error messages to the CSV upload endpoints for the chat-explorer project.

**Context:** Today, `src/server/index.ts` has two upload routes (`POST /api/upload/preview` and `POST /api/upload/commit`) that catch every error and return `{ error: "Failed to commit upload" }` with status 500 (see lines 107–110 and 153–156 of `src/server/index.ts`). This hides three real error modes that are about to become more common as we raise the file-size limit:

1. **Multer `LIMIT_FILE_SIZE`** — thrown by multer middleware when a request body exceeds the configured cap. The handler function never runs for this error, so the existing try/catch in the route cannot see it. It falls through to Express's default error handler and ends up as a generic 500.
2. **Parser errors** (encoding, malformed rows) — today these are subclasses of `Error`. They hit the catch block but only the generic string is returned.
3. **Database errors** (timeouts, lock contention, constraint violations) — same as parser errors: caught but masked.

No prior phases — this is the first phase. No dependencies.

## Overview

- Add a typed Express error-handling middleware that runs after the upload routes.
- Distinguish multer errors by their `code` (`LIMIT_FILE_SIZE` → 413, others → 400).
- Replace the per-route try/catch bodies so the real error name, code, and message are included in the JSON response body (always log the full stack server-side).
- Leave the response shape backward-compatible: the existing client at `src/components/upload/CsvUploadCard.tsx:80` reads `data.error`, so we keep that field and simply enrich it.

## Steps

### 1. Add a typed error handler middleware

**Files to modify:** `src/server/index.ts`

At the top of the file, add a `MulterError` import:

```typescript
import multer from "multer";
// ...existing imports...
```

`multer`'s `MulterError` is exposed as `multer.MulterError` (a class). We will test errors with `err instanceof multer.MulterError`.

Find the block that defines the upload middleware (around lines 29–33 — begins with `// File upload middleware — stores files in memory (max 50 MB)`). **Leave multer config alone in this phase** — phase 02 handles the cap and storage.

Immediately **after** both upload routes are declared (after the `commitUpload` route ends around line 158), insert this new error-handling middleware. It MUST come AFTER the routes to intercept their errors:

```typescript
// ── Upload error handler ─────────────────────────────────────────
// Runs when a multer middleware rejects the request (e.g. file too large)
// or when an upload route's async handler throws. Must be declared AFTER the
// upload routes so Express routes errors from those routes to this handler.
//
// Returns the real error message in the response body so the client can show
// it to the user. Falls back to a generic message only when the error has no
// usable message string.
app.use(
  "/api/upload",
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: express.NextFunction
  ) => {
    // Always log the full error server-side. This is our only record if the
    // user reports a failure, so include enough detail to diagnose.
    console.error("[upload] error:", err);

    // Multer-specific errors carry a .code we can map to a status.
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `File is too large. Maximum size is ${formatBytes(UPLOAD_MAX_BYTES)}.`
          : err.message;
      res.status(status).json({
        error: message,
        code: err.code,
      });
      return;
    }

    // Any other error — return a 500 with the real message and name so the
    // user can see what went wrong (and we can copy it into a bug report).
    const e = err as { message?: string; name?: string; code?: string };
    res.status(500).json({
      error: e.message || "Upload failed",
      name: e.name,
      code: e.code,
    });
  }
);

// Helper used by the upload error handler.
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb)} MB` : `${bytes} bytes`;
}
```

**ALSO** declare `UPLOAD_MAX_BYTES` near the top of the file (right above the existing multer config block), even though phase 02 is the one that actually wires it into multer. Putting the constant in this phase means phase 02's only job is to change the storage type and the constant's number — it can't accidentally leave the error message and the actual cap out of sync. Add right above the multer config:

```typescript
// Upload size cap — multer rejects anything larger with LIMIT_FILE_SIZE,
// which the upload error handler maps to a 413 with a human-readable message.
// Phase 02 changes this to 250 MB when disk storage is wired in.
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
```

And update the multer config to reference it:

```typescript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES },
});
```

Notes:
- The `app.use("/api/upload", ...)` path prefix limits this handler to the upload routes only — other routes (GraphQL, auth) keep their existing behavior.
- The function signature has **four arguments** (`err, req, res, next`) — that's how Express distinguishes error handlers from regular middleware. Do NOT collapse it to three args.
- `UPLOAD_MAX_BYTES` is declared once, used by both multer's `limits` and the error handler's message — no duplicate constants to keep in sync.

**Critical ordering check:** the error handler MUST be declared in the source AFTER both `app.post("/api/upload/preview", ...)` and `app.post("/api/upload/commit", ...)`. After editing, run this check:

```bash
grep -n 'app.post("/api/upload/\|app.use("/api/upload"' src/server/index.ts
```

The two `app.post` lines must appear before the `app.use("/api/upload"` line. If they don't, Express will not route errors from those routes to the handler.

### 2. Simplify the route handlers

**Files to modify:** `src/server/index.ts`

The existing handlers have a try/catch that logs and returns a generic 500. With the error middleware in place, we should delete those local try/catch blocks and let errors bubble to the middleware. This makes the 500 path use the new handler and guarantees consistent error shape.

Replace the preview handler (current lines ~90–112). Find:

```typescript
app.post(
  "/api/upload/preview",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      if (!req.file.originalname.endsWith(".csv")) {
        res.status(400).json({ error: "Only .csv files are accepted" });
        return;
      }

      const result = await previewUpload(req.file.buffer);
      res.json(result);
    } catch (err) {
      console.error("Upload preview error:", err);
      res.status(500).json({ error: "Failed to preview upload" });
    }
  }
);
```

Replace with:

```typescript
app.post(
  "/api/upload/preview",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      if (!req.file.originalname.endsWith(".csv")) {
        res.status(400).json({ error: "Only .csv files are accepted" });
        return;
      }

      const result = await previewUpload(req.file.buffer);
      res.json(result);
    } catch (err) {
      // Forward to the upload error handler so the real message reaches the client
      next(err);
    }
  }
);
```

Replace the commit handler (current lines ~115–158). Find the block starting `app.post("/api/upload/commit"`. Replace its try/catch with the same `next(err)` pattern:

```typescript
app.post(
  "/api/upload/commit",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
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
        req.file.buffer,
        req.user!.id,
        institutionId,
        req.file.originalname,
        replaceMode
      );

      // Fire-and-forget reflection classification (Plan 3 / Hatton & Smith).
      // Runs outside the upload transaction so a slow LLM call cannot hold
      // DB locks. Failures are logged inside the hook and never affect the
      // upload response. The backfill script is the safety net.
      void classifyUserCommentsInBackground(result.newUserCommentIds).catch(
        (err) => {
          console.error("[reflection] background classification failed:", err);
        }
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);
```

The only behavioral differences from the current code:
- `next` is added to the parameter list.
- The catch block forwards the error via `next(err)` instead of sending a response directly.
- `commitUpload(req.file.buffer, ...)` call is UNCHANGED in this phase — phase 02 changes it.

## Verification

```bash
docker compose exec app pnpm typecheck
```

Expected: exits 0 with no errors.

Manual smoke test — try uploading a non-CSV file via curl against the running dev server:

```bash
# From the host, against the running app. Sign in first to get a session cookie;
# for now, a simple request without auth should return 401, which also exercises
# the error path. A more thorough smoke test belongs in phase 06.
curl -k -sS -o /dev/stderr -w "status=%{http_code}\n" \
  -X POST https://chat-explorer.localhost/api/upload/preview \
  -F "file=@package.json"
```

Expected: `status=401` (from `requireAuth`, unchanged). No crash, no unhandled-promise warnings in `docker compose logs chat-explorer`.

## When done

Report:
- Files modified (`src/server/index.ts`) with a one-line summary of what changed in each.
- Output of `pnpm typecheck`.
- Confirmation that the error middleware is declared AFTER both upload routes (paste the `grep -n` output from the ordering check).
- Any surprises (e.g., if `multer.MulterError` had to be imported differently).

**Commit this phase:**

```bash
git add src/server/index.ts
git commit -m "fix(upload): phase 01 - surface real error messages from upload endpoints"
```
