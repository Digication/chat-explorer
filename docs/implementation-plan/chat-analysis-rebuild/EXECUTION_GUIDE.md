# Execution Guide

## Execution Modes

### Mode A: Manual (human-driven)

Run each phase in a fresh Claude Code conversation:

```
/implement execute docs/implementation-plan/chat-analysis-rebuild
```

Or run individual phases:

```
Read and execute docs/implementation-plan/chat-analysis-rebuild/01-project-scaffolding.md
```

### Mode B: Automated (orchestrator agent)

Use the `/implement execute` command which spawns sub-agents per phase:

```
/implement execute docs/implementation-plan/chat-analysis-rebuild
```

## Phase Summary

| # | Phase | Key Changes |
|---|-------|-------------|
| 01 | Project Scaffolding | pnpm, TypeScript strict, Vite, directory structure |
| 02 | Docker Environment | Docker Compose, PostgreSQL 17, Caddy labels |
| 03 | Database Schema & ORM | TypeORM entities for all data models |
| 04 | Authentication & Roles | Better Auth, Google OAuth, three-role system |
| 05 | CSV Upload & TORI Extraction | CSV upload, parsing pipeline, TORI extraction, dedup, merge *(renamed from file-upload-excel-processing)* |
| 06 | Student Consent Management | Two-level consent, audit trail, consent-aware filtering *(NEW phase)* |
| 07 | Analytics Engine & Cache | TORI, text signals, engagement, heatmap, clustering, network, recommendations *(was Phase 06)* |
| 08 | GraphQL API Layer | TypeGraphQL resolvers for all entities *(was Phase 07)* |
| 09 | Frontend Shell & Navigation | Dark sidebar, MUI theme, Apollo Client, login page *(was Phase 08)* |
| 10 | Insights & Visualization Page | Smart recommendations, metrics, heatmap, network, depth bands *(was Phase 09)* |
| 11 | Chat Explorer Page | Bottom bar, student carousel, slide-out panels *(was Phase 10)* |
| 12 | AI Chat Integration | Multi-turn chat, context building, PII sanitization *(was Phase 11)* |
| 13 | Reports & Export | PDF reports, CSV export, export dialog *(NEW phase)* |
| 14 | Unified LLM Layer | Provider abstraction: OpenAI, Anthropic, Google; model picker *(NEW phase)* |
| 15 | Unit Tests | Vitest, all backend service tests *(was Phase 12, expanded)* |
| 16 | E2E Tests | Playwright, all user flow tests *(was Phase 13, expanded)* |
| 17 | Railway Deployment & Deploy Skill | Railway config, deploy skill *(was Phase 14, updated)* |

## Phase Execution Order

| Phase | Prompt File | Model | Dependencies | Can Parallelize With |
|-------|------------|-------|--------------|---------------------|
| 01 | `01-project-scaffolding.md` | sonnet | -- | -- |
| 02 | `02-docker-environment.md` | sonnet | 01 | -- |
| 03 | `03-database-schema.md` | opus | 02 | -- |
| 04 | `04-authentication.md` | opus | 03 | -- |
| 05 | `05-csv-upload-tori-extraction.md` | opus | 04 | -- |
| 06 | `06-consent-management.md` | opus | 05 | -- |
| 07 | `07-analytics-engine.md` | opus | 06 | -- |
| 08 | `08-graphql-api.md` | opus | 07 | -- |
| 09 | `09-frontend-shell.md` | opus | 08 | -- |
| 10 | `10-insights-page.md` | opus | 09 | 11, 13 |
| 11 | `11-chat-explorer-page.md` | opus | 09 | 10 |
| 12 | `12-ai-chat-integration.md` | opus | 11 | -- |
| 13 | `13-reports-export.md` | opus | 09 | 10 |
| 14 | `14-unified-llm-layer.md` | opus | 12 | -- |
| 15 | `15-unit-tests.md` | opus | 14 | -- |
| 16 | `16-e2e-tests.md` | opus | 15 | -- |
| 17 | `17-railway-deployment.md` | sonnet | 16 | -- |

## Dependency Graph

```
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 ─┬─► 10 ───────────┐
                                                 ├─► 11 ──► 12 ──┤
                                                 └─► 13 ──────────┤
                                                                   │
                                                      12 ──► 14 ──┤
                                                                   │
                                                            15 ◄───┘
                                                             │
                                                            16
                                                             │
                                                            17
```

Key observations:
- **Phase 06 (Consent)** is new and slots between upload (05) and analytics (07) because analytics must be consent-aware
- **Phases 10, 11, 13** can run in parallel after Phase 09 (frontend shell)
- **Phase 14 (LLM Layer)** depends on Phase 12 (AI Chat) since it refactors the AI service
- **Phases 15–17** are strictly sequential: unit tests, then E2E tests, then deployment

## Recommended Execution for Maximum Parallelism

**Step 1:** Phase 01 (project setup)
**Step 2:** Phase 02 (Docker)
**Step 3:** Phase 03 (database)
**Step 4:** Phase 04 (auth)
**Step 5:** Phase 05 (CSV upload & TORI extraction)
**Step 6:** Phase 06 (consent management)
**Step 7:** Phase 07 (analytics engine)
**Step 8:** Phase 08 (GraphQL API)
**Step 9:** Phase 09 (frontend shell)
**Step 10:** Phase 10 + Phase 11 + Phase 13 (parallel -- Insights, Chat Explorer, and Reports are independent)
**Step 11:** Phase 12 (AI chat -- depends on Chat Explorer from Phase 11)
**Step 12:** Phase 14 (unified LLM layer -- refactors AI chat from Phase 12)
**Step 13:** Phase 15 (unit tests -- all code exists)
**Step 14:** Phase 16 (E2E tests -- unit tests pass)
**Step 15:** Phase 17 (deployment)

## Constraints

- Fresh context per phase -- each sub-agent starts clean
- Commit after each phase -- provides rollback safety
- Verification must pass before dependent phases begin
- No skipping phases -- even simple ones ensure correct file structure
- Plan docs are the source of truth

## Model Selection Guide

| Phase | Model | Reason |
|-------|-------|--------|
| 01 | sonnet | Straightforward project scaffolding |
| 02 | sonnet | Docker config from template |
| 03 | opus | Entity design with complex relations |
| 04 | opus | Auth integration, security-sensitive |
| 05 | opus | CSV parsing with TORI extraction edge cases |
| 06 | opus | Consent logic with two-level granularity, audit trail |
| 07 | opus | Core business logic, algorithmic complexity |
| 08 | opus | TypeGraphQL schema design, resolver patterns |
| 09 | opus | React patterns, auth flow, MUI theming |
| 10 | opus | Complex visualizations (SVG heatmap, network graph), smart recommendations |
| 11 | opus | Digication-style layout, state management |
| 12 | opus | AI integration, context building, PII handling |
| 13 | opus | PDF generation with @react-pdf/renderer, consent-aware exports |
| 14 | opus | Provider abstraction design, three SDK integrations |
| 15 | opus | Correctness-critical test design |
| 16 | opus | E2E test patterns, auth mocking, fixture design |
| 17 | sonnet | Deployment config, straightforward |

**Rule of thumb:** Use sonnet for scaffolding, Docker, and deployment. Use opus for everything else (business logic, UI, tests, integrations).

## Environment Setup

Prerequisites before running any phase:

1. **Docker Desktop** or **OrbStack** installed and running
2. **Shared Caddy proxy** running:
   ```bash
   docker network create web 2>/dev/null || true
   cd ~/caddy && docker compose up -d
   ```
   (See `/onboard` if Caddy is not set up yet)
3. **Environment variables** -- copy `.env.example` to `.env` and fill in:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (from Google Cloud Console)
   - `OPENAI_API_KEY` (from OpenAI -- required for AI chat, Phase 12+)
   - `ANTHROPIC_API_KEY` (from Anthropic -- optional, enables Claude models in Phase 14+)
   - `GOOGLE_AI_API_KEY` (from Google AI Studio -- optional, enables Gemini models in Phase 14+)

## Renumbering Reference

The following phases were renumbered or added compared to the original plan:

| Old # | Old Name | New # | New Name | Notes |
|-------|----------|-------|----------|-------|
| 05 | File Upload & Excel Processing | 05 | CSV Upload & TORI Extraction | Renamed: now CSV-based with TORI extraction |
| -- | -- | 06 | Student Consent Management | **NEW**: two-level consent with audit trail |
| 06 | Analytics Engine | 07 | Analytics Engine & Cache | Renumbered, added caching and recommendations |
| 07 | GraphQL API | 08 | GraphQL API Layer | Renumbered |
| 08 | Frontend Shell & Auth UI | 09 | Frontend Shell & Navigation | Renumbered |
| 09 | Insights Page | 10 | Insights & Visualization Page | Renumbered |
| 10 | Chat Explorer Page | 11 | Chat Explorer Page | Renumbered |
| 11 | AI Chat Integration | 12 | AI Chat Integration | Renumbered |
| -- | -- | 13 | Reports & Export | **NEW**: PDF reports and CSV export |
| -- | -- | 14 | Unified LLM Layer | **NEW**: multi-provider abstraction |
| 12 | Unit Tests | 15 | Unit Tests | Renumbered, expanded scope |
| 13 | E2E Tests | 16 | E2E Tests | Renumbered, expanded scope |
| 14 | Railway Deployment | 17 | Railway Deployment & Deploy Skill | Renumbered, updated env vars |

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `Cannot connect to database` | PostgreSQL container not healthy | `docker compose up -d` and wait for health check |
| `Module not found` errors | Dependencies not installed | `docker compose exec app pnpm install` |
| `CORS error` in browser | `BETTER_AUTH_URL` doesn't match browser URL | Update `.env` to match the actual URL |
| `401 Unauthorized` on all requests | No valid session cookie | Sign in via the login page first |
| Google OAuth "redirect_uri_mismatch" | Callback URL not configured in Google Console | Add `https://chat-analysis.localhost/api/auth/callback/google` to authorized redirect URIs |
| `TypeGraphQL` decorator errors | Missing `reflect-metadata` import | Ensure `import "reflect-metadata"` is first in server entry |
| Port 5173 already in use | Another Vite instance running | Stop other dev servers or change the port in vite.config.ts |
| Caddy `502 Bad Gateway` | App container not serving on expected port | Check container logs: `docker compose logs app` |
| CSV parse error | Invalid file format or encoding | Verify the CSV has the expected column headers |
| Railway deploy fails | Build error | Check `railway logs` for the specific error |
| AI chat returns "provider not available" | LLM API key not set for selected provider | Set the API key in environment variables or switch to an available provider |
| Model picker shows no providers | No LLM API keys configured | Set at least `OPENAI_API_KEY` in `.env` |
| PDF export blank or error | @react-pdf/renderer rendering issue | Check server logs for rendering errors; verify data is available |
| Consent changes not reflected | Analytics cache stale | Cache should auto-invalidate on consent changes; check cache service |
