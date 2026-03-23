---
name: implement
description: Plan and execute implementation projects — from new apps to single features. Use when the user wants to create an implementation plan, execute an existing plan, build a new app, or add a feature. Evaluates complexity to decide between direct implementation vs. phased planning.
metadata:
  allowed-tools: Read, Write, Edit, Bash(pnpm:*), Bash(npx:*), Bash(git:*), Bash(node:*), Bash(mkdir:*), Bash(ls:*), Bash(cp:*), Bash(mv:*), Glob, Grep, Agent, TodoWrite
---

# Implementation Plan & Execute

Build new apps, add features, or update existing code. Evaluates complexity to decide whether to create a phased plan or implement directly. Handles **planning**, **execution**, and **direct implementation**.

## Arguments

- `plan <description>`: Create an implementation plan for a feature or project.
- `execute <plan-path>`: Execute an existing plan from a `docs/implementation-plan/` subdirectory.
- `resume <plan-path> <phase>`: Resume execution from a specific phase.
- `<description>`: Evaluate complexity and either plan or implement directly.
- (no args): Auto-detect — look for an existing plan to execute, or ask what to build.

## Complexity Evaluation

Before starting, assess the scope to choose the right approach:

| Signal | Approach |
|---|---|
| Touches 1–3 files, single concern, clear scope | **Direct implementation** — just do it |
| Touches 4–10 files, moderate scope, one area of the codebase | **Direct implementation** with task tracking |
| Touches 10+ files, multiple areas, new subsystem, brand new app | **Plan mode** — create phased plan first |
| User explicitly says "plan" or "create a plan" | **Plan mode** regardless of complexity |
| User explicitly says "just do it" or "implement directly" | **Direct implementation** regardless of complexity |

**When in doubt, ask the user:** "This looks like it touches [N areas]. Want me to create a phased plan or implement it directly?"

## Mode Detection

| User says | Mode |
|---|---|
| "plan ...", "design ...", "create a plan for ..." | **Plan mode** — generate plan docs only |
| "execute ...", "run the plan" | **Execute mode** — run phases via sub-agents |
| "implement ...", "build ...", "add ..." (simple) | **Direct mode** — implement immediately |
| "implement ...", "build ..." (complex, no plan exists) | **Plan mode first**, then offer to execute |
| "resume from phase N" | **Execute mode** — start from phase N |

---

## Direct Mode

For small-to-medium changes that don't warrant a full plan. Implement directly using standard tools.

1. Read relevant existing code to understand the codebase
2. Implement the changes
3. Run verification (typecheck, tests)
4. Report what was done

---

## Tech Stack Preferences

When building a **brand-new app**, suggest from these preferred technologies (adapt based on the type of app — frontend-only, fullstack, backend-only, CLI, etc.):

| Layer | Preferred | Notes |
|---|---|---|
| Package manager | pnpm | Always pnpm, not npm or yarn |
| Language | TypeScript (strict mode) | For both frontend and backend |
| Frontend framework | React | Latest stable version |
| UI library | Material UI (MUI) | With @mui/icons-material for icons |
| GraphQL schema | TypeGraphQL | Code-first, decorator-based — pairs with TypeORM |
| GraphQL server | GraphQL Yoga | Runtime for serving the TypeGraphQL schema |
| GraphQL client | Apollo Client | With graphql-codegen for typed client hooks |
| Code generation | graphql-codegen | Client-side only — generates types/hooks from introspected schema |
| ORM | TypeORM | Decorator-based entities, PostgreSQL driver |
| Database | PostgreSQL | Portable across all deployment tiers (local Docker, Railway, AWS RDS) |
| Real-time | SSE (Server-Sent Events) | Preferred over WebSockets for subscriptions |
| Unit testing | Vitest | Fast, TypeScript-native |
| E2E testing | Playwright | Cross-browser, reliable |
| Build tool | Vite | For frontend bundling |

**Guidelines:**
- These are suggestions, not requirements — discuss with the user before committing to a stack
- If the project already has an established stack, follow it — don't introduce new technologies
- Always use the **latest stable version** of chosen libraries
- For frontend-only apps, skip backend-specific tools (ORM, GraphQL server)
- For CLI tools or scripts, skip frontend-specific tools
- Suggest additional libraries as appropriate (e.g., state management, auth, file upload)
- Document stack decisions and rationale in the plan's `00-overview.md`

---

## Infrastructure & CI/CD

Not every app needs cloud infrastructure. Determine the deployment tier first, then apply the appropriate level.

### Deployment Tier Detection

| Signal | Tier | Platform | What to do |
|---|---|---|---|
| "prototype", "local only", "just for me", "demo", no mention of deployment | **Local** | Docker Compose | PostgreSQL in container. No cloud infra. See [DOCKER.md](references/DOCKER.md). |
| "deploy", "share", non-developer user, simple hosting needs | **Simple cloud** | Railway | `railway up` deploy with managed PostgreSQL. See [INFRASTRUCTURE_RAILWAY.md](references/INFRASTRUCTURE_RAILWAY.md). |
| "production", "scale", "enterprise", advanced user, CI/CD needs | **Production** | AWS + SST | Full infrastructure with GitHub Actions CI/CD. See [INFRASTRUCTURE_AWS.md](references/INFRASTRUCTURE_AWS.md). |
| Unclear | **Ask** | — | "How do you want to run this? Locally only, simple cloud deploy, or full production setup?" |

### Docker Development Environment

For **all tiers**, consider adding a Docker-based dev environment. Even apps deploying to Railway or AWS benefit from a consistent local dev setup with Docker.

| Signal | Docker? | Notes |
|---|---|---|
| Any app (frontend, backend, fullstack) | **Yes** (default) | Consistent Node.js, pnpm, and build environment across the team |
| System dependencies (DB, Playwright browsers, native libs) | **Yes** | Containerize to avoid manual setup |
| Team includes non-technical users or onboarding is frequent | **Yes** | Add convenience scripts (`.command` files) |
| User explicitly says no Docker | **No** | Respect the preference |

When adding Docker, include a dedicated **Docker phase** in the plan. See [DOCKER.md](references/DOCKER.md) for templates covering frontend-only, backend-only, and fullstack apps, plus convenience scripts and best practices.

### Infrastructure Phase in Plans

When the deployment tier is **Simple cloud** or **Production**, add an **infrastructure phase** to the plan. The phase content depends on the tier:

| Tier | Phase content | Reference |
|---|---|---|
| Simple cloud | Railway project setup, `railway.json` config, environment variables, database provisioning | [INFRASTRUCTURE_RAILWAY.md](references/INFRASTRUCTURE_RAILWAY.md) |
| Production | SST config, GitHub Actions CI/CD, branch-based stages, AWS secrets | [INFRASTRUCTURE_AWS.md](references/INFRASTRUCTURE_AWS.md) |

Infrastructure is typically the final phase (after tests pass), or a parallel track if someone is dedicated to it. See the tier-specific reference file for templates and examples.

---

## Plan Mode

Generate implementation plan documents following the structure in [PLAN_STRUCTURE.md](references/PLAN_STRUCTURE.md).

### Workflow

1. **Understand the scope.** Read relevant existing code, CLAUDE.md, and any linked docs/issues. Ask clarifying questions if the scope is ambiguous.

2. **Choose the tech stack.** For new apps, propose a stack based on the preferences above and the app's requirements. For existing apps, use the established stack. Get user approval on stack choices before writing phase docs.

3. **Design the phases.** Break the work into sequential phases with clear dependencies. Each phase should be completable in a single agent context window. Target 3–8 phases for most features.

4. **Identify parallelism.** Draw the dependency graph. Mark which phases can run concurrently.

5. **Write the plan docs.** Create the output directory and files:
   ```
   docs/implementation-plan/<feature-name>/
   ├── 00-overview.md        # Architecture, decisions, phase graph, file inventory
   ├── 01-<phase-name>.md    # Step-by-step instructions + code
   ├── 02-<phase-name>.md
   ├── ...
   └── EXECUTION_GUIDE.md    # Execution order, parallelism, troubleshooting
   ```

6. **Present the plan.** Show the user the phase summary table, dependency graph, and file change inventory. Ask for approval before proceeding to execution.

### Testing Phases

Every plan must include dedicated testing phases. Tests are not optional extras — they are first-class phases with their own dependencies and verification.

**Unit test phase** — add after the implementation phases it covers are complete:
- Configure the test runner with path aliases and setup files
- Create a test setup file with shared fixtures (in-memory DB, temp dirs, mock services)
- Write tests organized by module: one test file per source file or logical unit
- Each test file is self-contained with its own imports and setup
- Test both happy paths and error cases
- Mock external services (AI APIs, third-party calls) — never make real API calls in unit tests
- Use test factories/helpers for repetitive object creation

**E2E test phase** — add as the final phase (depends on everything):
- Configure the E2E runner to auto-start dev servers if not already running
- Tests that require external APIs should skip gracefully when credentials are missing
- Use generous timeouts for async operations (streaming, API responses)
- Test key user flows, not every edge case — E2E tests are for integration confidence
- Run sequentially if tests share mutable state (e.g., database)

See [TESTING_PHASES.md](references/TESTING_PHASES.md) for dependency graph and detailed templates.

### Plan Quality Checklist

- [ ] Each phase file is **self-contained** — an agent with no prior context can execute it
- [ ] Phase files include **"Context:"** paragraph explaining what prior phases produced
- [ ] Every step has **"Files to create/modify:"** before any code
- [ ] Code snippets are **complete and copy-pasteable** (no ellipsis or "// ... rest of code")
- [ ] Each phase ends with **Verification** commands and **"When done"** report template
- [ ] The overview includes a **change inventory** listing every file that will be created or modified
- [ ] The execution guide includes **troubleshooting** for likely failure modes
- [ ] Plan includes a **unit test phase** covering all new backend/logic code
- [ ] Plan includes an **E2E test phase** as the final phase if the feature has UI
- [ ] Plan includes a **Docker phase** if the app has system dependencies or the user requests it

---

## Execute Mode

Run an existing implementation plan phase-by-phase using sub-agents.

### Workflow

1. **Read the plan.** Load `00-overview.md` and `EXECUTION_GUIDE.md` to understand phase order, dependencies, and parallelization opportunities.

2. **Check current state.** Look at git log and existing files to determine which phases (if any) have already been completed. Resume from the first incomplete phase.

3. **Execute phases sequentially** (or in parallel where the dependency graph allows):

   For each phase:
   a. Spawn a sub-agent with the phase file as its prompt
   b. Wait for completion
   c. Verify the sub-agent's work (run the phase's verification commands)
   d. If verification passed, commit with message `Phase N: <description>`
   e. If verification failed, attempt one fix cycle (diagnose the error, apply a fix, re-run verification). If still failing, stop and report the failing command, its output, and what was tried.

4. **Handle parallel phases.** When the dependency graph shows independent phases, spawn them concurrently using `isolation: "worktree"`. After both complete, merge worktree changes before proceeding.

5. **Final verification.** After all phases complete, run the full verification suite (typecheck, tests, build).

### Sub-Agent Spawning Patterns

**Sequential phase:**
```
Agent({
  description: "Phase 01 <short name>",
  prompt: "Read and execute docs/implementation-plan/<feature>/<NN-phase>.md. Create all files and run verification.",
  model: "opus"
})
```

**Parallel phases (independent work):**
```
Agent({
  description: "Phase 02 <short name>",
  prompt: "Read and execute docs/implementation-plan/<feature>/02-<phase>.md",
  model: "opus",
  isolation: "worktree"
})
Agent({
  description: "Phase 03 <short name>",
  prompt: "Read and execute docs/implementation-plan/<feature>/03-<phase>.md",
  model: "opus",
  isolation: "worktree"
})
```

### Model Selection

| Phase complexity | Model | Examples |
|---|---|---|
| Trivial file creation, single config files | `haiku` | .gitignore, single JSON config, boilerplate |
| Straightforward file creation, config changes | `sonnet` | Project setup, simple schema, rename refactors |
| Core logic, correctness-critical, complex async | `opus` | AI engine, resolvers, streaming, search |

Use the EXECUTION_GUIDE.md's model recommendations if they exist. Default to `opus` when unsure.

---

## Rules

- **Fresh context per phase.** Each sub-agent starts clean — never pass accumulated state between phases.
- **Commit after each phase.** This provides a rollback safety net. Use message format: `Phase N: <description>`.
- **Verification gates.** Never proceed to a dependent phase if verification failed.
- **No skipping phases.** Even if a phase seems trivial, run it to ensure correct file structure.
- **Plan docs are the source of truth.** Sub-agents execute what the plan says. Do not improvise beyond the plan scope.
- **Self-contained phases.** Each phase file must be executable by an agent that has never seen any other phase file. Include enough context (the "Context:" paragraph) for cold starts.
- **Code completeness.** Phase files must contain complete, copy-pasteable code. Never use `// ...` or `/* rest of implementation */` placeholders.
