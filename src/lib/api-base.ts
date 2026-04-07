// Returns the base URL for API requests.
//
// In production, the React app and Express server are served from the same
// origin (the Railway URL), so we can use relative paths and let the browser
// resolve them. Returning an empty string makes URLs like `${API_BASE}/graphql`
// resolve to `/graphql` on the current origin.
//
// In development, the React app runs on https://chat-explorer.localhost (Vite
// behind Caddy) but the Express API runs on http://localhost:4000 — a different
// origin. Auth cookies are scoped to localhost:4000, so the frontend must talk
// to that exact host.
export const API_BASE = import.meta.env.PROD ? "" : "http://localhost:4000";
