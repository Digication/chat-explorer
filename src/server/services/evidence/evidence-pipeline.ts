/**
 * Evidence pipeline — generates narrative evidence moments for newly
 * uploaded comments and links them to learning outcomes.
 *
 * Called fire-and-forget from the upload route (same pattern as the
 * reflection classifier in `ingest-hook.ts`). Runs OUTSIDE the upload
 * transaction so slow LLM calls don't hold DB locks.
 *
 * Flow:
 * 1. Load comments + their TORI tags and reflection classifications
 * 2. Load the TORI outcome framework for the institution
 * 3. Batch comments into groups of 5
 * 4. Call the narrative generator for each batch
 * 5. Save EvidenceMoment + EvidenceOutcomeLink records in a transaction
 * 6. Invalidate analytics cache
 */

import { In } from "typeorm";
import { AppDataSource } from "../../data-source.js";
import { Comment, CommentRole } from "../../entities/Comment.js";
import { CommentToriTag } from "../../entities/CommentToriTag.js";
import { ToriTag } from "../../entities/ToriTag.js";
import { CommentReflectionClassification } from "../../entities/CommentReflectionClassification.js";
import { EvidenceMoment, EvidenceType } from "../../entities/EvidenceMoment.js";
import { EvidenceOutcomeLink } from "../../entities/EvidenceOutcomeLink.js";
import { OutcomeFramework, FrameworkType } from "../../entities/OutcomeFramework.js";
import { OutcomeDefinition } from "../../entities/OutcomeDefinition.js";
import { isDoneMessage } from "../tori-extractor.js";
import {
  generateNarrativeBatch,
  NARRATIVE_VERSION,
  MAX_BATCH_SIZE,
  NarrativeError,
  type NarrativeInput,
  type NarrativeInputComment,
  type NarrativeInputOutcome,
  type NarrativeOutput,
} from "./narrative-generator.js";
import { cacheInvalidate } from "../analytics/cache.js";

const DELAY_BETWEEN_BATCHES_MS = 250;

/**
 * Generate narrative evidence for newly uploaded comments. Designed to
 * be called via `void generateEvidenceInBackground(...)`.
 */
export async function generateEvidenceInBackground(
  commentIds: string[],
  institutionId: string
): Promise<void> {
  if (commentIds.length === 0) return;
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.warn(
      "[evidence] GOOGLE_AI_API_KEY not set — skipping evidence generation"
    );
    return;
  }

  // ── 1. Load comments with their metadata ──────────────────────────
  const commentRepo = AppDataSource.getRepository(Comment);
  const comments = await commentRepo
    .createQueryBuilder("c")
    .leftJoinAndSelect("c.thread", "t")
    .leftJoinAndSelect("t.assignment", "a")
    .where("c.id IN (:...ids)", { ids: commentIds })
    .andWhere("c.role = :role", { role: CommentRole.USER })
    .andWhere("c.text IS NOT NULL AND c.text != ''")
    .getMany();

  // Filter out "done" messages
  const processable = comments.filter((c) => !isDoneMessage(c.text));
  if (processable.length === 0) return;

  // Skip comments that already have evidence moments (idempotent)
  const existingMoments = await AppDataSource.getRepository(EvidenceMoment)
    .createQueryBuilder("em")
    .where('em."commentId" IN (:...ids)', {
      ids: processable.map((c) => c.id),
    })
    .andWhere("em.isLatest = true")
    .select(["em.commentId"])
    .getMany();
  const alreadyProcessed = new Set(existingMoments.map((m) => m.commentId));
  const todo = processable.filter((c) => !alreadyProcessed.has(c.id));

  if (todo.length === 0) {
    console.log("[evidence] all comments already have evidence — skipping");
    return;
  }

  // ── 2. Load TORI tags per comment ─────────────────────────────────
  const todoIds = todo.map((c) => c.id);
  const commentToriTags = await AppDataSource.getRepository(CommentToriTag)
    .createQueryBuilder("ct")
    .leftJoinAndSelect("ct.toriTag", "tt")
    .where('ct."commentId" IN (:...ids)', { ids: todoIds })
    .getMany();

  const tagsByComment = new Map<string, string[]>();
  for (const ct of commentToriTags) {
    const tags = tagsByComment.get(ct.commentId) || [];
    tags.push((ct as any).toriTag?.name ?? "");
    tagsByComment.set(ct.commentId, tags);
  }

  // ── 3. Load reflection classifications per comment ────────────────
  const reflections = await AppDataSource.getRepository(
    CommentReflectionClassification
  ).find({
    where: { commentId: In(todoIds) },
    select: ["commentId", "category"],
  });
  const reflectionByComment = new Map<string, string>();
  for (const r of reflections) {
    reflectionByComment.set(r.commentId, r.category);
  }

  // ── 4. Load TORI outcome framework for the institution ────────────
  const framework = await AppDataSource.getRepository(OutcomeFramework).findOne({
    where: { institutionId, type: FrameworkType.TORI, isActive: true },
  });
  if (!framework) {
    console.warn(
      `[evidence] no active TORI framework for institution ${institutionId} — skipping`
    );
    return;
  }

  const outcomeDefinitions = await AppDataSource.getRepository(
    OutcomeDefinition
  ).find({
    where: { frameworkId: framework.id },
    order: { sortOrder: "ASC" },
  });

  if (outcomeDefinitions.length === 0) {
    console.warn("[evidence] TORI framework has no outcomes — skipping");
    return;
  }

  const outcomes: NarrativeInputOutcome[] = outcomeDefinitions.map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    description: o.description,
  }));

  // ── 5. Build input comments ───────────────────────────────────────
  // sourceId is the Comment's id for Phase 2 — the analyzer side
  // (artifact-analyzer.ts) passes ArtifactSection ids into the same
  // shape. The narrative generator does not interpret either.
  //
  // studentId lives on Comment, NOT on Thread (Thread has no studentId
  // column — see src/server/entities/Thread.ts). Comments without a
  // studentId are skipped: those are typically system messages or
  // historical rows that pre-date the studentId backfill, and we have
  // no evidence anchor for them.
  const inputComments: NarrativeInputComment[] = todo
    .filter((c) => Boolean(c.studentId))
    .map((c) => ({
      sourceId: c.id,
      studentId: c.studentId as string,
      text: c.text,
      threadName: (c as any).thread?.name ?? "",
      assignmentDescription:
        (c as any).thread?.assignment?.description ?? null,
      toriTags: tagsByComment.get(c.id) ?? [],
      reflectionCategory: reflectionByComment.get(c.id) ?? null,
    }));
  if (inputComments.length === 0) {
    console.log(
      `[evidence] no comments with studentId to process (${todo.length} skipped)`
    );
    return;
  }

  // ── 6. Batch and process ──────────────────────────────────────────
  console.log(
    `[evidence] generating narratives for ${inputComments.length} comments ` +
      `(${Math.ceil(inputComments.length / MAX_BATCH_SIZE)} batches, model=${NARRATIVE_VERSION})`
  );

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < inputComments.length; i += MAX_BATCH_SIZE) {
    const batch = inputComments.slice(i, i + MAX_BATCH_SIZE);
    const input: NarrativeInput = { comments: batch, outcomes };

    try {
      const results = await generateNarrativeBatch(input);
      await saveEvidenceResults(results, inputComments, institutionId);
      ok += results.length;
    } catch (e) {
      failed += batch.length;
      const msg =
        e instanceof NarrativeError ? e.message : (e as Error).message;
      console.warn(`[evidence] batch ${Math.floor(i / MAX_BATCH_SIZE) + 1} failed: ${msg}`);
    }

    // Rate-limit between batches
    if (i + MAX_BATCH_SIZE < inputComments.length) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  // ── 7. Invalidate cache ───────────────────────────────────────────
  cacheInvalidate({ institutionId });

  console.log(
    `[evidence] generation complete: ok=${ok} failed=${failed}`
  );
}

/**
 * Saves narrative results as EvidenceMoment + EvidenceOutcomeLink rows
 * inside a single transaction.
 */
async function saveEvidenceResults(
  results: NarrativeOutput[],
  inputComments: NarrativeInputComment[],
  institutionId: string
): Promise<void> {
  // Build a lookup for studentId from the input. sourceId here is the
  // Comment id (set by the caller above) — Phase 2 owns the comment
  // mapping; the generator does not.
  const studentIdBySource = new Map<string, string>();
  for (const c of inputComments) {
    studentIdBySource.set(c.sourceId, c.studentId);
  }

  await AppDataSource.transaction(async (manager) => {
    for (const result of results) {
      const studentId = studentIdBySource.get(result.sourceId);
      if (!studentId) continue;

      // Find the source text from the input
      const inputComment = inputComments.find(
        (c) => c.sourceId === result.sourceId
      );

      const moment = await manager.save(
        manager.getRepository(EvidenceMoment).create({
          studentId,
          commentId: result.sourceId, // Phase 2: sourceId IS the comment id
          narrative: result.narrative,
          sourceText: inputComment?.text ?? "",
          type: EvidenceType.TORI,
          modelVersion: NARRATIVE_VERSION,
          isLatest: true,
        })
      );

      if (result.outcomeAlignments.length > 0) {
        const links = result.outcomeAlignments.map((a) =>
          manager.getRepository(EvidenceOutcomeLink).create({
            evidenceMomentId: moment.id,
            outcomeDefinitionId: a.outcomeDefinitionId,
            strengthLevel: a.strengthLevel,
            rationale: a.rationale,
          })
        );
        await manager.save(links);
      }
    }
  });
}
