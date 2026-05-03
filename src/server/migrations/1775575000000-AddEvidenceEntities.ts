import { MigrationInterface, QueryRunner } from "typeorm";

// Creates the four evidence-related tables: outcome_framework,
// outcome_definition, evidence_moment, evidence_outcome_link.
export class AddEvidenceEntities1775575000000 implements MigrationInterface {
  name = "AddEvidenceEntities1775575000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enum types
    await queryRunner.query(
      `CREATE TYPE "public"."framework_type_enum" AS ENUM ('TORI', 'GEN_ED', 'ABET', 'NURSING', 'CUSTOM')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."evidence_type_enum" AS ENUM ('TORI', 'REFLECTION', 'OUTCOME', 'STRUCTURAL')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."strength_level_enum" AS ENUM ('EMERGING', 'DEVELOPING', 'DEMONSTRATING', 'EXEMPLARY')`
    );

    // outcome_framework
    await queryRunner.query(`
      CREATE TABLE "outcome_framework" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "institutionId" uuid NOT NULL,
        "name" varchar NOT NULL,
        "description" text,
        "type" "public"."framework_type_enum" NOT NULL,
        "isDefault" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "isSystem" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outcome_framework" PRIMARY KEY ("id"),
        CONSTRAINT "FK_outcome_framework_institution" FOREIGN KEY ("institutionId")
          REFERENCES "institution"("id") ON DELETE NO ACTION
      )
    `);

    // outcome_definition
    await queryRunner.query(`
      CREATE TABLE "outcome_definition" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "frameworkId" uuid NOT NULL,
        "code" varchar NOT NULL,
        "name" varchar NOT NULL,
        "description" text,
        "parentId" uuid,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_outcome_definition" PRIMARY KEY ("id"),
        CONSTRAINT "FK_outcome_definition_framework" FOREIGN KEY ("frameworkId")
          REFERENCES "outcome_framework"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_outcome_definition_parent" FOREIGN KEY ("parentId")
          REFERENCES "outcome_definition"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_outcome_definition_framework_code" ON "outcome_definition" ("frameworkId", "code")`
    );

    // evidence_moment
    // NOTE: artifactSectionId left without an FK here — Phase 3 adds the
    // artifact_section table and wires the FK in its migration.
    await queryRunner.query(`
      CREATE TABLE "evidence_moment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid NOT NULL,
        "commentId" uuid,
        "artifactSectionId" uuid,
        "narrative" text NOT NULL,
        "sourceText" text NOT NULL,
        "type" "public"."evidence_type_enum" NOT NULL,
        "modelVersion" varchar NOT NULL,
        "processedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "parentMomentId" uuid,
        "isLatest" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_evidence_moment" PRIMARY KEY ("id"),
        CONSTRAINT "FK_evidence_moment_student" FOREIGN KEY ("studentId")
          REFERENCES "student"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_evidence_moment_comment" FOREIGN KEY ("commentId")
          REFERENCES "comment"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_evidence_moment_parent" FOREIGN KEY ("parentMomentId")
          REFERENCES "evidence_moment"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_evidence_moment_studentId" ON "evidence_moment" ("studentId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evidence_moment_commentId" ON "evidence_moment" ("commentId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_evidence_moment_processedAt" ON "evidence_moment" ("processedAt")`
    );

    // evidence_outcome_link
    await queryRunner.query(`
      CREATE TABLE "evidence_outcome_link" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "evidenceMomentId" uuid NOT NULL,
        "outcomeDefinitionId" uuid NOT NULL,
        "strengthLevel" "public"."strength_level_enum" NOT NULL,
        "rationale" text,
        CONSTRAINT "PK_evidence_outcome_link" PRIMARY KEY ("id"),
        CONSTRAINT "FK_evidence_outcome_link_moment" FOREIGN KEY ("evidenceMomentId")
          REFERENCES "evidence_moment"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_evidence_outcome_link_outcome" FOREIGN KEY ("outcomeDefinitionId")
          REFERENCES "outcome_definition"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_evidence_outcome_link_moment_outcome" ON "evidence_outcome_link" ("evidenceMomentId", "outcomeDefinitionId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "evidence_outcome_link"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "evidence_moment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outcome_definition"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outcome_framework"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."strength_level_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."evidence_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."framework_type_enum"`);
  }
}
