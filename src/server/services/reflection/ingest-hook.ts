/**
 * Post-upload hook: classifies newly ingested USER comments into Hatton
 * & Smith reflection categories.
 *
 * This runs OUTSIDE the upload transaction, so a slow Gemini call can't
 * hold DB locks or roll back the upload. It's called fire-and-forget by
 * the upload route — the upload response returns immediately and the
 * classifications appear in the database as the model finishes them.
 *
 * Failures are best-effort: a single comment failing to classify is
 * logged but does not stop the rest of the batch. The backfill script
 * (`scripts/backfill-reflection-classifications.ts`) is the safety net
 * for any comments that slip through here.
 */
import { AppDataSource } from "../../data-source.js";
import { Comment, CommentRole } from "../../entities/Comment.js";
import { CommentReflectionClassification } from "../../entities/CommentReflectionClassification.js";
import {
  classifyComment,
  CLASSIFIER_VERSION,
  ClassifierError,
} from "./classifier.js";
import { isDoneMessage } from "../tori-extractor.js";

const DELAY_BETWEEN_CALLS_MS = 250;

/**
 * Classifies the given USER comments. Skips any comment that already has
 * a classification (idempotent). Designed to be called via
 * `void classifyUserCommentsInBackground(...)` from the upload route.
 */
export async function classifyUserCommentsInBackground(
  commentIds: string[]
): Promise<void> {
  if (commentIds.length === 0) return;
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.warn(
      "[reflection] GOOGLE_AI_API_KEY not set — skipping inline classification"
    );
    return;
  }

  const commentRepo = AppDataSource.getRepository(Comment);
  const classificationRepo = AppDataSource.getRepository(
    CommentReflectionClassification
  );

  // Re-fetch to make sure (a) they exist, (b) they are USER comments,
  // (c) they don't already have a classification. The LEFT JOIN ... IS NULL
  // gives us the same idempotency as the backfill script.
  const todo = await commentRepo
    .createQueryBuilder("c")
    .leftJoin(
      "comment_reflection_classification",
      "crc",
      'crc."commentId" = c.id'
    )
    .where("c.id IN (:...ids)", { ids: commentIds })
    .andWhere("c.role = :role", { role: CommentRole.USER })
    .andWhere("c.text IS NOT NULL AND c.text != ''")
    .andWhere('crc."commentId" IS NULL')
    .select(["c.id", "c.text"])
    .getMany();

  console.log(
    `[reflection] classifying ${todo.length} new USER comments (model=${CLASSIFIER_VERSION})`
  );

  // Filter out "done" messages (e.g. "I'm done for now") — these are UI
  // control signals sent when a student clicks the "finish" button, not
  // actual reflective content. Classifying them would unfairly lower the
  // student's reflection depth scores.
  const classifiable = todo.filter((c) => !isDoneMessage(c.text));
  const skippedDone = todo.length - classifiable.length;
  if (skippedDone > 0) {
    console.log(`[reflection] skipped ${skippedDone} "done" message(s)`);
  }

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < classifiable.length; i++) {
    const comment = classifiable[i];
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
      ok++;
    } catch (e) {
      failed++;
      const msg =
        e instanceof ClassifierError ? e.message : (e as Error).message;
      console.warn(`[reflection]   skip ${comment.id}: ${msg}`);
    }
    if (i < classifiable.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
    }
  }

  console.log(
    `[reflection] classification complete: ok=${ok} failed=${failed}`
  );
}
