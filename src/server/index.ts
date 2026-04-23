import "reflect-metadata";
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { unlink } from "node:fs/promises";
import { createSchema, createYoga } from "graphql-yoga";
import { toNodeHandler } from "better-auth/node";
import { fromNodeHeaders } from "better-auth/node";
import { AppDataSource } from "./data-source.js";
import { auth } from "./auth.js";
import { seedToriTags } from "./seeds/tori-tags.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "./middleware/auth.js";
import { User } from "./entities/User.js";
import { previewUpload, commitUpload } from "./services/upload.js";
import { classifyUserCommentsInBackground } from "./services/reflection/ingest-hook.js";
import { typeDefs } from "./types/schema.js";
import { resolvers } from "./resolvers/index.js";
import type { GraphQLContext } from "./types/context.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// Upload size cap — multer rejects anything larger with LIMIT_FILE_SIZE,
// which the upload error handler maps to a 413 with a human-readable message.
const UPLOAD_MAX_BYTES = 250 * 1024 * 1024;

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

// Allow the dev URL, the production Railway URL, and any extra origins
// supplied via the ALLOWED_ORIGINS env var (comma-separated).
const allowedOrigins = [
  "https://chat-explorer.localhost",
  "http://localhost:4000",
  ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ...(process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) ?? []),
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(cookieParser());

// GET-based Google sign-in redirect. The browser navigates here directly
// on localhost:4000 so the OAuth state cookie is set on the same domain
// where Google's callback will land. Serves a tiny page that auto-submits
// the sign-in request as a POST (which Better Auth requires).
app.get("/auth/login/google", (req, res) => {
  // In production, fall back to the deployed app URL. In dev, fall back to
  // the Caddy-served Vite frontend at chat-explorer.localhost.
  const fallbackCallback =
    process.env.BETTER_AUTH_URL || "https://chat-explorer.localhost";
  const callbackURL = req.query.callbackURL || fallbackCallback;
  res.send(`<!DOCTYPE html>
    <html><body>
      <p>Redirecting to Google...</p>
      <script>
        fetch("/api/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "google", callbackURL: ${JSON.stringify(callbackURL)} }),
          credentials: "include",
        })
          .then(r => r.json())
          .then(d => { if (d.url) window.location.href = d.url; })
          .catch(e => document.body.textContent = "Sign-in failed: " + e.message);
      </script>
    </body></html>`);
});

// Better Auth handles all /api/auth/* routes
app.all("/api/auth/*splat", toNodeHandler(auth));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Upload endpoints ─────────────────────────────────────────────

// Preview — dry-run that returns counts of new vs. duplicate data
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

// Commit — actually processes and stores the CSV data
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

// ── GraphQL API ──────────────────────────────────────────────────
// Mount BEFORE express.json() so the body stream is not consumed
const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
  context: async ({ request }): Promise<GraphQLContext> => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(
          Object.fromEntries(request.headers.entries())
        ),
      });
      if (session) {
        const userRepo = AppDataSource.getRepository(User);
        const fullUser = await userRepo.findOne({
          where: { id: session.user.id },
        });

        // Deactivated users are treated as unauthenticated
        if (fullUser?.deactivated) {
          return { user: null };
        }

        return {
          user: {
            ...session.user,
            role: fullUser?.role ?? "instructor",
            institutionId: fullUser?.institutionId ?? null,
          },
        };
      }
    } catch {
      // Not authenticated
    }
    return { user: null };
  },
  graphqlEndpoint: "/graphql",
  graphiql: process.env.NODE_ENV !== "production",
});

// Yoga is a WHATWG Fetch-compatible handler; bridge to Node.js HTTP
app.use("/graphql", async (req, res) => {
  const url = `http://${req.headers.host}/graphql${req.url === "/" ? "" : req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: req.method === "GET" ? undefined : (req as unknown as ReadableStream),
    // @ts-expect-error -- Node.js duplex option for streaming body
    duplex: "half",
  });

  const response = await yoga.fetch(request);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const buf = await response.arrayBuffer();
  res.end(Buffer.from(buf));
});

// ── Body parsing for non-upload routes ───────────────────────────
app.use(express.json());

// ── Serve the built React frontend in production ────────────────
// In dev, Vite runs on its own port (5173) and proxies to the API.
// In production, Express serves the bundled client from dist/client
// and falls back to index.html for client-side routes.
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // dist/server/index.js -> ../client = dist/client
  const clientDir = path.resolve(__dirname, "../client");

  app.use(express.static(clientDir));

  // SPA fallback: any non-API GET request returns index.html so
  // React Router can handle the route on the client.
  app.get(/^\/(?!api|graphql|auth).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
}

async function main() {
  try {
    await AppDataSource.initialize();
    console.log("Database connected successfully.");

    // Run any pending migrations in production. In dev, TypeORM's
    // synchronize: true (set in data-source.ts) handles schema changes.
    if (process.env.NODE_ENV === "production") {
      const pending = await AppDataSource.showMigrations();
      if (pending) {
        console.log("Running pending migrations...");
        await AppDataSource.runMigrations();
        console.log("Migrations complete.");
      }
    }

    await seedToriTags();

    // Bootstrap: promote a user to digication_admin if BOOTSTRAP_ADMIN_EMAIL
    // is set. This solves the chicken-and-egg problem where no admin exists
    // yet to assign roles via the UI. Remove the env var after first use.
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    if (bootstrapEmail) {
      const userRepo = AppDataSource.getRepository(User);
      const target = await userRepo.findOne({ where: { email: bootstrapEmail } });
      if (target && target.role !== "digication_admin") {
        target.role = "digication_admin" as any;
        await userRepo.save(target);
        console.log(`[bootstrap] Promoted ${bootstrapEmail} to digication_admin`);
      } else if (!target) {
        console.log(`[bootstrap] No user found with email ${bootstrapEmail}`);
      } else {
        console.log(`[bootstrap] ${bootstrapEmail} is already digication_admin`);
      }
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
