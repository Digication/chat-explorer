import { MigrationInterface, QueryRunner } from "typeorm";

// Adds invitedAt and lastInvitedAt columns to the user table
// so admins can see invitation status and when invitations were sent.
export class AddInvitationTracking1775574500000
  implements MigrationInterface
{
  name = "AddInvitationTracking1775574500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "invitedAt" TIMESTAMP WITH TIME ZONE`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "lastInvitedAt" TIMESTAMP WITH TIME ZONE`
    );

    // Backfill: any existing user with emailVerified = false was likely
    // invited — set invitedAt to their createdAt timestamp.
    await queryRunner.query(
      `UPDATE "user"
       SET "invitedAt" = "createdAt", "lastInvitedAt" = "createdAt"
       WHERE "emailVerified" = false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "lastInvitedAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "invitedAt"`
    );
  }
}
