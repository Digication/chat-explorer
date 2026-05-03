/**
 * Server test setup — initializes the TypeORM data source.
 *
 * Tests run inside the Docker container where Postgres is available.
 * The data source connects using DATABASE_URL from the environment.
 */
import "reflect-metadata";
import { AppDataSource } from "./data-source.js";
import { AddBetterAuthTables1775574200000 } from "./migrations/1775574200000-AddBetterAuthTables.js";
import { beforeAll, afterAll } from "vitest";

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();

    // synchronize creates schema for entities listed in data-source.ts but
    // does NOT create migration-managed tables. Better Auth's session,
    // account, and verification tables are created via a migration (they're
    // not TypeORM entities). On a fresh DB (e.g., CI), those tables don't
    // exist — any test path that touches Better Auth (admin invite flows,
    // session writes) throws "relation does not exist", which can cascade
    // into unhandled rejections that crash the vitest worker.
    const qr = AppDataSource.createQueryRunner();
    try {
      const exists = await qr.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'verification' LIMIT 1`
      );
      if (exists.length === 0) {
        await new AddBetterAuthTables1775574200000().up(qr);
      }
    } finally {
      await qr.release();
    }
  }
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
