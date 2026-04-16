import "reflect-metadata";
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSchema, createYoga } from "graphql-yoga";
import { toNodeHandler } from "better-auth/node";
import { fromNodeHeaders } from "better-auth/node";
import { AppDataSource } from "./data-source.js";
import { auth } from "./auth.js";
import { seedToriTags } from "./seeds/tori-tags.js";
import { seedToriFrameworks } from "./services/evidence/seed-tori-framework.js";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "./middleware/auth.js";
import { User } from "./entities/User.js";
import { previewUpload, commitUpload } from "./services/upload.js";
import { classifyUserCommentsInBackground } from "./services/reflection/ingest-hook.js";
import { generateEvidenceInBackground } from "./services/evidence/evidence-pipeline.js";
import {
  createArtifactFromUpload,
  canReadArtifact,
  MAX_UPLOAD_BYTES,
  UploadAuthError,
  UploadValidationError,
} from "./services/artifact/artifact-service.js";
import { resolveArtifactPath } from "./services/artifact/artifact-storage.js";
import { Artifact, ArtifactType } from "./entities/Artifact.js";
import { Student } from "./entities/Student.js";
import { typeDefs } from "./types/schema.js";
import { resolvers } from "./resolvers/index.js";
import type { GraphQLContext } from "./types/context.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// File upload middleware — stores files in memory (max 50 MB).
// Used for CSV uploads.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Separate upload middleware for artifact files (PDF/DOCX), capped at
// 20 MB per the Phase 3 spec. Kept distinct from the CSV uploader so
// the limits are visible at the mount point.
const artifactUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

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

// Notify admin when an uninvited user's sign-in was blocked.
// Called by the frontend when it detects a sign-up-disabled error.
app.post("/api/notify-blocked-signin", express.json(), async (req, res) => {
  const { name, email } = req.body || {};
  if (email) {
    try {
      const { notifyAdminOfBlockedSignIn } = await import("./auth.js");
      await notifyAdminOfBlockedSignIn(name || "Unknown", email);
    } catch (err) {
      console.error("[auth] Failed to send blocked sign-in notification:", err);
    }
  }
  res.json({ ok: true });
});

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

// Commit — actually processes and stores the CSV data
app.post(
  "/api/upload/commit",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
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

      // Fire-and-forget narrative evidence generation (Phase 2).
      // Runs after reflection classification kicks off — both are independent
      // background tasks that don't block the upload response.
      void generateEvidenceInBackground(
        result.newUserCommentIds,
        institutionId
      ).catch((err) => {
        console.error("[evidence] background generation failed:", err);
      });

      res.json(result);
    } catch (err) {
      console.error("Upload commit error:", err);
      res.status(500).json({ error: "Failed to commit upload" });
    }
  }
);

// ── Artifact endpoints ───────────────────────────────────────────

// Upload a PDF or DOCX artifact. Faculty supply `studentId` explicitly
// in the form; students may only upload for themselves (the route looks
// up their Student record by user id).
app.post(
  "/api/artifacts/upload",
  requireAuth,
  artifactUpload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      if (!req.user?.id) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      // Student uploads: auto-resolve the Student record from the signed-in user.
      let studentId: string | undefined = req.body?.studentId?.trim() || undefined;
      if (req.user.role === "student") {
        const studentRepo = AppDataSource.getRepository(Student);
        const student = await studentRepo.findOne({
          where: { userId: req.user.id },
        });
        if (!student) {
          res
            .status(400)
            .json({ error: "No student record linked to your account" });
          return;
        }
        // A student cannot upload on behalf of anyone else.
        studentId = student.id;
      }

      const courseId: string | undefined = req.body?.courseId?.trim() || undefined;
      const assignmentId: string | null =
        req.body?.assignmentId?.trim() || null;
      const title: string | null = req.body?.title?.trim() || null;
      const rawType = (req.body?.type as string | undefined)?.toUpperCase();
      const type =
        rawType && rawType in ArtifactType
          ? (ArtifactType[rawType as keyof typeof ArtifactType] as ArtifactType)
          : ArtifactType.PAPER;

      if (!studentId || !courseId) {
        res.status(400).json({ error: "studentId and courseId are required" });
        return;
      }

      const result = await createArtifactFromUpload({
        userId: req.user.id,
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        studentId,
        courseId,
        assignmentId,
        type,
        title,
      });

      // TODO (Step 4): kick off the background analyzer with result.id.
      res.json(result);
    } catch (err) {
      if (err instanceof UploadValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof UploadAuthError) {
        res.status(403).json({ error: err.message });
        return;
      }
      console.error("Artifact upload error:", err);
      res.status(500).json({ error: "Failed to upload artifact" });
    }
  }
);

// Download the original file for an artifact. Auth gate mirrors the
// upload rules: students only see their own artifacts, instructors
// need a CourseAccess row, admins can see anything in their institution.
app.get(
  "/api/artifacts/:id/download",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const artifactId = String(req.params.id);
      const artifactRepo = AppDataSource.getRepository(Artifact);
      const artifact = await artifactRepo.findOne({
        where: { id: artifactId },
      });
      if (!artifact) {
        res.status(404).json({ error: "Artifact not found" });
        return;
      }
      if (!artifact.storagePath) {
        res.status(404).json({ error: "Artifact has no stored file" });
        return;
      }

      const allowed = await canReadArtifact(
        { id: req.user.id, role: req.user.role, institutionId: req.user.institutionId },
        artifact
      );
      if (!allowed) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }

      const absolutePath = resolveArtifactPath(artifact.storagePath);
      const downloadName = artifact.title
        ? `${artifact.title}${getExtension(artifact.mimeType)}`
        : `artifact-${artifact.id}${getExtension(artifact.mimeType)}`;
      res.download(absolutePath, downloadName, (err) => {
        if (err) {
          console.error("Artifact download error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to read artifact file" });
          }
        }
      });
    } catch (err) {
      console.error("Artifact download error:", err);
      res.status(500).json({ error: "Failed to download artifact" });
    }
  }
);

function getExtension(mimeType: string | null): string {
  if (mimeType === "application/pdf") return ".pdf";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return ".docx";
  return "";
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
    await seedToriFrameworks();

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
