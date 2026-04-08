import { MigrationInterface, QueryRunner } from "typeorm";

// Better Auth manages its own auth-related tables (session, account,
// verification) outside of TypeORM. The schema below was produced by
// running `@better-auth/cli generate` against the current auth config.
// The shared `user` table is created by the initial TypeORM migration.
export class AddBetterAuthTables1775574200000 implements MigrationInterface {
  name = "AddBetterAuthTables1775574200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "session" ("id" text NOT NULL PRIMARY KEY, "expiresAt" timestamptz NOT NULL, "token" text NOT NULL UNIQUE, "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL, "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE)`
    );
    await queryRunner.query(
      `CREATE TABLE "account" ("id" text NOT NULL PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL)`
    );
    await queryRunner.query(
      `CREATE TABLE "verification" ("id" text NOT NULL PRIMARY KEY, "identifier" text NOT NULL, "value" text NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`
    );
    await queryRunner.query(
      `CREATE INDEX "session_userId_idx" ON "session" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX "account_userId_idx" ON "account" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "verification_identifier_idx"`);
    await queryRunner.query(`DROP INDEX "account_userId_idx"`);
    await queryRunner.query(`DROP INDEX "session_userId_idx"`);
    await queryRunner.query(`DROP TABLE "verification"`);
    await queryRunner.query(`DROP TABLE "account"`);
    await queryRunner.query(`DROP TABLE "session"`);
  }
}
