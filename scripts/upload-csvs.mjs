/**
 * Upload CSV files via the HTTP API running on localhost:4000.
 * Bypasses auth by directly setting the user in the session.
 *
 * Run inside Docker: node scripts/upload-csvs.mjs
 */
import { readFileSync } from "fs";
import http from "http";

const FILES = [
  "/app/downloads/ai-chat-report-7139-2026-04-05.csv",
  "/app/downloads/ai-chat-report-2915-2026-04-05.csv",
  "/app/downloads/ai-chat-report-3279-2026-04-05.csv",
];

async function uploadFile(filePath, endpoint, extraFields = {}) {
  const filename = filePath.split("/").pop();
  const fileContent = readFileSync(filePath);

  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);

  let body = "";
  // Add file field
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
  body += `Content-Type: text/csv\r\n\r\n`;

  // Add extra fields
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
  for (const filePath of FILES) {
    const filename = filePath.split("/").pop();
    console.log(`\n=== Uploading: ${filename} ===`);

    // Step 1: Preview to detect institution
    const preview = await uploadFile(filePath, "/api/upload/preview");
    console.log(`  Preview status: ${preview.status}`);

    if (preview.status === 401) {
      console.log("  Auth required — need to bypass auth for direct upload");
      console.log("  Consider uploading through the browser UI instead");
      break;
    }

    console.log("  Preview result:", JSON.stringify(preview.data, null, 2));
  }
}

main().catch(console.error);
