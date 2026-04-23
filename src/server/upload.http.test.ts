import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { openAsBlob } from "node:fs";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:4000";

interface TestSession {
  userId: string;
  email: string;
  institutionId: string;
  sessionToken: string;
  cookieName: string;
  cookieValue: string;
}

async function createTestSession(): Promise<TestSession> {
  // Spawn the session-creation script; parse the JSON it prints.
  return new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ["scripts/create-test-session.mjs"],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    let out = "";
    p.stdout.on("data", (c) => (out += c.toString()));
    p.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`session script exited ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function generateSyntheticCsv(outPath: string, rows = 100): Promise<void> {
  // Pass a time-based offset so repeated runs don't collide on comment IDs.
  // The generator accepts: outPath rowCount bigTextChars shape commentOffset entityOffset
  const commentOffset = Date.now() % 10_000_000; // wrap to stay within int range
  const entityOffset = commentOffset;
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        "scripts/generate-synthetic-csv.mjs",
        outPath,
        String(rows),
        "0",           // bigTextChars (keep small for speed)
        "many-assignments", // shape
        String(commentOffset),
        String(entityOffset),
      ],
      { stdio: "inherit" }
    );
    p.on("exit", (c) =>
      c === 0 ? resolve() : reject(new Error(`generator exited ${c}`))
    );
  });
}

let session: TestSession;
let tempDir: string;
let fixturePath: string;

beforeAll(async () => {
  session = await createTestSession();
  tempDir = await mkdtemp(join(tmpdir(), "upload-http-"));
  fixturePath = join(tempDir, "synthetic.csv");
  await generateSyntheticCsv(fixturePath, 100);
}, 60_000);

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("POST /api/upload/preview", () => {
  it("returns 401 without a session cookie", async () => {
    const form = new FormData();
    form.append(
      "file",
      await openAsBlob(fixturePath),
      "synthetic.csv"
    );
    const res = await fetch(`${BASE_URL}/api/upload/preview`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when file is not a CSV", async () => {
    const txtPath = join(tempDir, "notacsv.txt");
    await writeFile(txtPath, "hello world");

    const form = new FormData();
    form.append("file", await openAsBlob(txtPath), "notacsv.txt");

    const res = await fetch(`${BASE_URL}/api/upload/preview`, {
      method: "POST",
      body: form,
      headers: {
        Cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/csv/i);
  });

  it("returns 200 with preview counts when authenticated", async () => {
    const form = new FormData();
    form.append("file", await openAsBlob(fixturePath), "synthetic.csv");

    const res = await fetch(`${BASE_URL}/api/upload/preview`, {
      method: "POST",
      body: form,
      headers: {
        Cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRows).toBeGreaterThan(0);
    expect(body.newComments).toBeGreaterThan(0);
  }, 30_000);
});

describe("POST /api/upload/commit", () => {
  it("commits the CSV and returns result counts", async () => {
    const form = new FormData();
    form.append("file", await openAsBlob(fixturePath), "synthetic.csv");
    form.append("institutionId", session.institutionId);

    const res = await fetch(`${BASE_URL}/api/upload/commit`, {
      method: "POST",
      body: form,
      headers: {
        Cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newComments).toBeGreaterThan(0);
    expect(body.uploadLogId).toBeTruthy();
  }, 60_000);

  it("surfaces a useful error message on failure", async () => {
    // Empty form → multer throws "MulterError: Unexpected field" OR the route
    // rejects with "No file provided". Either way, the response body should
    // include an error field with a real message (not just "Failed to commit").
    const res = await fetch(`${BASE_URL}/api/upload/commit`, {
      method: "POST",
      body: new FormData(),
      headers: {
        Cookie: `${session.cookieName}=${session.cookieValue}`,
      },
    });

    expect([400, 500]).toContain(res.status);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.error).not.toBe("Failed to commit upload"); // Phase 01's fix
  });
});
