# Plan 2 — Admin Console

**Status:** ✅ Complete (merged to main 2026-04-10, commit `013046d`)
**Priority:** After Plan 4 — execution order is Plan 1 -> 3 -> 4 -> **2** -> 5
**Depends on:** Plan 1 (merged)

## Why this plan exists

The app has no user management UI. Backend GraphQL mutations exist (`assignRole`, `grantCourseAccess`, `users`, etc.) but nothing in the frontend calls them. There is currently no way to manage users, assign roles, or link users to institutions without hitting the API directly through browser dev tools. This blocks deployment to real schools.

## What was built

### Auth model — Invite-only

The system was locked down to invite-only. No one can sign in unless an admin has created their account first.

- `disableSignUp: true` on both Google OAuth and magic link plugin (better-auth)
- Admin invites users via the Admin Console → sends magic link email via SendGrid
- Uninvited sign-in attempts are blocked; admin is notified via email with the blocked user's name and email
- Magic link auth added as a second sign-in method alongside Google OAuth
- Login page updated with both Google and magic link options

### Admin Console UI (`/admin`)

Three-tab admin interface accessible to `institution_admin` and `digication_admin` roles:

- **Users tab**: Sortable table with search (name/email), institution filter (digication_admin only), inline role assignment dropdown, institution reassignment (digication_admin only), Invite User dialog (name, email, institution, role → sends magic link)
- **Institutions tab** (digication_admin only): Table with name/domain/slug, Create/Edit dialogs
- **Course Access tab**: Course selector dropdown, access list table with grant/revoke

### Backend changes

- `inviteUser` mutation: creates user, validates institution, sends magic link invitation
- `createInstitution` / `updateInstitution` mutations (digication_admin only)
- `updateUserInstitution` mutation (digication_admin only)
- `users` query: added `search` parameter with case-insensitive name/email filtering
- `revokeCourseAccess`: security fix — institution_admin can only revoke for their own institution
- `POST /api/notify-blocked-signin` endpoint for frontend blocked-attempt notifications
- `sendInvitationEmail()` and `notifyAdminOfBlockedSignIn()` via SendGrid

### Routing & sidebar

- `RoleProtectedRoute` component in App.tsx — redirects non-admin users away from `/admin`
- Sidebar conditionally shows Admin icon for admin roles
- Login page redirects authenticated users to `/`

### Testing

| Suite | Tests | Status |
|-------|-------|--------|
| Server unit tests (admin resolvers) | 48 new (72 total in file) | ✅ Pass |
| Client component tests | 29 new (54 total) | ✅ Pass |
| Playwright E2E tests | 6 pass + 3 skipped* | ✅ Pass |
| Browser verification (Chrome) | 5 checks | ✅ Confirmed |

*Skipped E2E tests require authenticated admin session — designed for CI with auth setup.

### Environment variables needed for production

- `SENDGRID_API_KEY` — SendGrid API key for sending emails
- `SENDGRID_FROM_EMAIL` — Sender email address
- `BOOTSTRAP_ADMIN_EMAIL` — Admin email for blocked sign-in notifications

## Features

### 1. Users List ✅

Show all users with their institution, role, and course access. Filterable by institution and searchable by name/email.

### 2. Role Assignment UI ✅

Change a user's role via inline dropdown. The three roles are:
- **Instructor** — can view insights for courses they have access to
- **Institution Admin** — can manage all courses and users within their institution
- **Digication Admin** — superuser, can manage everything across all institutions

### 3. Institution Management ✅

Create and edit institutions via dialogs. Fields: name, domain, slug.

### 4. Course Access Grants ✅

Grant or revoke instructor access to specific courses via the Course Access tab.

### 5. User-to-Institution Assignment ✅

Digication admins can reassign users to different institutions via the Users tab edit icon.

### 6. Domain-Based Auto-Assignment — OUT OF SCOPE

Deferred. Not needed for initial deployment since the system is invite-only (admin assigns institution at invite time).

### 7. Additional Authentication Methods ✅ (partial)

Magic link auth added via better-auth's `magicLink` plugin + SendGrid. Microsoft OAuth deferred — not needed for initial deployment.

## Key files

| Area | Files |
|------|-------|
| Auth | `src/server/auth.ts` |
| Backend resolvers | `src/server/resolvers/admin.ts`, `institution.ts` |
| Schema | `src/server/types/schema.ts` |
| GraphQL queries | `src/lib/queries/admin.ts` |
| Admin page | `src/pages/AdminPage.tsx` |
| Admin components | `src/components/admin/*.tsx` (7 files) |
| Auth context | `src/lib/AuthProvider.tsx`, `src/lib/auth-client.ts` |
| Login page | `src/pages/LoginPage.tsx` |
| Routing | `src/App.tsx` (RoleProtectedRoute) |
| Sidebar | `src/components/layout/Sidebar.tsx` |
| Server tests | `src/server/resolvers/admin.test.ts` |
| Component tests | `src/components/admin/__tests__/*.test.tsx`, `src/pages/__tests__/*.test.tsx`, etc. |
| E2E tests | `e2e/*.spec.ts`, `playwright.config.ts` |
