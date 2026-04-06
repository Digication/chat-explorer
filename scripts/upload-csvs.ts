/**
 * CLI script to upload CSV files directly, bypassing HTTP auth.
 * Run inside Docker: docker compose exec app npx tsx scripts/upload-csvs.ts
 */
import "reflect-metadata";
import { readFileSync } from "fs";
import { AppDataSource } from "../src/server/data-source.js";
import { previewUpload, commitUpload } from "../src/server/services/upload.js";

const FILES = [
  "/app/downloads/ai-chat-report-7139-2026-04-05.csv",
  "/app/downloads/ai-chat-report-2915-2026-04-05.csv",
  "/app/downloads/ai-chat-report-3279-2026-04-05.csv",
];

const USER_ID = "UGxurCenuD9n97aYM5GWyce1vzoFurZO";

async function main() {
  await AppDataSource.initialize();
  console.log("DB connected");

  for (const filePath of FILES) {
    const filename = filePath.split("/").pop()!;
    console.log(`\nUploading: ${filename}`);

    const buffer = readFileSync(filePath);

    // Preview first to detect the institution
    const preview = await previewUpload(buffer);
    const institutionId = preview.detectedInstitutionId;
    if (!institutionId) {
      console.log(`  SKIPPED — could not detect institution`);
      continue;
    }
    console.log(`  Institution: ${preview.detectedInstitutionName} (${institutionId})`);

    const result = await commitUpload(
      buffer,
      USER_ID,
      institutionId,
      filename
    );

    console.log(`  New comments: ${result.newComments}`);
    console.log(`  New threads: ${result.newThreads}`);
    console.log(`  New students: ${result.newStudents}`);
    console.log(`  New courses: ${result.newCourses}`);
    console.log(`  New assignments: ${result.newAssignments}`);
    console.log(`  TORI tags: ${result.toriTagsExtracted}`);
    console.log(`  Duplicates: ${result.duplicateComments}`);
  }

  await AppDataSource.destroy();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
