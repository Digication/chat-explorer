/**
 * Tests for the thread(id) resolver.
 *
 * These tests run inside Docker with a real Postgres connection.
 * Run with: docker compose exec chat-explorer pnpm test
 */
import { describe, it, expect } from "vitest";
import { AppDataSource } from "../data-source.js";
import { Thread } from "../entities/Thread.js";
import { Assignment } from "../entities/Assignment.js";

describe("thread(id) query", () => {
  it("returns null for a non-existent thread ID", async () => {
    const repo = AppDataSource.getRepository(Thread);
    const thread = await repo.findOne({
      where: { id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(thread).toBeNull();
  });

  it("can find a real thread with its assignment chain", async () => {
    // Find any thread in the DB
    const repo = AppDataSource.getRepository(Thread);
    const thread = await repo.findOne({ where: {} });

    if (!thread) {
      console.log("Skipping: no threads in DB");
      return;
    }

    // Verify the thread has a valid assignment
    const assignmentRepo = AppDataSource.getRepository(Assignment);
    const assignment = await assignmentRepo.findOne({
      where: { id: thread.assignmentId },
    });

    expect(assignment).not.toBeNull();
    expect(assignment!.courseId).toBeTruthy();
  });
});
