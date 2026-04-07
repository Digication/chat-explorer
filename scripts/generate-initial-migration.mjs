// Generates the initial migration by connecting to the Railway database
// (empty) and asking TypeORM what SQL it would run to sync the schema.
//
// Usage: DATABASE_URL=<railway-public-url> node scripts/generate-initial-migration.mjs
//
// Output: src/server/migrations/<timestamp>-Initial.ts

import { AppDataSource } from "../dist/server/data-source.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  await AppDataSource.initialize();
  console.log("Connected. Generating schema SQL...");

  // Ask TypeORM for the SQL queries that would be needed to sync schema
  const sqlInMemory = await AppDataSource.driver
    .createSchemaBuilder()
    .log();

  const upQueries = sqlInMemory.upQueries;
  const downQueries = sqlInMemory.downQueries;

  if (upQueries.length === 0) {
    console.log("No schema changes needed — database is already in sync.");
    await AppDataSource.destroy();
    return;
  }

  console.log(`Generated ${upQueries.length} up queries.`);

  const timestamp = Date.now();
  const className = `Initial${timestamp}`;
  const fileName = `${timestamp}-Initial.ts`;

  // Escape backticks and ${} in SQL strings for template literals
  const escape = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

  const upSql = upQueries
    .map((q) => `    await queryRunner.query(\`${escape(q.query)}\`);`)
    .join("\n");

  const downSql = downQueries
    .map((q) => `    await queryRunner.query(\`${escape(q.query)}\`);`)
    .join("\n");

  const content = `import { MigrationInterface, QueryRunner } from "typeorm";

export class ${className} implements MigrationInterface {
  name = "${className}";

  public async up(queryRunner: QueryRunner): Promise<void> {
${upSql}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
${downSql}
  }
}
`;

  const outDir = resolve(__dirname, "../src/server/migrations");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, fileName);
  writeFileSync(outPath, content);
  console.log(`Wrote ${outPath}`);

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
