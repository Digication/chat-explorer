import { MigrationInterface, QueryRunner } from "typeorm";

// Plan 3 — Hatton & Smith reflection categories.
//
// Adds the `comment_reflection_classification` table that stores one
// per-comment label drawn from the 4 Hatton & Smith categories. This
// migration is **additive only** — the legacy DepthBand path keeps
// working until phase 3d cleanup.
//
// In dev, TypeORM `synchronize: true` already creates this table from
// the entity. This migration exists for production (Railway), where
// `synchronize: false`.
export class AddReflectionClassification1775574300000
  implements MigrationInterface
{
  name = "AddReflectionClassification1775574300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."comment_reflection_classification_category_enum" AS ENUM('DESCRIPTIVE_WRITING', 'DESCRIPTIVE_REFLECTION', 'DIALOGIC_REFLECTION', 'CRITICAL_REFLECTION')`
    );
    await queryRunner.query(
      `CREATE TABLE "comment_reflection_classification" (
        "commentId" uuid NOT NULL,
        "category" "public"."comment_reflection_classification_category_enum" NOT NULL,
        "evidenceQuote" text,
        "rationale" text,
        "classifierVersion" character varying NOT NULL,
        "confidence" double precision,
        "classifiedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comment_reflection_classification" PRIMARY KEY ("commentId")
      )`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comment_reflection_classification_category" ON "comment_reflection_classification" ("category")`
    );
    // CASCADE so deleting a comment cleans up its classification row.
    await queryRunner.query(
      `ALTER TABLE "comment_reflection_classification" ADD CONSTRAINT "FK_comment_reflection_classification_commentId" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comment_reflection_classification" DROP CONSTRAINT "FK_comment_reflection_classification_commentId"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_comment_reflection_classification_category"`
    );
    await queryRunner.query(`DROP TABLE "comment_reflection_classification"`);
    await queryRunner.query(
      `DROP TYPE "public"."comment_reflection_classification_category_enum"`
    );
  }
}
