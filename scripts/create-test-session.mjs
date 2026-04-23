#!/usr/bin/env node
/**
 * Create a test user + Better Auth session, print the session cookie as JSON.
 *
 * Usage:
 *   docker compose exec app node scripts/create-test-session.mjs [email]
 *
 * Prints:
 *   {
 *     "userId": "...",
 *     "email": "...",
 *     "sessionToken": "...",
 *     "cookieName": "better-auth.session_token",
 *     "cookieValue": "<token>",
 *     "expiresAt": "2026-04-29T..."
 *   }
 *
 * Both HTTP tests and Playwright global setup parse this JSON.
 */
import pg from "pg";
import crypto from "node:crypto";
import { createHmac } from "node:crypto";

const { Client } = pg;

/**
 * Produce the same signed cookie value that better-call's setSignedCookie
 * generates. Format: encodeURIComponent(token + "." + base64(HMAC-SHA256(token)))
 * Secret comes from BETTER_AUTH_SECRET env var (falls back to dev default).
 */
async function signCookieValue(value, secret) {
  const secretBuf = Buffer.from(secret, "utf8");
  const key = await crypto.subtle.importKey(
    "raw",
    secretBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, Buffer.from(value, "utf8"));
  const base64Sig = Buffer.from(signature).toString("base64"); // standard base64, NOT urlsafe
  return encodeURIComponent(`${value}.${base64Sig}`);
}

const email = process.argv[2] || `e2e-test-${Date.now()}@example.com`;
const userId = `e2e-user-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const sessionId = `e2e-session-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const sessionToken = crypto.randomBytes(32).toString("hex");
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

// Better Auth reads its signing secret from BETTER_AUTH_SECRET. In dev the
// app sets a default fallback in src/server/auth.ts — keep in sync with that.
const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production";

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://dev:dev@localhost:5432/chat-explorer",
});

await client.connect();
try {
  // Ensure the test institution exists (users must have one).
  const instRow = await client.query(
    `INSERT INTO "institution" ("name", "domain", "slug")
     VALUES ($1, $2, $3)
     ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name"
     RETURNING id`,
    ["E2E Test Institution", "e2e-test.digication.com", "e2e-test"]
  );
  const institutionId = instRow.rows[0].id;

  // Create the user. Written directly to "user" table — does NOT go through
  // Better Auth, so the invite-only hook in src/server/auth.ts is not invoked.
  await client.query(
    `INSERT INTO "user" ("id", "name", "email", "role", "institutionId", "emailVerified")
     VALUES ($1, $2, $3, 'digication_admin', $4, true)
     ON CONFLICT ("email") DO NOTHING`,
    [userId, "E2E Test User", email, institutionId]
  );

  // Create the Better Auth session. "user" and "session" column names
  // match the Better Auth migration in src/server/migrations/1775574200000-*.
  await client.query(
    `INSERT INTO "session" ("id", "token", "expiresAt", "userId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [sessionId, sessionToken, expiresAt, userId]
  );

  // better-call's setSignedCookie format: encodeURIComponent(token + "." + base64(HMAC-SHA256(token)))
  // This must match the signing in node_modules/.pnpm/better-call*/dist/crypto.mjs
  const signedCookieValue = await signCookieValue(sessionToken, BETTER_AUTH_SECRET);

  // This app sets `useSecureCookies: true` in src/server/auth.ts, so the
  // cookie name gets the "__Secure-" prefix regardless of the request protocol.
  // The cookie name must match exactly what better-call's getSignedCookie looks
  // for: ctx.context.authCookies.sessionToken.name.
  const cookieName = "__Secure-better-auth.session_token";

  const out = {
    userId,
    email,
    institutionId,
    sessionId,
    sessionToken,
    cookieName,
    // URL-encoded signed value (use this in Cookie: request headers — Better Auth
    // decodes it via tryDecode in parseCookies before verifying the signature).
    cookieValue: signedCookieValue,
    // Raw (decoded) signed value: token + "." + base64(HMAC-SHA256(token))
    // Use this in Playwright storageState — browsers receive the raw value and
    // URL-encode it themselves when sending the Cookie header.
    cookieValueRaw: decodeURIComponent(signedCookieValue),
    expiresAt: expiresAt.toISOString(),
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await client.end();
}
