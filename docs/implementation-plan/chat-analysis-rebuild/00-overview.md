# Phase 0 — Overview

## Project Summary

Rebuild the **Chat Analysis** application from scratch — a general-purpose academic reflection analysis platform that helps educators at any institution explore, visualize, and understand student reflection patterns using the **TORI (Taxonomy of Reflective Inquiry)** framework.

The app allows educators to upload CSV files containing AI-guided student discussion data, automatically extracts TORI category associations from AI responses, provides rich analytics (heatmaps, network graphs, engagement scoring, depth classification), a threaded chat explorer modeled after Digication's review submission UI, and a persistent AI-powered analysis assistant supporting multiple LLM providers.

Key differentiators from the prototype:
- **Multi-institution, multi-course** — not limited to one university
- **Unified LLM layer** — switch between OpenAI, Anthropic, and Google models
- **TORI extraction from AI text** — no pre-tagged columns required
- **Per-institution data pool** — uploads merge into a shared institutional dataset
- **Student consent management** — granular include/exclude at institution and course level
- **Persistent AI chat** — conversations survive browser close and work across devices
- **Smart analytics** — system recommends visualizations based on data patterns
- **Export & reporting** — PDF and CSV export for sharing findings

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode) |
| Package manager | pnpm |
| Frontend framework | React 18 |
| UI library | Material UI (MUI) 5 + @mui/icons-material |
| Styling | Emotion (@emotion/react, @emotion/styled) |
| Build tool | Vite |
| GraphQL client | Apollo Client + graphql-codegen |
| GraphQL server | GraphQL Yoga |
| GraphQL schema | TypeGraphQL (code-first, decorator-based) |
| ORM | TypeORM (decorator-based entities) |
| Database | PostgreSQL 17 |
| Authentication | Better Auth + Google OAuth |
| AI integration | Unified LLM layer (OpenAI, Anthropic, Google) |
| PDF generation | @react-pdf/renderer or puppeteer |
| CSV export | json2csv |
| Unit testing | Vitest |
| E2E testing | Playwright |
| Local dev | Docker Compose + Caddy reverse proxy |
| Deployment | Railway (simple cloud) |

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │  Login   │ │ Insights │ │Chat Explorer │ │  Reports &     │  │
│  │  Page    │ │ Page     │ │(bottom bar + │ │  Export Page   │  │
│  │          │ │          │ │ panels)      │ │                │  │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ └───────┬────────┘  │
│       └─────────┬───┴──────────────┴─────────────────┘           │
│                 │  Apollo Client (GraphQL)                         │
│  ┌──────────┐   │  Better Auth Client                             │
│  │  Dark    │   │                                                 │
│  │ Sidebar  │   │                                                 │
│  │  (60px)  │   │                                                 │
│  └──────────┘   │                                                 │
└─────────────────┼─────────────────────────────────────────────────┘
                  │ HTTPS (Caddy → Vite proxy → API)
┌─────────────────┼─────────────────────────────────────────────────┐
│                 │        Server                                    │
│  ┌──────────────▼──────────────┐                                  │
│  │    GraphQL Yoga + Vite Dev   │                                 │
│  │    (single Node.js process)  │                                 │
│  └───┬──────┬──────┬──────┬────┬───────┘                         │
│      │      │      │      │    │                                  │
│  ┌───▼──┐ ┌─▼───┐ ┌▼────┐ ┌▼──▼───────┐ ┌──────────────┐       │
│  │Better│ │Type │ │CSV  │ │Analytics  │ │ Export       │        │
│  │Auth  │ │Graph│ │Parse│ │Engine     │ │ Service      │        │
│  │      │ │QL   │ │+TORI│ │(w/ cache) │ │ (PDF + CSV)  │        │
│  │Google│ │Yoga │ │Extract│ │           │ │              │        │
│  │OAuth │ │     │ │     │ │           │ │              │        │
│  └───┬──┘ └──┬──┘ └──┬──┘ └─────┬────┘ └──────┬───────┘        │
│      │       │       │          │              │                  │
│      └───────┴───────┴──────────┴──────────────┘                  │
│                      │                                             │
│              ┌───────▼────────┐    ┌──────────────────┐           │
│              │   TypeORM      │    │ Unified LLM      │           │
│              │   (entities,   │    │ Layer             │           │
│              │    repos)      │    │ (OpenAI/Anthropic │           │
│              └───────┬────────┘    │  /Google)         │           │
│                      │             └──────────────────┘           │
│              ┌───────▼────────┐                                   │
│              │  PostgreSQL 17 │                                    │
│              └────────────────┘                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Model Overview

```
Institution
  ├── User (role: instructor | institution_admin | digication_admin)
  │    └── course access grants
  │
  ├── Course
  │    └── Assignment
  │         └── Thread
  │              └── Comment (with extracted TORI tags)
  │                   └── uploaded_by tracking
  │
  └── Student (institution-wide)
       └── StudentConsent (institution-level or course-level)
```

Key principles:
- **Per-institution data pool** — no separate "datasets"; uploads merge into the institution's growing data
- **Deduplication** on merge — matched by Thread ID + Comment ID from CSV
- **Student consent** — two levels: institution-wide exclusion OR course-level exclusion
- **User isolation** — instructors see only courses they uploaded or were granted access to
- **Data provenance** — every record tracks who uploaded it and when

## Phase Dependency Graph

```
01 Project Scaffolding
 └──► 02 Docker Environment
       └──► 03 Database Schema & ORM
             └──► 04 Authentication & Roles
                   ├──► 05 CSV Upload & TORI Extraction
                   │     └──► 06 Student Consent Management
                   │           └──► 07 Analytics Engine & Cache
                   │                 └──► 08 GraphQL API Layer
                   │                       ├──► 09 Frontend Shell & Navigation
                   │                       │     ├──► 10 Insights Page ──────┐
                   │                       │     ├──► 11 Chat Explorer ──────┤
                   │                       │     │     └──► 12 AI Chat ──────┤
                   │                       │     └──► 13 Reports & Export ───┤
                   │                       │                                 │
                   │                       └──► 14 Unified LLM Layer ───────┤
                   │                                                         │
                   └─────────────────────────────────────────────────────────┤
                                                                             │
                                                                  15 Unit Tests
                                                                       │
                                                                  16 E2E Tests
                                                                       │
                                                                  17 Railway Deploy
                                                                     & Deploy Skill
```

## Phase Summary

| Phase | Title | Description |
|-------|-------|-------------|
| 01 | Project Scaffolding | Initialize pnpm project, TypeScript strict config, Vite, directory structure |
| 02 | Docker Development Environment | Docker Compose with PostgreSQL 17, Caddy labels, .env setup |
| 03 | Database Schema & ORM | TypeORM entities for all data models: Institution, User, Course, Assignment, Thread, Student, Comment, ToriTag, StudentConsent, ChatSession, ChatMessage, UserState |
| 04 | Authentication & Roles | Better Auth with Google OAuth, three-role system (instructor, institution_admin, digication_admin), role-based middleware |
| 05 | CSV Upload & TORI Extraction | CSV upload endpoint, parsing pipeline, TORI category extraction from AI response text, deduplication, merge into institution pool |
| 06 | Student Consent Management | Consent service with institution-level and course-level granularity, audit trail, consent-aware query filtering |
| 07 | Analytics Engine & Cache | Computation services (TORI, text signals, engagement, heatmap, clustering, network, insights) with caching layer for expensive operations |
| 08 | GraphQL API Layer | TypeGraphQL resolvers for all entities, analytics, chat, consent, export |
| 09 | Frontend Shell & Navigation | React app shell, Digication-style dark sidebar, MUI theme (5px spacing, 2px radius, Helvetica), Apollo Client, auth context, login page |
| 10 | Insights & Visualization Page | Smart analytics dashboard — system recommends best visualizations based on data patterns; metrics, heatmap, network, depth bands |
| 11 | Chat Explorer Page | Digication review submission pattern: bottom bar with student carousel, slide-out panels (student list from left, AI chat from right), full-width thread view |
| 12 | AI Chat Integration | Persistent multi-turn chat, context building, PII sanitization, session management across devices |
| 13 | Reports & Export | PDF report generation, CSV data export, shareable report links |
| 14 | Unified LLM Layer | Provider abstraction for OpenAI, Anthropic, Google; model picker in UI; per-user model preference |
| 15 | Unit Tests | Vitest config, test factories, tests for CSV parser, TORI extraction, analytics engine, consent logic |
| 16 | E2E Tests | Playwright config, login flow, CSV upload, insights, chat explorer, consent management |
| 17 | Railway Deployment & Deploy Skill | Railway setup, PostgreSQL provisioning, env vars, deploy skill |

## Change Inventory

### Configuration Files
| Category | Files |
|----------|-------|
| Package | `package.json`, `pnpm-lock.yaml`, `.npmrc` |
| TypeScript | `tsconfig.json`, `tsconfig.node.json` |
| Vite | `vite.config.ts` |
| Docker | `docker-compose.yml`, `.dockerignore`, `.env`, `.env.example` |
| GraphQL | `codegen.ts` |
| Auth | `src/server/auth.ts` |
| ORM | `src/server/data-source.ts` |
| Railway | `railway.json` |
| Git | `.gitignore` |
| Test | `vitest.config.ts`, `playwright.config.ts` |

### Backend Files (`src/server/`)
| Category | Files |
|----------|-------|
| Entry | `index.ts` |
| Entities | `entities/Institution.ts`, `entities/User.ts`, `entities/Course.ts`, `entities/Assignment.ts`, `entities/Thread.ts`, `entities/Student.ts`, `entities/Comment.ts`, `entities/ToriTag.ts`, `entities/CommentToriTag.ts`, `entities/StudentConsent.ts`, `entities/ChatSession.ts`, `entities/ChatMessage.ts`, `entities/UserState.ts`, `entities/CourseAccess.ts`, `entities/UploadLog.ts` |
| Resolvers | `resolvers/InstitutionResolver.ts`, `resolvers/CourseResolver.ts`, `resolvers/AnalyticsResolver.ts`, `resolvers/ChatResolver.ts`, `resolvers/ConsentResolver.ts`, `resolvers/ExportResolver.ts`, `resolvers/AdminResolver.ts` |
| Services | `services/csv-parser.ts`, `services/tori-extractor.ts`, `services/dedup.ts`, `services/consent.ts`, `services/export-pdf.ts`, `services/export-csv.ts`, `services/analytics/overview.ts`, `services/analytics/tori.ts`, `services/analytics/text-signals.ts`, `services/analytics/engagement.ts`, `services/analytics/heatmap.ts`, `services/analytics/clustering.ts`, `services/analytics/network.ts`, `services/analytics/instructional-insights.ts`, `services/analytics/recommendations.ts`, `services/analytics/cache.ts`, `services/llm/provider.ts`, `services/llm/openai.ts`, `services/llm/anthropic.ts`, `services/llm/google.ts`, `services/ai-chat.ts`, `services/ai-instructions.ts` |
| Middleware | `middleware/auth.ts`, `middleware/role-guard.ts` |
| GraphQL Types | `types/analytics.ts`, `types/chat.ts`, `types/course.ts`, `types/consent.ts`, `types/export.ts`, `types/llm.ts` |

### Frontend Files (`src/`)
| Category | Files |
|----------|-------|
| Entry | `main.tsx`, `App.tsx` |
| Config | `lib/auth-client.ts`, `lib/apollo-client.ts`, `lib/theme.ts` |
| Pages | `pages/LoginPage.tsx`, `pages/InsightsPage.tsx`, `pages/ChatExplorerPage.tsx`, `pages/ReportsPage.tsx`, `pages/SettingsPage.tsx` |
| Layout | `components/layout/AppShell.tsx`, `components/layout/Sidebar.tsx`, `components/layout/BottomBar.tsx` |
| Insights | `components/insights/MetricsCards.tsx`, `components/insights/HeatmapView.tsx`, `components/insights/HeatmapControls.tsx`, `components/insights/ToriNetworkGraph.tsx`, `components/insights/CoOccurrenceList.tsx`, `components/insights/DepthBands.tsx`, `components/insights/SmartRecommendations.tsx` |
| Chat Explorer | `components/explorer/StudentCarousel.tsx`, `components/explorer/StudentListPanel.tsx`, `components/explorer/ThreadView.tsx`, `components/explorer/CommentCard.tsx`, `components/explorer/ToriFilters.tsx`, `components/explorer/ConsentToggle.tsx` |
| AI Chat | `components/ai/AiChatPanel.tsx`, `components/ai/ChatMessage.tsx`, `components/ai/SuggestionChips.tsx`, `components/ai/ContextScopeSelector.tsx`, `components/ai/ModelPicker.tsx`, `components/ai/ChatHistory.tsx` |
| Export | `components/export/ExportDialog.tsx`, `components/export/ReportPreview.tsx` |
| Shared | `components/shared/ConsentBadge.tsx`, `components/shared/ToriChip.tsx`, `components/shared/UserAvatar.tsx` |

### Test Files
| Category | Files |
|----------|-------|
| Unit | `src/server/services/__tests__/csv-parser.test.ts`, `src/server/services/__tests__/tori-extractor.test.ts`, `src/server/services/__tests__/consent.test.ts`, `src/server/services/__tests__/dedup.test.ts`, `src/server/services/analytics/__tests__/tori.test.ts`, `src/server/services/analytics/__tests__/text-signals.test.ts`, `src/server/services/analytics/__tests__/engagement.test.ts`, `src/server/services/analytics/__tests__/clustering.test.ts`, `src/server/services/analytics/__tests__/network.test.ts`, `src/server/services/analytics/__tests__/recommendations.test.ts`, `src/server/services/llm/__tests__/provider.test.ts` |
| E2E | `e2e/login.spec.ts`, `e2e/csv-upload.spec.ts`, `e2e/insights.spec.ts`, `e2e/chat-explorer.spec.ts`, `e2e/consent.spec.ts`, `e2e/ai-chat.spec.ts` |

### Skill Files
| Category | Files |
|----------|-------|
| Deploy | `.claude/skills/deploy/SKILL.md` |

## Key Decisions & Assumptions

1. **Single-container fullstack** — Both Vite dev server and GraphQL Yoga run in one container. Vite proxies `/api/*` and `/auth/*` to the backend internally.

2. **Better Auth over Cognito** — Switching to Better Auth with Google OAuth, storing users and sessions directly in PostgreSQL.

3. **PostgreSQL for everything** — All persistence (users, sessions, courses, comments, chat history, consent, UI state) in PostgreSQL.

4. **Per-institution data pool** — No separate "datasets." Each institution has one growing pool of data. Uploads merge via deduplication (Thread ID + Comment ID).

5. **Three-role system** — Instructor (default), Institution Admin, Digication Admin (super admin). Roles control data visibility and consent management.

6. **Student consent with two-level granularity** — Institution-wide consent overrides course-level. Default is "included." Audit trail on all changes.

7. **Unified LLM layer** — Abstraction over OpenAI, Anthropic, and Google. Only these three providers are allowed. Model picker in UI.

8. **TORI extraction from AI text** — No pre-tagged columns. Categories extracted by matching against the full TORI taxonomy in AI response text. Natural language mentions count. "Done" summaries are ignored.

9. **Digication-inspired UI** — Dark sidebar navigation, 5px spacing grid, 2px border radius, Helvetica font stack, no uppercase buttons. Chat Explorer uses bottom bar + carousel + slide-out panels.

10. **Analytics caching** — Expensive computations are cached server-side with invalidation on data changes (new uploads, consent changes).

11. **Smart visualization recommendations** — Analytics engine recommends which visualizations are most informative for the current data, rather than showing all modes.

12. **PII default off** — Student names are masked by default (initials only). Toggle reveals full names.

13. **Dark mode support** — Theme supports light and dark modes from day one. Light is default.

- [Assumption] Google OAuth credentials will be provided as environment variables.
- [Assumption] API keys for OpenAI, Anthropic, and Google AI will be provided as environment variables.
- [Assumption] The shared Caddy proxy and `web` Docker network are already set up on the dev machine.
- [Assumption] Railway CLI is installed and authenticated for the deployment phase.
- [Assumption] CSV files will include a Course field in a future update; the schema supports it from day one.

## Verification Strategy

| Tier | Command | When |
|------|---------|------|
| Typecheck | `docker compose exec app pnpm typecheck` | After every phase |
| Unit tests | `docker compose exec app pnpm test` | After phase 15 |
| Build | `docker compose exec app pnpm build` | After frontend phases |
| E2E tests | `docker compose run --rm e2e` | After phase 16 |
| Smoke test | Start app, verify login + upload + insights render | After phase 12 |
