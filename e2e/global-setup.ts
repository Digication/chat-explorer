import { FullConfig } from "@playwright/test";
import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

interface TestSession {
  cookieName: string;
  cookieValue: string;
  cookieValueRaw: string;
  expiresAt: string;
  institutionId: string;
}

async function createTestSession(): Promise<TestSession> {
  // The script must run inside the Docker container so it can reach the DB.
  // "docker compose exec app" spawns the script in the running app container.
  // The container's working directory is /app — scripts live at /app/scripts/.
  return new Promise((resolve, reject) => {
    const p = spawn(
      "docker",
      [
        "compose",
        "exec",
        "-T", // no TTY — required when stdout is piped
        "app",
        "node",
        "scripts/create-test-session.mjs",
      ],
      {
        stdio: ["ignore", "pipe", "inherit"],
        cwd: process.cwd(), // run docker compose from repo root
      }
    );
    let out = "";
    p.stdout.on("data", (c) => (out += c.toString()));
    p.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`session script exited ${code}`));
      try {
        resolve(JSON.parse(out));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const session = await createTestSession();

  const storageStatePath = join(
    process.cwd(),
    "playwright",
    ".auth",
    "user.json"
  );
  await mkdir(dirname(storageStatePath), { recursive: true });

  // Playwright's storageState is a { cookies: [...], origins: [...] } structure.
  // We set the Better Auth cookie for the app's domain.
  const baseURL = process.env.E2E_BASE_URL || "https://chat-explorer.localhost";
  const url = new URL(baseURL);

  // The auth client in dev mode (src/lib/auth-client.ts) points at
  // http://localhost:4000 (not chat-explorer.localhost) for session cookies.
  // Chrome treats localhost as a "secure context" (so __Secure- cookies work
  // even over HTTP), but we need to set the cookie for the localhost domain
  // so it's sent with requests to http://localhost:4000.
  //
  // We set the cookie for BOTH the Caddy origin and the direct API origin,
  // so navigation to chat-explorer.localhost AND the auth API call to
  // localhost:4000 both receive the session cookie.
  const state = {
    cookies: [
      {
        name: session.cookieName,
        // Use the raw (non-URL-encoded) value for storageState: Playwright sets
        // cookies directly via CDP; the browser URL-encodes them when sending.
        value: session.cookieValueRaw,
        domain: "localhost",
        path: "/",
        expires: Math.floor(new Date(session.expiresAt).getTime() / 1000),
        httpOnly: true,
        secure: true, // __Secure- prefix requires secure; Chrome allows on localhost
        sameSite: "None" as const, // auth.ts sets sameSite: "none" for cross-origin
      },
      {
        name: session.cookieName,
        value: session.cookieValueRaw,
        domain: url.hostname, // chat-explorer.localhost
        path: "/",
        expires: Math.floor(new Date(session.expiresAt).getTime() / 1000),
        httpOnly: true,
        secure: true,
        sameSite: "None" as const,
      },
    ],
    origins: [
      {
        origin: baseURL,
        localStorage: [
          // Stash the institutionId so tests can send it with commit requests
          // if they need to, without calling create-test-session again.
          { name: "e2e.institutionId", value: session.institutionId },
        ],
      },
    ],
  };

  await writeFile(storageStatePath, JSON.stringify(state, null, 2), "utf8");
  console.log(`[global-setup] Wrote storage state to ${storageStatePath}`);
}

export default globalSetup;
