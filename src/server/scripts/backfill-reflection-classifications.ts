/**
 * Backfill reflection classifications for every USER comment that doesn't
 * already have one.
 *
 * Idempotent: re-running the script picks up where it left off. Safe to
 * Ctrl-C — every successful classification is committed in its own
 * transaction.
 *
 * Usage (local dev):
 *   docker compose exec app pnpm tsx src/server/scripts/backfill-reflection-classifications.ts
 *
 * Usage (Railway prod):
 *   railway run -- pnpm tsx src/server/scripts/backfill-reflection-classifications.ts
 *
 * Requires GOOGLE_AI_API_KEY in the environment.
 */
import "reflect-metadata";
import { AppDataSource } from "../data-source.js";
import { Comment, CommentRole } from "../entities/Comment.js";
import { CommentReflectionClassification } from "../entities/CommentReflectionClassification.js";
import {
  classifyComment,
  CLASSIFIER_VERSION,
  ClassifierError,
} from "../services/reflection/classifier.js";

// Small delay between calls so we don't get rate-limited by Gemini.
const DELAY_BETWEEN_CALLS_MS = 250;
const PROGRESS_EVERY = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.error("GOOGLE_AI_API_KEY is not set — cannot run backfill.");
    process.exit(1);
  }

  await AppDataSource.initialize();
  const commentRepo = AppDataSource.getRepository(Comment);
  const classificationRepo = AppDataSource.getRepository(
    CommentReflectionClassification
  );

  // Find all USER comments that don't yet have a classification.
  // We use a LEFT JOIN ... IS NULL pattern so the query is idempotent.
  const todo = await commentRepo
    .createQueryBuilder("c")
    .leftJoin(
      "comment_reflection_classification",
      "crc",
      'crc."commentId" = c.id'
    )
    .where("c.role = :role", { role: CommentRole.USER })
    .andWhere("c.text IS NOT NULL AND c.text != ''")
    .andWhere('crc."commentId" IS NULL')
    .select(["c.id", "c.text"])
    .getMany();

  console.log(
    `Backfill: ${todo.length} comments need classification (model=${CLASSIFIER_VERSION})`
  );
  if (todo.length === 0) {
    await AppDataSource.destroy();
    return;
  }

  let succeeded = 0;
  let failed = 0;
  const failures: { commentId: string; error: string }[] = [];

  for (let i = 0; i < todo.length; i++) {
    const comment = todo[i];
    try {
      const result = await classifyComment(comment.text);
      await classificationRepo.save({
        commentId: comment.id,
        category: result.category,
        evidenceQuote: result.evidenceQuote,
        rationale: result.rationale,
        confidence: result.confidence,
        classifierVersion: CLASSIFIER_VERSION,
      });
      succeeded++;
    } catch (e) {
      failed++;
      const msg =
        e instanceof ClassifierError
          ? `${e.message}${e.raw ? ` | raw=${e.raw.slice(0, 200)}` : ""}`
          : (e as Error).message;
      failures.push({ commentId: comment.id, error: msg });
      console.warn(`  [skip] ${comment.id}: ${msg}`);
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === todo.length - 1) {
      console.log(
        `  progress: ${i + 1}/${todo.length} (${succeeded} ok, ${failed} failed)`
      );
    }

    if (i < todo.length - 1) {
      await sleep(DELAY_BETWEEN_CALLS_MS);
    }
  }

  console.log("");
  console.log(`Done. ok=${succeeded}, failed=${failed}`);
  if (failures.length > 0) {
    console.log("First 10 failures:");
    for (const f of failures.slice(0, 10)) {
      console.log(`  - ${f.commentId}: ${f.error}`);
    }
    console.log("Re-run the script to retry the failures (it's idempotent).");
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error("Backfill aborted:", err);
  process.exit(1);
});
