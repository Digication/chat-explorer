# Environment
- Package manager: pnpm
- Language: TypeScript
- **Dev setup**: Docker + Caddy reverse proxy. Start with `docker compose up -d --build`. The app is served at `https://<name>.localhost` via Caddy labels. Do NOT use `pnpm dev` directly on the host. Do NOT add `ports:` mappings to docker-compose.yml as a workaround — if the app isn't accessible, ensure Caddy is running (`cd ~/caddy && docker compose up -d`).
- **Unit tests**: `docker compose exec <app-name> pnpm test`
- **E2e tests**: `docker compose run --rm e2e`
