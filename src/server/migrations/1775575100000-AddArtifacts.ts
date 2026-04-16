import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 3 — Artifacts & Section-Level Analysis.
 *
 * Creates `artifact` and `artifact_section` tables, and wires the FK from
 * `evidence_moment.artifactSectionId` (declared in Phase 2 but left without
 * an FK because the target table didn't exist yet) to `artifact_section.id`.
 */
export class AddArtifacts1775575100000 implements MigrationInterface {
  name = "AddArtifacts1775575100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(
      `CREATE TYPE "public"."artifact_type_enum" AS ENUM ('PAPER', 'PRESENTATION', 'CODE', 'PORTFOLIO', 'CONVERSATION')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."artifact_status_enum" AS ENUM ('UPLOADED', 'PROCESSING', 'ANALYZED', 'FAILED', 'DELETED')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."artifact_section_type_enum" AS ENUM ('PARAGRAPH', 'SECTION', 'SLIDE', 'CODE_BLOCK', 'HEADING', 'COMMENT')`
    );

    // artifact
    await queryRunner.query(`
      CREATE TABLE "artifact" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "courseId" uuid NOT NULL,
        "assignmentId" uuid,
        "threadId" uuid,
        "title" varchar NOT NULL,
        "type" "public"."artifact_type_enum" NOT NULL,
        "status" "public"."artifact_status_enum" NOT NULL DEFAULT 'UPLOADED',
        "sourceUrl" varchar,
        "mimeType" varchar,
        "fileSizeBytes" integer,
        "storagePath" varchar,
        "uploadedById" varchar,
        "errorMessage" text,
        "uploadedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_artifact" PRIMARY KEY ("id"),
        CONSTRAINT "FK_artifact_student" FOREIGN KEY ("studentId")
          REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_artifact_course" FOREIGN KEY ("courseId")
          REFERENCES "course"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_artifact_assignment" FOREIGN KEY ("assignmentId")
          REFERENCES "assignment"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_artifact_thread" FOREIGN KEY ("threadId")
          REFERENCES "thread"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_artifact_uploaded_by" FOREIGN KEY ("uploadedById")
          REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_artifact_studentId" ON "artifact" ("studentId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_artifact_courseId" ON "artifact" ("courseId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_artifact_assignmentId" ON "artifact" ("assignmentId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_artifact_threadId" ON "artifact" ("threadId")`
    );

    // artifact_section
    await queryRunner.query(`
      CREATE TABLE "artifact_section" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "artifactId" uuid NOT NULL,
        "commentId" uuid,
        "sequenceOrder" integer NOT NULL,
        "title" varchar,
        "content" text NOT NULL,
        "type" "public"."artifact_section_type_enum" NOT NULL,
        "wordCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_artifact_section" PRIMARY KEY ("id"),
        CONSTRAINT "FK_artifact_section_artifact" FOREIGN KEY ("artifactId")
          REFERENCES "artifact"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_artifact_section_comment" FOREIGN KEY ("commentId")
          REFERENCES "comment"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_artifact_section_artifactId" ON "artifact_section" ("artifactId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_artifact_section_commentId" ON "artifact_section" ("commentId")`
    );

    // Wire the Phase-2-placeholder FK: evidence_moment.artifactSectionId -> artifact_section.id
    await queryRunner.query(
      `ALTER TABLE "evidence_moment" ADD CONSTRAINT "FK_evidence_moment_artifact_section" FOREIGN KEY ("artifactSectionId") REFERENCES "artifact_section"("id") ON DELETE CASCADE`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evidence_moment_artifactSectionId" ON "evidence_moment" ("artifactSectionId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_evidence_moment_artifactSectionId"`
    );
    await queryRunner.query(
      `ALTER TABLE "evidence_moment" DROP CONSTRAINT IF EXISTS "FK_evidence_moment_artifact_section"`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "artifact_section"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "artifact"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."artifact_section_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."artifact_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."artifact_type_enum"`);
  }
}
