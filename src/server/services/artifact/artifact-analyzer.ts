/**
 * Artifact analyzer — the background task that feeds each artifact's
 * sections through the Phase 2 narrative generator and writes
 * EvidenceMoment + EvidenceOutcomeLink rows keyed to sectionId (not
 * commentId).
 *
 * Called fire-and-forget from the upload route, same pattern as
 * `generateEvidenceInBackground`. On success we flip
 * `artifact.status` to ANALYZED; on failure we flip to FAILED and
 * populate `errorMessage` so the UI can surface the problem.
 *
 * Implementation trick: the existing `generateNarrativeBatch` keys its
 * input and output on `commentId`. Rather than fork the prompt code,
 * we pass section ids in the `commentId` field and translate the
 * response back to sectionId at save time. The LLM simply echoes the
 * id we gave it, so this is a safe opaque-handle trick.
 */

import { AppDataSource } from "../../data-source.js";
import { Artifact, ArtifactStatus } from "../../entities/Artifact.js";
import { ArtifactSection, SectionType } from "../../entities/ArtifactSection.js";
import {
  EvidenceMoment,
  EvidenceType,
} from "../../entities/EvidenceMoment.js";
import { EvidenceOutcomeLink } from "../../entities/EvidenceOutcomeLink.js";
import {
  OutcomeFramework,
  FrameworkType,
} from "../../entities/OutcomeFramework.js";
import { OutcomeDefinition } from "../../entities/OutcomeDefinition.js";
import { Student } from "../../entities/Student.js";
import {
  generateNarrativeBatch,
  NARRATIVE_VERSION,
  MAX_BATCH_SIZE,
  NarrativeError,
  type NarrativeInput,
  type NarrativeInputComment,
  type NarrativeInputOutcome,
} from "../evidence/narrative-generator.js";
import { cacheInvalidate } from "../analytics/cache.js";

const DELAY_BETWEEN_BATCHES_MS = 250;

// Sections that don't carry meaningful content for evidence generation.
// HEADING sections are already reflected in adjacent SECTION titles, and
// isolated slide captions are usually sparse — skip both.
const SKIP_SECTION_TYPES = new Set<SectionType>([SectionType.HEADING]);

/** Minimum content length (chars) worth sending to the LLM. */
const MIN_CONTENT_CHARS = 40;

/**
 * Analyze a single artifact. Designed to be invoked via
 * `void analyzeArtifactInBackground(id)` from the upload route.
 */
export async function analyzeArtifactInBackground(
  artifactId: string
): Promise<void> {
  const artifactRepo = AppDataSource.getRepository(Artifact);
  const artifact = await artifactRepo.findOne({ where: { id: artifactId } });
  if (!artifact) {
    console.warn(`[artifact-analyzer] artifact ${artifactId} not found`);
    return;
  }

  if (!process.env.GOOGLE_AI_API_KEY) {
    console.warn(
      "[artifact-analyzer] GOOGLE_AI_API_KEY not set — skipping analysis"
    );
    // Leave the artifact in PROCESSING; a re-run once the key is set
    // will complete it.
    return;
  }

  try {
    await runAnalysis(artifact);
    await artifactRepo.update(
      { id: artifact.id },
      { status: ArtifactStatus.ANALYZED, errorMessage: null }
    );
    console.log(`[artifact-analyzer] artifact ${artifact.id} -> ANALYZED`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[artifact-analyzer] artifact ${artifact.id} failed: ${message}`
    );
    await artifactRepo.update(
      { id: artifact.id },
      {
        status: ArtifactStatus.FAILED,
        errorMessage: message.slice(0, 1000),
      }
    );
  }
}

/**
 * Inner pipeline: loads sections, batches them through the narrative
 * generator, and saves EvidenceMoment + EvidenceOutcomeLink rows.
 * Throws on infrastructure problems (framework missing, every batch
 * failing) so the caller can flip the artifact to FAILED.
 */
async function runAnalysis(artifact: Artifact): Promise<void> {
  // ── 1. Load the student and its institution ──────────────────────
  const student = await AppDataSource.getRepository(Student).findOne({
    where: { id: artifact.studentId },
    select: { id: true, institutionId: true },
  });
  if (!student) {
    throw new Error(`Student ${artifact.studentId} not found`);
  }
  const institutionId = student.institutionId;

  // ── 2. Load analyzable sections ──────────────────────────────────
  const sections = await AppDataSource.getRepository(ArtifactSection).find({
    where: { artifactId: artifact.id },
    order: { sequenceOrder: "ASC" },
  });
  const analyzable = sections.filter(
    (s) =>
      !SKIP_SECTION_TYPES.has(s.type) &&
      s.content.trim().length >= MIN_CONTENT_CHARS
  );
  if (analyzable.length === 0) {
    console.log(
      `[artifact-analyzer] artifact ${artifact.id}: no analyzable sections`
    );
    return;
  }

  // Idempotency: skip sections that already have a latest EvidenceMoment.
  const existing = await AppDataSource.getRepository(EvidenceMoment)
    .createQueryBuilder("em")
    .where('em."artifactSectionId" IN (:...ids)', {
      ids: analyzable.map((s) => s.id),
    })
    .andWhere("em.isLatest = true")
    .select(['em."artifactSectionId"'])
    .getRawMany();
  const alreadyAnalyzed = new Set(existing.map((r) => r.artifactSectionId));
  const todo = analyzable.filter((s) => !alreadyAnalyzed.has(s.id));
  if (todo.length === 0) {
    console.log(
      `[artifact-analyzer] artifact ${artifact.id}: all sections already analyzed`
    );
    return;
  }

  // ── 3. Load TORI framework for the institution ────────────────────
  const framework = await AppDataSource.getRepository(OutcomeFramework).findOne(
    {
      where: {
        institutionId,
        type: FrameworkType.TORI,
        isActive: true,
      },
    }
  );
  if (!framework) {
    throw new Error(
      `No active TORI framework for institution ${institutionId}`
    );
  }

  const outcomeDefinitions = await AppDataSource.getRepository(
    OutcomeDefinition
  ).find({
    where: { frameworkId: framework.id },
    order: { sortOrder: "ASC" },
  });
  if (outcomeDefinitions.length === 0) {
    throw new Error("TORI framework has no outcomes");
  }

  const outcomes: NarrativeInputOutcome[] = outcomeDefinitions.map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    description: o.description,
  }));

  // ── 4. Build narrative inputs from sections ───────────────────────
  // We slot section ids into the commentId field — the LLM echoes them
  // back unchanged and we translate on save.
  const sectionInputs: NarrativeInputComment[] = todo.map((s) => ({
    commentId: s.id,
    studentId: artifact.studentId,
    text: s.content,
    threadName: combineTitle(artifact.title, s.title),
    assignmentDescription: null,
    toriTags: [],
    reflectionCategory: null,
  }));

  // ── 5. Batch and process ──────────────────────────────────────────
  console.log(
    `[artifact-analyzer] artifact ${artifact.id}: analyzing ` +
      `${sectionInputs.length} sections ` +
      `(${Math.ceil(sectionInputs.length / MAX_BATCH_SIZE)} batches, model=${NARRATIVE_VERSION})`
  );

  let ok = 0;
  let failed = 0;
  const sectionById = new Map(todo.map((s) => [s.id, s]));

  for (let i = 0; i < sectionInputs.length; i += MAX_BATCH_SIZE) {
    const batch = sectionInputs.slice(i, i + MAX_BATCH_SIZE);
    const input: NarrativeInput = { comments: batch, outcomes };

    try {
      const results = await generateNarrativeBatch(input);
      await saveArtifactEvidence(results, sectionById, artifact.studentId);
      ok += results.length;
    } catch (e) {
      failed += batch.length;
      const msg = e instanceof NarrativeError ? e.message : (e as Error).message;
      console.warn(
        `[artifact-analyzer] artifact ${artifact.id}: batch ${Math.floor(i / MAX_BATCH_SIZE) + 1} failed: ${msg}`
      );
    }

    if (i + MAX_BATCH_SIZE < sectionInputs.length) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  cacheInvalidate({ institutionId });

  console.log(
    `[artifact-analyzer] artifact ${artifact.id}: ok=${ok} failed=${failed}`
  );

  // If every batch failed, treat the run as failed so the caller flips
  // the artifact to FAILED with a real error message.
  if (ok === 0 && failed > 0) {
    throw new Error(
      `Narrative generation failed for all ${failed} section(s)`
    );
  }
}

/**
 * Persist narrative results as EvidenceMoment + EvidenceOutcomeLink
 * rows. The results reference section ids (via the opaque-handle trick)
 * which we translate back to `artifactSectionId` on write.
 */
async function saveArtifactEvidence(
  results: Awaited<ReturnType<typeof generateNarrativeBatch>>,
  sectionById: Map<string, ArtifactSection>,
  studentId: string
): Promise<void> {
  await AppDataSource.transaction(async (manager) => {
    for (const result of results) {
      const section = sectionById.get(result.commentId);
      if (!section) continue; // LLM echoed an unknown id — skip

      const moment = await manager.save(
        manager.getRepository(EvidenceMoment).create({
          studentId,
          commentId: null,
          artifactSectionId: section.id,
          narrative: result.narrative,
          sourceText: section.content,
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

/**
 * Build a readable "threadName"-style header from the artifact title and
 * optional section title. This is what the LLM sees as context.
 */
export function combineTitle(
  artifactTitle: string,
  sectionTitle: string | null
): string {
  const a = artifactTitle?.trim() || "Untitled";
  const s = sectionTitle?.trim();
  return s ? `${a} — ${s}` : a;
}

/**
 * Load EvidenceMoments for an artifact, joined to their outcome links.
 * Used by the faculty/student artifact detail view. Kept here because
 * the analyzer is the module that "owns" the moment-per-section shape.
 */
export interface ArtifactMomentSummary {
  sectionId: string;
  momentId: string;
  narrative: string;
  alignments: {
    outcomeDefinitionId: string;
    strengthLevel: string;
    rationale: string | null;
  }[];
}

export async function loadArtifactMoments(
  artifactId: string
): Promise<ArtifactMomentSummary[]> {
  const sections = await AppDataSource.getRepository(ArtifactSection).find({
    where: { artifactId },
    select: { id: true },
  });
  if (sections.length === 0) return [];

  const moments = await AppDataSource.getRepository(EvidenceMoment)
    .createQueryBuilder("em")
    .leftJoinAndSelect("em.outcomeLinks", "ol")
    .where('em."artifactSectionId" IN (:...ids)', {
      ids: sections.map((s) => s.id),
    })
    .andWhere("em.isLatest = true")
    .getMany();

  return moments.map((m) => ({
    sectionId: m.artifactSectionId!,
    momentId: m.id,
    narrative: m.narrative,
    alignments: (m.outcomeLinks ?? []).map((l) => ({
      outcomeDefinitionId: l.outcomeDefinitionId,
      strengthLevel: l.strengthLevel,
      rationale: l.rationale,
    })),
  }));
}

// Re-exported for downstream code (tests, etc.) — the constant lives
// in the narrative generator but callers of this module shouldn't have
// to know that.
export { NARRATIVE_VERSION } from "../evidence/narrative-generator.js";
