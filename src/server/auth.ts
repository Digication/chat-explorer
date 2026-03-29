import { betterAuth } from "better-auth";
import pg from "pg";

export const auth = betterAuth({
  database: new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:4000",
    "https://chat-explorer.localhost",
  ],
  advanced: {
    // Chrome treats localhost as a "secure context" even over HTTP,
    // so Secure cookies work. We need SameSite=None so the cookie
    // is sent on cross-origin requests from chat-explorer.localhost to localhost:4000.
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: "none" as const,
      secure: true,
    },
  },
});
