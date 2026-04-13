import { MigrationInterface, QueryRunner } from "typeorm";

// Adds a deactivated column to the user table so admins can
// disable accounts without deleting them.
export class AddUserDeactivated1775574600000 implements MigrationInterface {
  name = "AddUserDeactivated1775574600000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "deactivated" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "deactivated"`
    );
  }
}
