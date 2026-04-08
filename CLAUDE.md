# Environment
- Package manager: pnpm
- Language: TypeScript
- **Dev setup**: Docker + Caddy reverse proxy. Start with `docker compose up -d --build`. The app is served at `https://<name>.localhost` via Caddy labels. Do NOT use `pnpm dev` directly on the host. Do NOT add `ports:` mappings to docker-compose.yml as a workaround — if the app isn't accessible, ensure Caddy is running (`cd ~/caddy && docker compose up -d`).
- **Unit tests**: `docker compose exec <app-name> pnpm test`
- **E2e tests**: `docker compose run --rm e2e`

# Reference repos (read-only, for UI/pattern reference)
- **campus-web** — `/Users/jeffreyyan/code/file-based-reflections/campus-web`. This is the Digication Campus web app. It is the source of truth for the UI look-and-feel this project should match: dark sidebar, bottom bar + student carousel spacing, slide-out panels, AI chat history pattern (auto-load latest chat on open, not a fresh one), and general Digication design language. When asked to match "Campus UI" or "Digication patterns", read this repo directly — do NOT rely on memory.

# Production
- **Hosted on:** Railway (Pro plan), project `chat-explorer`
- **URL:** https://chat-explorer.up.railway.app (custom domain `chat-explorer.digication.com` planned)
- **Deploys:** Automatic on push to `main` of [Digication/chat-explorer](https://github.com/Digication/chat-explorer)
- **Migrations:** Run automatically on server startup (`AppDataSource.runMigrations()` in `src/server/index.ts`). In production `synchronize: false` — schema changes MUST go through a migration file in `src/server/migrations/`.
- **Full details:** See `docs/deployment.md` for env vars, architecture, decisions, troubleshooting, and the custom domain rollout plan. This is the source of truth for anything deployment-related.
