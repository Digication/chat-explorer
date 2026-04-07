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
import {
  requireAuth,
  type AuthenticatedRequest,
} from "./middleware/auth.js";
import { User } from "./entities/User.js";
import { previewUpload, commitUpload } from "./services/upload.js";
import { typeDefs } from "./types/schema.js";
import { resolvers } from "./resolvers/index.js";
import type { GraphQLContext } from "./types/context.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// File upload middleware — stores files in memory (max 50 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
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
  const callbackURL = req.query.callbackURL || "https://chat-explorer.localhost";
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

      const result = await commitUpload(
        req.file.buffer,
        req.user!.id,
        institutionId,
        req.file.originalname
      );
      res.json(result);
    } catch (err) {
      console.error("Upload commit error:", err);
      res.status(500).json({ error: "Failed to commit upload" });
    }
  }
);

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

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
