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
   - `OPENAI_API_KEY` — OpenAI API key
   - Note: `DATABASE_URL` is auto-injected — do NOT set it
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
