import { MigrationInterface, QueryRunner } from "typeorm";

// Phase 5.1 — Institutional isolation for AI chat sessions.
//
// Adds an `institutionId` column to `chat_session` so that chat
// sessions are scoped to a specific institution. Existing rows
// are backfilled from the owning user's institutionId.
export class AddInstitutionIdToChatSession1775574400000
  implements MigrationInterface
{
  name = "AddInstitutionIdToChatSession1775574400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add column as nullable first so we can backfill
    await queryRunner.query(
      `ALTER TABLE "chat_session" ADD COLUMN "institutionId" character varying`
    );

    // Backfill from the owning user's institutionId
    await queryRunner.query(
      `UPDATE "chat_session" cs
       SET "institutionId" = (
         SELECT u."institutionId" FROM "user" u WHERE u.id = cs."userId"
       )`
    );

    // Now set NOT NULL — any sessions whose user has no institution
    // will have been left NULL; delete those orphans first.
    await queryRunner.query(
      `DELETE FROM "chat_session" WHERE "institutionId" IS NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "chat_session" ALTER COLUMN "institutionId" SET NOT NULL`
    );

    // Index for filtering sessions by institution
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_session_institutionId" ON "chat_session" ("institutionId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chat_session_institutionId"`
    );
    await queryRunner.query(
      `ALTER TABLE "chat_session" DROP COLUMN "institutionId"`
    );
  }
}
