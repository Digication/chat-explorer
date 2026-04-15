import { MigrationInterface, QueryRunner } from "typeorm";

// Adds the "student" value to the user_role_enum and a userId column
// on the student table so students can be linked to login accounts.
export class AddStudentRole1775574900000 implements MigrationInterface {
  name = "AddStudentRole1775574900000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."user_role_enum" ADD VALUE IF NOT EXISTS 'student'`
    );
    await queryRunner.query(
      `ALTER TABLE "student" ADD COLUMN "userId" varchar`
    );
    await queryRunner.query(
      `ALTER TABLE "student" ADD CONSTRAINT "FK_student_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_student_userId" ON "student" ("userId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "student" DROP CONSTRAINT IF EXISTS "FK_student_user"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_student_userId"`
    );
    await queryRunner.query(
      `ALTER TABLE "student" DROP COLUMN IF EXISTS "userId"`
    );
    // Note: cannot remove an enum value in Postgres — harmless to leave it.
  }
}
