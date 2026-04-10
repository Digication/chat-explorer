# Plan 2 — Admin Console

**Status:** Not started
**Priority:** After Plan 4 — execution order is Plan 1 -> 3 -> 4 -> **2** -> 5
**Depends on:** Plan 1 (merged)

## Why this plan exists

The app has no user management UI. Backend GraphQL mutations exist (`assignRole`, `grantCourseAccess`, `users`, etc.) but nothing in the frontend calls them. There is currently no way to manage users, assign roles, or link users to institutions without hitting the API directly through browser dev tools. This blocks deployment to real schools.

## Features

### 1. Users List

Show all users with their institution, role, and course access. Filterable by institution and role. This is the main admin landing page.

### 2. Role Assignment UI

Change a user's role via the UI. The three roles are:
- **Instructor** — can view insights for courses they have access to
- **Institution Admin** — can manage all courses and users within their institution
- **Digication Admin** — superuser, can manage everything across all institutions

### 3. Institution Management

Create and edit institutions. Currently institutions exist in the database but there's no UI to add new ones or update their details.

### 4. Course Access Grants

Grant or revoke instructor access to specific courses. An instructor should only see data for courses they've been explicitly granted access to.

### 5. User-to-Institution Assignment

Currently users sign in with `institutionId = null` and there's no way to link them to an institution after the fact. Need a UI to assign users to institutions.

### 6. Domain-Based Auto-Assignment

Automatically map users to institutions based on their email domain. For example, `@bucknell.edu` should automatically assign the user to the Bucknell institution on sign-in. This reduces manual admin work for large deployments.

### 7. Additional Authentication Methods

The app currently supports Google OAuth only. Need to add at least one of:
- Microsoft / Office 365 OAuth (most important for schools)
- Magic links (email-based passwordless)
- Email + password

**Decision needed:** Which method(s) to prioritize. Microsoft OAuth is likely the highest value for school deployments.

## Implementation approach

Start with the Users List (#1) and Role Assignment (#2) since the backend mutations already exist. Then Institution Management (#3) and Course Access (#4). Domain-based auto-assignment (#6) and additional auth (#7) are the most complex and can come last.
