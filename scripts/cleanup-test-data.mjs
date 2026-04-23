#!/usr/bin/env node
/**
 * Removes all E2E test users, sessions, and related data.
 * Idempotent — safe to run multiple times.
 *
 * Run: docker compose exec app node scripts/cleanup-test-data.mjs
 */
import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://dev:dev@localhost:5432/chat-explorer",
});
await client.connect();

try {
  // Delete in FK-safe order. Cascades (ON DELETE CASCADE for session→user)
  // would handle some of this automatically, but being explicit is safer.
  const users = await client.query(
    `SELECT id FROM "user" WHERE email LIKE 'e2e-test-%@example.com' OR id LIKE 'e2e-user-%'`
  );
  const userIds = users.rows.map((r) => r.id);

  if (userIds.length > 0) {
    await client.query(`DELETE FROM "session" WHERE "userId" = ANY($1::text[])`, [userIds]);
    await client.query(`DELETE FROM "course_access" WHERE "userId" = ANY($1::text[])`, [userIds]);
    await client.query(`DELETE FROM "upload_log" WHERE "uploadedById" = ANY($1::text[])`, [userIds]);
    // Comments uploaded by test user — cascade via threads/assignments/courses would be complex.
    // Instead, find them by uploadedById and delete them directly (studentId FKs stay intact).
    await client.query(
      `DELETE FROM "comment_tori_tag" WHERE "commentId" IN (SELECT id FROM "comment" WHERE "uploadedById" = ANY($1::text[]))`,
      [userIds]
    );
    await client.query(`DELETE FROM "comment" WHERE "uploadedById" = ANY($1::text[])`, [userIds]);
    await client.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [userIds]);
  }

  // E2E institution cascade: nothing to do — institution is shared, keep it.
  // If the institution is empty and test-only, leave it alone (cheap).

  console.log(`Cleaned up ${userIds.length} test users and their data.`);
} finally {
  await client.end();
}
