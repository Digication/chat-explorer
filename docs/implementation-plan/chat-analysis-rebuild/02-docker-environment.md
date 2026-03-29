# Phase 02 — Docker Development Environment

You are setting up a Docker development environment for the **Chat Analysis** app.

**Context:** Phase 01 created the project structure with `package.json`, TypeScript configs, Vite config, and minimal entry files. The app uses React + Vite for the frontend and a Node.js/TypeScript backend with PostgreSQL.

## Overview

- Create Docker Compose configuration with app + PostgreSQL services
- Configure Caddy labels for `https://chat-analysis.localhost`
- Create `.dockerignore` to optimize the build context
- Copy `.env.example` to `.env` with development defaults

## Steps

### 1. Create Docker Compose configuration

**Files to create:** `docker-compose.yml`

```yaml
services:
  app:
    image: node:24-bookworm
    container_name: chat-analysis-dev
    working_dir: /app
    command:
      - sh
      - -c
      - |
        corepack enable &&
        corepack prepare --activate &&
        pnpm install &&
        pnpm dev
    env_file:
      - .env
    environment:
      CHOKIDAR_USEPOLLING: "true"
      WATCHPACK_POLLING: "true"
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      db:
        condition: service_healthy
    labels:
      caddy: chat-analysis.localhost
      caddy.tls: internal
      caddy.reverse_proxy: "{{upstreams 5173}}"
    networks:
      - web
      - default
    stdin_open: true
    tty: true

  db:
    image: postgres:17
    container_name: chat-analysis-db
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: chat-analysis
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - default

networks:
  web:
    external: true

volumes:
  pgdata:
```

Note: The app container runs `pnpm dev` which starts the `tsx watch` server. In production, the `pnpm start` command runs the built server. During development, Vite's dev server runs on port 5173 and the API server runs on port 4000 — Vite proxies `/api/*` and `/auth/*` to the API server.

However, since the `pnpm dev` script currently only runs the backend server (`tsx watch`), we need to update the startup command to run both the Vite dev server and the backend concurrently. Update the `package.json` scripts:

**Files to modify:** `package.json` — update the `dev` script:

```json
{
  "scripts": {
    "dev": "node --import tsx ./src/server/index.ts",
    "dev:full": "concurrently \"pnpm dev\" \"pnpm dev:client\"",
    "dev:client": "vite",
    "build": "vite build && tsc -p tsconfig.node.json --noEmit",
    "start": "node dist/server/index.js",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.node.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "codegen": "graphql-codegen",
    "migration:generate": "typeorm migration:generate -d src/server/data-source.ts",
    "migration:run": "typeorm migration:run -d src/server/data-source.ts"
  }
}
```

Add concurrently:

```bash
pnpm add -D concurrently
```

Update the Docker Compose `command` to use `dev:full`:

```yaml
command:
  - sh
  - -c
  - |
    corepack enable &&
    corepack prepare --activate &&
    pnpm install &&
    pnpm dev:full
```

### 2. Create .dockerignore

**Files to create:** `.dockerignore`

```
node_modules
dist
build
.git
.gitignore
.DS_Store
*.log
pnpm-debug.log*
npm-debug.log*
playwright-report
coverage
test-results
e2e
```

### 3. Create .env from template

**Files to create:** `.env`

```bash
# Database
DATABASE_URL=postgresql://dev:dev@db:5432/chat-analysis

# Authentication (Better Auth)
BETTER_AUTH_SECRET=dev-secret-change-in-production
BETTER_AUTH_URL=https://chat-analysis.localhost
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# AI — LLM Providers (provide at least one)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=

# Server
PORT=4000
NODE_ENV=development
```

## Verification

```bash
# Ensure the shared Caddy network exists
docker network create web 2>/dev/null || true

# Start the environment
docker compose up -d --build

# Verify the container is running
docker compose ps

# Verify pnpm is available inside
docker compose exec app pnpm --version

# Check PostgreSQL is healthy
docker compose exec db pg_isready -U dev

# Stop the environment
docker compose down
```

Expected: Both containers start. pnpm is available in the app container. PostgreSQL responds to health checks. When Caddy is running, the app should be accessible at `https://chat-analysis.localhost`.

## When done

Report: files created/modified, container status, and any issues encountered.
