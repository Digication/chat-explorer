# Phase 17 — Railway Deployment & Deploy Skill

You are setting up Railway deployment and updating the Claude Code deploy skill for the **Chat Analysis** app.

**Context:** Phases 01–16 built and tested the complete application. It runs locally via Docker Compose with PostgreSQL. The app has a Node.js/Express backend with GraphQL Yoga and a Vite React frontend. The build outputs a server at `dist/server/index.js` and static files at `dist/client/`. The unified LLM layer supports OpenAI, Anthropic, and Google providers.

## Goal

Configure the app for Railway deployment with proper build scripts, health checks, and environment variable documentation. Update the deploy skill to include the new API keys for the unified LLM layer.

## Overview

- Create a production build configuration
- Create `railway.json` with start command and health check
- Document Railway setup steps
- Update the deploy skill at `.claude/skills/deploy/SKILL.md`

## Steps

### 1. Update build scripts for production

**Files to modify:** `package.json` — ensure the build and start scripts work for Railway:

The `build` script should:
1. Build the Vite frontend (`vite build` produces `dist/client/`)
2. Compile the TypeScript server (`tsc -p tsconfig.node.json` produces `dist/server/`)

The `start` script should:
1. Run the compiled server (`node dist/server/index.js`)
2. The server should serve static files from `dist/client/` in production

**Files to modify:** `src/server/index.ts` — add static file serving for production:

```typescript
// Add after all API routes, before app.listen:
import { fileURLToPath } from "url";
import { dirname, join } from "path";

if (process.env.NODE_ENV === "production") {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const clientDir = join(__dirname, "..", "client");
  app.use(express.static(clientDir));
  // Serve index.html for all non-API routes (SPA fallback)
  app.get("*", (_req, res) => {
    res.sendFile(join(clientDir, "index.html"));
  });
}
```

### 2. Create railway.json

**Files to create:** `railway.json`

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node dist/server/index.js",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### 3. Document Railway deployment steps

The deployment process:

```bash
# 1. Install Railway CLI (if not already installed)
brew install railway

# 2. Login to Railway
railway login

# 3. Initialize a new Railway project
railway init

# 4. Add PostgreSQL database
railway add --plugin postgresql

# 5. Set environment variables
railway variables set NODE_ENV=production
railway variables set BETTER_AUTH_SECRET=<generate-a-secure-random-string>
railway variables set BETTER_AUTH_URL=<your-railway-app-url>
railway variables set GOOGLE_CLIENT_ID=<your-google-client-id>
railway variables set GOOGLE_CLIENT_SECRET=<your-google-client-secret>
railway variables set OPENAI_API_KEY=<your-openai-api-key>
railway variables set ANTHROPIC_API_KEY=<your-anthropic-api-key>
railway variables set GOOGLE_AI_API_KEY=<your-google-ai-api-key>
# DATABASE_URL is auto-injected by Railway — do NOT set it manually

# 6. Deploy
railway up

# 7. Check status
railway status

# 8. Open the deployed app
railway open
```

### 4. Update the deploy skill

**Files to modify:** `.claude/skills/deploy/SKILL.md`

Update the deploy skill to include the new environment variables for the unified LLM layer. The key changes from the previous version:

- Add `ANTHROPIC_API_KEY` and `GOOGLE_AI_API_KEY` to the setup steps
- Note that only `OPENAI_API_KEY` is required; the other two are optional (the LLM layer disables unavailable providers)
- Update the error handling table with LLM-related errors

The updated skill content:

```markdown
---
name: deploy
description: Deploy the Chat Analysis app to Railway, check deployment status, or view logs.
---

# Deploy to Railway

Deploy the Chat Analysis application to Railway cloud hosting.

## Prerequisites

- Railway CLI installed (`brew install railway` or `npm i -g @railway/cli`)
- Authenticated with Railway (`railway login`)
- Project linked (`railway init` or `railway link`)

## Argument Parsing

| User says | Action |
|---|---|
| `deploy`, `deploy it`, `ship it` | Full deploy (build + push) |
| `deploy status`, `deploy check` | Check deployment status |
| `deploy logs` | View recent logs |
| `deploy setup` | First-time Railway setup |

## Full Deploy

1. Run `pnpm build` to create the production build (compiles TypeScript server and bundles React frontend)
2. Verify the build succeeded — check that `dist/server/index.js` and `dist/client/index.html` exist
3. Run `railway up` to deploy to Railway
4. Run `railway status` to confirm the deployment succeeded
5. Report the deployment URL

If the build fails, show the error and suggest fixes before attempting to deploy.

## Check Status

1. Run `railway status`
2. Report:
   - Service status (deploying, running, failed)
   - Deployment URL
   - Any errors or warnings

## View Logs

1. Run `railway logs --lines 50`
2. Summarize findings:
   - Any errors (highlight in bold)
   - Any warnings
   - Recent requests or activity
   - Health check status

## First-Time Setup

Walk the user through initial Railway configuration:

1. Check if Railway CLI is installed: `which railway`
   - If not installed: `brew install railway`
2. Check if logged in: `railway whoami`
   - If not logged in: `railway login`
3. Initialize project: `railway init`
4. Add PostgreSQL: `railway add --plugin postgresql`
5. Set environment variables:
   ```bash
   railway variables set NODE_ENV=production
   railway variables set BETTER_AUTH_SECRET=$(openssl rand -hex 32)
   ```
6. Ask the user for these values and set them:
   - `GOOGLE_CLIENT_ID` — Google OAuth client ID
   - `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
   - `OPENAI_API_KEY` — from OpenAI (required for AI chat)
   - `ANTHROPIC_API_KEY` — from Anthropic (optional — enables Claude models)
   - `GOOGLE_AI_API_KEY` — from Google AI Studio (optional — enables Gemini models)
   - Note: `DATABASE_URL` is auto-injected by Railway — do NOT set it
7. Run first deploy: `railway up`
8. Get the URL: `railway open`
9. Update `BETTER_AUTH_URL` with the actual Railway URL:
   ```bash
   railway variables set BETTER_AUTH_URL=https://<actual-railway-url>
   ```
10. Redeploy to pick up the URL change: `railway up`
11. Remind user to add the Railway callback URL to Google OAuth:
    `https://<actual-railway-url>/api/auth/callback/google`

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| `railway: command not found` | CLI not installed | `brew install railway` |
| `Not logged in` | No auth session | `railway login` |
| `No project linked` | Project not initialized | `railway init` or `railway link` |
| Build fails | TypeScript or Vite errors | Fix the build errors first, then redeploy |
| Health check fails | Server not responding on `/api/health` | Check `railway logs` for startup errors |
| Auth redirect fails | `BETTER_AUTH_URL` doesn't match Railway URL | Update the variable and redeploy |
| DB connection error | `DATABASE_URL` not set | Railway should auto-inject it; check `railway variables` |
| AI chat returns error | LLM API key missing or invalid | Check `railway variables` for the provider's API key |
| Model picker shows no providers | No LLM API keys configured | Set at least `OPENAI_API_KEY` |
```

## Files to Create

| File | Purpose |
|------|---------|
| `railway.json` | Railway deployment configuration |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Ensure build and start scripts work for production |
| `src/server/index.ts` | Add static file serving for production |
| `.claude/skills/deploy/SKILL.md` | Update with new LLM API key variables |

## Verification

```bash
# Verify the build works locally:
docker compose exec app pnpm build
# Should produce dist/client/ and dist/server/

# Verify railway.json is valid:
cat railway.json | python3 -m json.tool

# Verify the deploy skill exists and includes new API keys:
cat .claude/skills/deploy/SKILL.md
```

Expected: Production build succeeds. `railway.json` is valid JSON. Deploy skill file exists with complete documentation including all three LLM API keys.

## When done

Report: files created/modified (with summary per file), build results, and any issues encountered. Include the Railway deployment URL if deployment was performed.
