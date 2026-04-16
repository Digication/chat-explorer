/**
 * GraphQL resolvers for the Artifact type and its queries/mutations.
 *
 * Authorization:
 *   - STUDENT: only sees their own artifacts
 *   - INSTRUCTOR: only artifacts for courses they have CourseAccess to
 *   - INSTITUTION_ADMIN / DIGICATION_ADMIN: everything in scope
 *
 * Section-level evidence is joined in a field resolver so the list
 * query stays cheap. DELETED artifacts are soft-deleted and hidden
 * from list queries by default.
 */

import { GraphQLError } from "graphql";
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Artifact, ArtifactStatus, ArtifactType } from "../entities/Artifact.js";
import { ArtifactSection } from "../entities/ArtifactSection.js";
import { CourseAccess } from "../entities/CourseAccess.js";
import { Student } from "../entities/Student.js";
import { Course } from "../entities/Course.js";
import { Assignment } from "../entities/Assignment.js";
import { EvidenceMoment } from "../entities/EvidenceMoment.js";
import { EvidenceOutcomeLink } from "../entities/EvidenceOutcomeLink.js";
import { OutcomeDefinition } from "../entities/OutcomeDefinition.js";
import { UserRole } from "../entities/User.js";
import { canReadArtifact } from "../services/artifact/artifact-service.js";
import { wrapThreadAsArtifact } from "../services/artifact/conversation-wrapper.js";
import { requireAuth } from "./middleware/auth.js";
import type { GraphQLContext } from "../types/context.js";

interface ArtifactsFilter {
  institutionId?: string | null;
  courseId?: string | null;
  assignmentId?: string | null;
  studentId?: string | null;
  status?: ArtifactStatus | null;
  type?: ArtifactType | null;
}

export const artifactResolvers = {
  Query: {
    /**
     * List artifacts matching a filter. Role-based scope is layered
     * on top of the caller-supplied filter.
     */
    artifacts: async (
      _: unknown,
      { filter }: { filter?: ArtifactsFilter | null },
      ctx: GraphQLContext
    ): Promise<Artifact[]> => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(Artifact);
      const qb = repo
        .createQueryBuilder("a")
        .leftJoinAndSelect("a.student", "s")
        .where("a.status != :deleted", { deleted: ArtifactStatus.DELETED });

      if (filter?.courseId) qb.andWhere("a.courseId = :cid", { cid: filter.courseId });
      if (filter?.assignmentId)
        qb.andWhere("a.assignmentId = :aid", { aid: filter.assignmentId });
      if (filter?.studentId)
        qb.andWhere("a.studentId = :sid", { sid: filter.studentId });
      if (filter?.status)
        qb.andWhere("a.status = :status", { status: filter.status });
      if (filter?.type)
        qb.andWhere("a.type = :type", { type: filter.type });

      // Scope by institution — via the student's institutionId.
      // DIGICATION_ADMIN is not scoped; everyone else is.
      if (user.role !== UserRole.DIGICATION_ADMIN) {
        if (!user.institutionId) return [];
        qb.andWhere("s.institutionId = :inst", { inst: user.institutionId });
      } else if (filter?.institutionId) {
        qb.andWhere("s.institutionId = :inst", { inst: filter.institutionId });
      }

      // Role-specific narrowing.
      if (user.role === UserRole.STUDENT) {
        // Students only see artifacts for themselves.
        qb.andWhere("s.userId = :uid", { uid: user.id });
      } else if (user.role === UserRole.INSTRUCTOR) {
        // Instructors only see courses they have access to.
        const courseIds = await AppDataSource.getRepository(CourseAccess)
          .createQueryBuilder("ca")
          .select("ca.courseId", "courseId")
          .where("ca.userId = :uid", { uid: user.id })
          .getRawMany<{ courseId: string }>();
        const ids = courseIds.map((r) => r.courseId);
        if (ids.length === 0) return [];
        qb.andWhere("a.courseId IN (:...cids)", { cids: ids });
      }

      qb.orderBy("a.uploadedAt", "DESC");
      return qb.getMany();
    },

    artifact: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ): Promise<Artifact | null> => {
      const user = requireAuth(ctx);
      const artifact = await AppDataSource.getRepository(Artifact).findOne({
        where: { id },
        relations: { student: true },
      });
      if (!artifact) return null;
      if (artifact.status === ArtifactStatus.DELETED) {
        // Only admins can see soft-deleted artifacts (hides them from list
        // queries too).
        if (
          user.role !== UserRole.INSTITUTION_ADMIN &&
          user.role !== UserRole.DIGICATION_ADMIN
        ) {
          return null;
        }
      }
      const allowed = await canReadArtifact(user, artifact);
      if (!allowed) {
        throw new GraphQLError("You do not have access to this artifact", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      return artifact;
    },
  },

  Mutation: {
    /**
     * Soft-delete: flips status to DELETED, keeps rows + files so the
     * action is reversible by an admin via DB.
     *
     * Only the uploader, an institution admin, or a digication admin
     * may delete an artifact.
     */
    deleteArtifact: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ): Promise<boolean> => {
      const user = requireAuth(ctx);
      const repo = AppDataSource.getRepository(Artifact);
      const artifact = await repo.findOne({
        where: { id },
        relations: { student: true },
      });
      if (!artifact) {
        throw new GraphQLError("Artifact not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      const canDelete =
        user.role === UserRole.DIGICATION_ADMIN ||
        (user.role === UserRole.INSTITUTION_ADMIN &&
          artifact.student?.institutionId === user.institutionId) ||
        artifact.uploadedById === user.id;
      if (!canDelete) {
        throw new GraphQLError("You do not have permission to delete this artifact", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      await repo.update({ id }, { status: ArtifactStatus.DELETED });
      return true;
    },

    /**
     * Wrap a chat thread as a CONVERSATION artifact (idempotent).
     * The caller must have course access for the thread's course.
     */
    wrapThreadAsArtifact: async (
      _: unknown,
      { threadId }: { threadId: string },
      ctx: GraphQLContext
    ): Promise<Artifact> => {
      const user = requireAuth(ctx);
      const result = await wrapThreadAsArtifact(threadId, user.id);

      const artifact = await AppDataSource.getRepository(Artifact).findOne({
        where: { id: result.artifactId },
        relations: { student: true },
      });
      if (!artifact) {
        throw new GraphQLError("Wrap succeeded but artifact not found", {
          extensions: { code: "INTERNAL" },
        });
      }

      // Enforce access: the mutation auth-gates on read access (same
      // rule used elsewhere). If the caller can't read the artifact,
      // they shouldn't have been able to wrap the thread either.
      const allowed = await canReadArtifact(user, artifact);
      if (!allowed) {
        throw new GraphQLError("You do not have access to this thread", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      return artifact;
    },
  },

  // ── Field resolvers ──────────────────────────────────────────────

  Artifact: {
    hasStoredFile: (a: Artifact): boolean => Boolean(a.storagePath),
    uploadedAt: (a: Artifact): string => a.uploadedAt.toISOString(),
    updatedAt: (a: Artifact): string => a.updatedAt.toISOString(),

    sectionCount: async (a: Artifact): Promise<number> => {
      return AppDataSource.getRepository(ArtifactSection).count({
        where: { artifactId: a.id },
      });
    },

    sections: async (a: Artifact): Promise<ArtifactSection[]> => {
      return AppDataSource.getRepository(ArtifactSection).find({
        where: { artifactId: a.id },
        order: { sequenceOrder: "ASC" },
      });
    },

    student: async (a: Artifact): Promise<Student | null> => {
      if ((a as Artifact & { student?: Student }).student)
        return (a as Artifact & { student: Student }).student;
      return AppDataSource.getRepository(Student).findOne({
        where: { id: a.studentId },
      });
    },

    course: async (a: Artifact): Promise<Course | null> => {
      return AppDataSource.getRepository(Course).findOne({
        where: { id: a.courseId },
      });
    },

    assignment: async (a: Artifact): Promise<Assignment | null> => {
      if (!a.assignmentId) return null;
      return AppDataSource.getRepository(Assignment).findOne({
        where: { id: a.assignmentId },
      });
    },
  },

  ArtifactSection: {
    /**
     * Evidence moments for this section. Checks both keys:
     *   - artifactSectionId (Phase 3 moments from the analyzer)
     *   - commentId (Phase 2 moments, when this section wraps a Comment
     *     as part of a CONVERSATION artifact)
     *
     * Returns the narrative + outcome alignments (joined with
     * OutcomeDefinition so the client gets readable codes/names).
     */
    evidenceMoments: async (
      section: ArtifactSection
    ): Promise<
      {
        id: string;
        narrative: string;
        sourceText: string;
        processedAt: string;
        outcomeAlignments: {
          outcomeCode: string;
          outcomeName: string;
          strengthLevel: string;
          rationale: string | null;
        }[];
      }[]
    > => {
      const momentRepo = AppDataSource.getRepository(EvidenceMoment);
      const qb = momentRepo
        .createQueryBuilder("em")
        .where("em.isLatest = true")
        .andWhere(
          section.commentId
            ? '(em."artifactSectionId" = :sid OR em."commentId" = :cid)'
            : 'em."artifactSectionId" = :sid',
          { sid: section.id, cid: section.commentId ?? undefined }
        );
      const moments = await qb.getMany();
      if (moments.length === 0) return [];

      // Load outcome links for all moments in one go, then the outcome
      // definitions those links point at.
      const links = await AppDataSource.getRepository(
        EvidenceOutcomeLink
      ).find({
        where: { evidenceMomentId: In(moments.map((m) => m.id)) },
      });
      const outcomeIds = [...new Set(links.map((l) => l.outcomeDefinitionId))];
      const outcomes =
        outcomeIds.length > 0
          ? await AppDataSource.getRepository(OutcomeDefinition).find({
              where: { id: In(outcomeIds) },
            })
          : [];
      const outcomeById = new Map(outcomes.map((o) => [o.id, o]));
      const linksByMoment = new Map<string, EvidenceOutcomeLink[]>();
      for (const l of links) {
        const arr = linksByMoment.get(l.evidenceMomentId) ?? [];
        arr.push(l);
        linksByMoment.set(l.evidenceMomentId, arr);
      }

      return moments.map((m) => ({
        id: m.id,
        narrative: m.narrative,
        sourceText: m.sourceText,
        processedAt: m.processedAt.toISOString(),
        outcomeAlignments: (linksByMoment.get(m.id) ?? []).map((l) => {
          const outcome = outcomeById.get(l.outcomeDefinitionId);
          return {
            outcomeCode: outcome?.code ?? "",
            outcomeName: outcome?.name ?? "",
            strengthLevel: l.strengthLevel,
            rationale: l.rationale,
          };
        }),
      }));
    },
  },
};
