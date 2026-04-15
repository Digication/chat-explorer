import { MigrationInterface, QueryRunner } from "typeorm";

// Creates the telemetry_event table for tracking user behavior analytics.
export class AddTelemetryEvent1775574800000 implements MigrationInterface {
  name = "AddTelemetryEvent1775574800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "telemetry_event" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" varchar NOT NULL,
        "institutionId" varchar,
        "eventCategory" varchar(50) NOT NULL,
        "eventAction" varchar(100) NOT NULL,
        "metadata" jsonb,
        "pageUrl" varchar,
        "sessionId" varchar(64) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telemetry_event" PRIMARY KEY ("id"),
        CONSTRAINT "FK_telemetry_event_user" FOREIGN KEY ("userId")
          REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_telemetry_event_institution" FOREIGN KEY ("institutionId")
          REFERENCES "institution"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_telemetry_user_created" ON "telemetry_event" ("userId", "createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_telemetry_institution_created" ON "telemetry_event" ("institutionId", "createdAt")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_telemetry_category_created" ON "telemetry_event" ("eventCategory", "createdAt")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "telemetry_event"`);
  }
}
