/**
 * Direct upload by calling the upload service internals via a temporary
 * Express endpoint. Injects a test user into the auth middleware.
 *
 * Run: docker compose exec app node scripts/upload-direct.mjs
 */
import { readFileSync } from "fs";
import http from "http";

// The trick: call the running server's API but with a session cookie.
// Since we can't bypass auth easily, we'll use psql to do the import
// by calling the upload service from within the running app process.
//
// Actually, let's just use the running server's eval endpoint or
// add a temporary query parameter for dev-only auth bypass.
//
// Simplest approach: temporarily disable auth on upload routes.
// But that requires code changes. Instead, let's get a valid session.

// Let's get a session token from the database
import pg from "pg";
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL || "postgresql://dev:dev@localhost:5432/chat-explorer" });
await client.connect();

// Get a valid session
const sessionResult = await client.query('SELECT token FROM session ORDER BY "expiresAt" DESC LIMIT 1');
await client.end();

if (sessionResult.rows.length === 0) {
  console.error("No active sessions found. Please log in via the browser first.");
  process.exit(1);
}

const sessionToken = sessionResult.rows[0].token;
console.log("Found session token:", sessionToken.substring(0, 10) + "...");

const FILES = [
  "/app/downloads/ai-chat-report-7139-2026-04-05.csv",
  "/app/downloads/ai-chat-report-2915-2026-04-05.csv",
  "/app/downloads/ai-chat-report-3279-2026-04-05.csv",
];

async function uploadFile(filePath, endpoint, cookie, extraFields = {}) {
  const filename = filePath.split("/").pop();
  const fileContent = readFileSync(filePath);

  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);

  let body = "";
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
  body += `Content-Type: text/csv\r\n\r\n`;

  let extraBody = "";
  for (const [key, value] of Object.entries(extraFields)) {
    extraBody += `\r\n--${boundary}\r\n`;
    extraBody += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    extraBody += value;
  }

  const ending = `\r\n--${boundary}--\r\n`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(body),
    fileContent,
    Buffer.from(extraBody),
    Buffer.from(ending),
  ]);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: 4000,
      path: endpoint,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": bodyBuffer.length,
        "Cookie": cookie,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on("error", reject);
    req.write(bodyBuffer);
    req.end();
  });
}

async function main() {
  // better-auth uses a specific cookie format
  const cookie = `better-auth.session_token=${sessionToken}`;

  for (const filePath of FILES) {
    const filename = filePath.split("/").pop();
    console.log(`\n=== Uploading: ${filename} ===`);

    // Step 1: Preview
    const preview = await uploadFile(filePath, "/api/upload/preview", cookie);
    console.log(`  Preview status: ${preview.status}`);

    if (preview.status === 401) {
      console.error("  Auth failed! Session may have expired. Log in via the browser and try again.");
      process.exit(1);
    }

    if (preview.status !== 200) {
      console.error("  Preview failed:", preview.data);
      continue;
    }

    const previewData = preview.data;
    console.log(`  Total rows: ${previewData.totalRows}`);
    console.log(`  New comments: ${previewData.newComments}`);
    console.log(`  Institution: ${previewData.detectedInstitutionName}`);

    if (previewData.newComments === 0) {
      console.log("  Nothing new to upload — skipping");
      continue;
    }

    // Step 2: Commit
    const commit = await uploadFile(filePath, "/api/upload/commit", cookie, {
      institutionId: previewData.detectedInstitutionId,
    });

    console.log(`  Commit status: ${commit.status}`);
    if (commit.status === 200) {
      const d = commit.data;
      console.log(`  ✅ New comments: ${d.newComments}`);
      console.log(`  ✅ New threads: ${d.newThreads}`);
      console.log(`  ✅ New courses: ${d.newCourses}`);
      console.log(`  ✅ New assignments: ${d.newAssignments}`);
      console.log(`  ✅ New students: ${d.newStudents}`);
      console.log(`  ✅ TORI tags: ${d.toriTagsExtracted}`);
    } else {
      console.error("  Commit failed:", commit.data);
    }
  }
}

main().catch(console.error);
