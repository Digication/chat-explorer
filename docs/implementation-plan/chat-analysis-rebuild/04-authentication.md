# Phase 04 — Authentication & Roles

You are adding authentication and role-based access control to the **Chat Analysis** app using Better Auth with Google OAuth.

**Context:** Phases 01–03 set up the project, Docker environment, and database schema. PostgreSQL is running with TypeORM entities for Institution, User (with role enum: `instructor`, `institution_admin`, `digication_admin`), Course, Assignment, Thread, Student, Comment, ToriTag, CommentToriTag, StudentConsent, CourseAccess, UploadLog, ChatSession, ChatMessage, and UserState. The server entry point (`src/server/index.ts`) connects to the database.

## Goal

Set up authentication (Google OAuth via Better Auth) and role-based middleware so that:
- Instructors see only courses they uploaded or were granted access to (via CourseAccess)
- Institution admins see all courses at their institution
- Digication admins can navigate across all institutions
- New users get the `instructor` role by default
- Sessions use HTTP-only cookies for security

## Steps

### 1. Configure Better Auth on the server

**Files to create:** `src/server/auth.ts`

```typescript
import { betterAuth } from "better-auth";
import pg from "pg";

export const auth = betterAuth({
  database: new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  emailAndPassword: {
    enabled: false, // Google OAuth only
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
      maxAge: 5 * 60, // 5-minute cache to reduce DB lookups
    },
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "https://chat-analysis.localhost",
  ],
});
```

Better Auth automatically creates its own tables (`user`, `session`, `account`, `verification`) when first accessed. The TypeORM User entity maps to the same `user` table — Better Auth manages creation and authentication, TypeORM reads/writes for app-specific fields like `role` and `institutionId`.

**Environment variables to add to `.env`:**

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
BETTER_AUTH_URL=https://chat-analysis.localhost
BETTER_AUTH_SECRET=generate-a-random-secret-here
```

### 2. Create the auth middleware

**Files to create:** `src/server/middleware/auth.ts`

This middleware extracts the user session from HTTP-only cookies on every request. Two variants: `requireAuth` (returns 401 if no session) and `optionalAuth` (attaches user if present, continues either way).

```typescript
import { Request, Response, NextFunction } from "express";
import { auth } from "../auth.js";
import { fromNodeHeaders } from "better-auth/node";
import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";

// Extends Express Request with user and session data
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    image?: string;
    role: string;
    institutionId: string | null;
  };
  session?: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Better Auth reads the session from the HTTP-only cookie
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    // Fetch app-specific fields (role, institutionId) from User entity
    const userRepo = AppDataSource.getRepository(User);
    const fullUser = await userRepo.findOne({
      where: { id: session.user.id },
    });

    req.user = {
      ...session.user,
      role: fullUser?.role ?? "instructor",
      institutionId: fullUser?.institutionId ?? null,
    };
    req.session = session.session;
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session) {
      const userRepo = AppDataSource.getRepository(User);
      const fullUser = await userRepo.findOne({
        where: { id: session.user.id },
      });

      req.user = {
        ...session.user,
        role: fullUser?.role ?? "instructor",
        institutionId: fullUser?.institutionId ?? null,
      };
      req.session = session.session;
    }
  } catch {
    // Ignore auth errors — user just won't be attached
  }
  next();
}
```

### 3. Create the role guard middleware

**Files to create:** `src/server/middleware/role-guard.ts`

This middleware checks the user's `role` field (from the User entity) before allowing access to protected operations. It is applied after `requireAuth`.

```typescript
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { UserRole } from "../entities/User.js";

/**
 * Creates middleware that restricts access to users with one of the
 * specified roles. Must be used AFTER requireAuth middleware.
 *
 * Usage:
 *   router.post("/admin/...", requireAuth, requireRole(UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN), handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}

/**
 * Checks whether a user can access data for a given institution.
 * - digication_admin: can access any institution
 * - institution_admin / instructor: can only access their own institution
 */
export function requireInstitutionAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Digication admins can access everything
  if (req.user.role === UserRole.DIGICATION_ADMIN) {
    next();
    return;
  }

  // Other roles must have an institutionId that matches the request
  const targetInstitutionId =
    req.params.institutionId || req.body?.institutionId;

  if (!targetInstitutionId) {
    next(); // No institution context in request — let downstream handle it
    return;
  }

  if (req.user.institutionId !== targetInstitutionId) {
    res
      .status(403)
      .json({ error: "You do not have access to this institution" });
    return;
  }

  next();
}
```

**Role visibility rules summary:**

| Role | Sees | Can manage consent | Can manage users |
|------|------|-------------------|------------------|
| `instructor` | Courses they have CourseAccess to | Course-level only (their courses) | No |
| `institution_admin` | All courses at their institution | Institution-wide + course-level | Can assign roles within institution |
| `digication_admin` | All courses at all institutions | Everything | Everything |

### 4. Update the server entry to mount auth routes

**Files to modify:** `src/server/index.ts`

```typescript
import "reflect-metadata";
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";
import { AppDataSource } from "./data-source.js";
import { auth } from "./auth.js";

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// Middleware
app.use(
  cors({
    origin: process.env.BETTER_AUTH_URL || "https://chat-analysis.localhost",
    credentials: true, // Required for HTTP-only cookie sessions
  })
);
app.use(cookieParser());

// Better Auth handles all /api/auth/* routes (login, callback, session, etc.)
app.all("/api/auth/*splat", toNodeHandler(auth));

// Health check (no auth required)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function main() {
  try {
    await AppDataSource.initialize();
    console.log("Database connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
```

### 5. Create the Better Auth client for the frontend

**Files to create:** `src/lib/auth-client.ts`

This client handles sign-in/sign-out and session management from the React side. It communicates with the Better Auth endpoints via cookies.

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: window.location.origin, // Same origin — Caddy proxies to the server
});

// Convenience exports for use in components
export const { useSession, signIn, signOut } = authClient;
```

### 6. Create a React auth context

**Files to create:** `src/lib/AuthProvider.tsx`

Wraps the app so any component can check who is logged in, what role they have, and whether auth is still loading.

```tsx
import { createContext, useContext, ReactNode } from "react";
import { useSession } from "./auth-client";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

  const value: AuthContextValue = {
    user: session?.user ?? null,
    isLoading: isPending,
    isAuthenticated: !!session?.user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
```

### 7. New user flow and institution assignment

When a user signs in via Google OAuth for the first time, Better Auth creates a record in the `user` table. The app needs to handle the initial state:

1. **Default role:** New users get `instructor` role (set as column default in the User entity).
2. **No institution:** `institutionId` is `null` until assigned.
3. **Institution assignment options:**
   - **Manual by admin:** An `institution_admin` or `digication_admin` assigns the user to an institution through a user management UI.
   - **Auto-detect from email domain:** When a user first logs in, check if their email domain (e.g., `lagcc-cuny.edu`) matches an Institution's `domain` field. If there is a match, auto-assign. The domain field on Institution stores the Digication subdomain (e.g., `lagcc-cuny.digication.com`), so compare the first segment before `.digication.com` against the email domain prefix.
   - **Onboarding prompt:** After first login, if `institutionId` is null, the frontend shows a setup screen where the user selects their institution from a list. A digication_admin can create new institutions.

4. **Role promotion:** Only `institution_admin` or `digication_admin` can change another user's role. Instructors cannot promote themselves.

## Files Summary

| File | Purpose |
|------|---------|
| `src/server/auth.ts` | Better Auth configuration with Google OAuth |
| `src/server/middleware/auth.ts` | Session extraction middleware (requireAuth, optionalAuth) |
| `src/server/middleware/role-guard.ts` | Role-checking middleware (requireRole, requireInstitutionAccess) |
| `src/lib/auth-client.ts` | Frontend Better Auth client |
| `src/lib/AuthProvider.tsx` | React context providing auth state to components |

## Verification

```bash
# Build and start
docker compose up -d --build
docker compose exec app pnpm typecheck

# Health check (no auth needed)
curl -k https://chat-analysis.localhost/api/health
# Expected: {"status":"ok"}

# Better Auth discovery endpoint
curl -k https://chat-analysis.localhost/api/auth/ok
# Expected: Better Auth status response (confirms auth routes are mounted)

# Verify Google OAuth redirect works
# Open https://chat-analysis.localhost/api/auth/signin/google in a browser
# Expected: Redirects to Google's OAuth consent screen
```

Expected: TypeScript compiles without errors. Health endpoint responds. Better Auth discovery endpoint returns a valid response. Google OAuth redirect initiates correctly. No auth tables need manual creation — Better Auth handles them automatically.

## When done

Report: files created/modified (with summary per file), verification results, and any issues encountered.
