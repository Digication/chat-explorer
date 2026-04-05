/**
 * Server test setup — initializes the TypeORM data source.
 *
 * Tests run inside the Docker container where Postgres is available.
 * The data source connects using DATABASE_URL from the environment.
 */
import "reflect-metadata";
import { AppDataSource } from "./data-source.js";
import { beforeAll, afterAll } from "vitest";

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
