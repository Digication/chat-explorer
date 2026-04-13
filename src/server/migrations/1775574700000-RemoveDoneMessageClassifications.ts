import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Removes reflection classifications for "done" messages (e.g. "I'm done
 * for now"). These are UI control signals sent when a student clicks the
 * "finish" button — they aren't reflective content and were being
 * classified as DESCRIPTIVE_WRITING, unfairly lowering reflection depth
 * scores.
 *
 * Going forward, the ingest hook and backfill script filter these out
 * before classification. This migration cleans up existing bad data.
 */
export class RemoveDoneMessageClassifications1775574700000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Delete classifications where the comment text matches known
    // "done" patterns. These regex patterns mirror the DONE_PATTERNS
    // array in src/server/services/tori-extractor.ts.
    const result = await queryRunner.query(`
      DELETE FROM comment_reflection_classification
      WHERE "commentId" IN (
        SELECT c.id FROM comment c
        WHERE c.role = 'USER'
        AND (
          c.text ~* '\\mi''?m\\s+done\\b'
          OR c.text ~* '\\bdone\\s+for\\s+now\\b'
          OR c.text ~* '\\bthat''?s\\s+all\\b'
          OR c.text ~* '\\bi''?m\\s+finished\\b'
          OR c.text ~* '\\bno\\s+more\\s+questions?\\b'
          OR c.text ~* '\\bnothing\\s+else\\b'
          OR c.text ~* '\\bthank\\s+you,?\\s+that''?s\\s+(it|all)\\b'
        )
      )
    `);
    console.log(
      `[migration] Removed ${result?.[1] ?? "?"} done-message classifications`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: the backfill script can re-classify these if needed,
    // but with the current code they'll be filtered out again.
    // To truly revert, run the backfill script with the filter removed.
    console.log(
      "[migration] down: done-message classifications can be restored by running the backfill script"
    );
  }
}
