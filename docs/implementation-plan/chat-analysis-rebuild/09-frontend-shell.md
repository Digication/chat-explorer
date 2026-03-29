# Phase 09 — Frontend Shell & Navigation

## Context

Phases 01-08 built the complete backend: database schema, Better Auth with Google OAuth and role-based access, CSV upload with TORI extraction, consent management, analytics engine with caching, and a GraphQL API layer with all resolvers. The server runs in Docker behind Caddy and exposes a GraphQL endpoint at `/graphql`. This phase builds the frontend shell: the entry point, theming, authentication flow, routing, sidebar navigation, and the layout wrapper that every page will render inside.

## Goal

Build a Digication-style frontend shell with a dark sidebar, light/dark theme support, Google OAuth login, protected routes, and Apollo Client wired to the GraphQL backend. The sidebar collapses to 60px (icon-only) and expands to 280px (with labels) on hover. The app uses the Digication design language: 5px spacing unit, 2px border radius, Helvetica Neue font stack, no uppercase buttons, #f5f7fa light background. Every page in future phases will render inside this shell.

## Implementation

### 1. Theme Configuration

**Create `src/lib/theme.ts`**

Build MUI theme overrides that match the Digication design language. Create both light and dark variants:

**Spacing:**
- Override MUI's default 8px spacing to 5px: `spacing: 5` (so `theme.spacing(1) = 5px`, `theme.spacing(2) = 10px`, etc.).

**Typography:**
- Font family: `"Helvetica Neue", Helvetica, Arial, sans-serif`.
- Bold weight: 500 (not MUI's default 700).
- Body text color (light mode): `#191a1b`.
- Button text: `textTransform: 'none'`, `letterSpacing: 0.45`.
- No uppercase transforms anywhere.

**Shape:**
- Border radius: `2px` globally (`theme.shape.borderRadius = 2`).

**Light palette:**
- Primary: `#1976d2`.
- Background default: `#f5f7fa`.
- Background paper: `#ffffff`.
- Text primary: `#191a1b`.

**Dark palette:**
- Primary: `#1976d2` (same as light).
- Background default: `#1a1a1a`.
- Background paper: `#222222`.
- Text primary: `#e0e0e0`.

**Component overrides:**
- `MuiButton`: Remove uppercase, set letter spacing 0.45, secondary variant uses `#26282b` background with `#4a90e2` hover.
- `MuiTextField`: Default variant `standard` (underline, not outlined).
- `MuiSvgIcon`: Medium size = 20px, small size = 16px.
- `MuiPaper`: 2px border radius, no default elevation in light mode.

**Panel style** (use as a reusable sx object or styled component):
- White background (light) / `#222222` (dark).
- 2px border radius.
- 20px padding.
- 20px bottom margin.

**Max content width:** `1063px`, centered with auto margins.

Export:
- `lightTheme` — The complete light MUI theme.
- `darkTheme` — The complete dark MUI theme.
- `sidebarTheme` — Always dark, used to wrap the sidebar so it stays dark even in light mode.
- `panelSx` — Reusable panel style object.

### 2. Auth Client

**Create `src/lib/auth-client.ts`**

Configure the Better Auth client for the frontend:

- Point the auth client to the backend URL (use environment variable or relative path since Caddy proxies everything to the same domain).
- Export `authClient` with methods: `signIn.social({ provider: 'google' })`, `signOut()`, `getSession()`.
- Configure to send cookies with every request (`credentials: 'include'`).

### 3. Auth Provider

**Create `src/lib/AuthProvider.tsx`**

React context provider that manages authentication state:

- On mount, call `authClient.getSession()` to check if the user is already logged in.
- Store user state: `{ user: AuthUser | null, loading: boolean, error: string | null }`.
- Provide `signIn()` (triggers Google OAuth popup/redirect), `signOut()`, and the user state to children via context.
- Export `useAuth()` hook for consuming components.
- While loading, render a centered spinner (no flash of login page).

### 4. Apollo Client

**Create `src/lib/apollo-client.ts`**

Configure Apollo Client for GraphQL:

- HTTP link pointing to `/graphql` (relative, since Caddy handles routing).
- Set `credentials: 'include'` on the HTTP link so auth cookies are sent.
- Configure an in-memory cache with sensible type policies (e.g., merge arrays for paginated queries).
- Error link that handles `UNAUTHENTICATED` errors by redirecting to the login page.
- Export the configured `ApolloClient` instance.

### 5. Entry Point

**Create `src/main.tsx`**

The React entry point:

- Import and render `<App />` into the `#root` element.
- Wrap with `<React.StrictMode>`.
- No other providers here (they go in `App.tsx`).

**Create `index.html`**

Standard Vite HTML entry:

- `<div id="root"></div>`.
- `<script type="module" src="/src/main.tsx"></script>`.
- Title: "Chat Analysis".
- Meta viewport for responsive behavior.
- Preconnect to Google Fonts if using any web fonts (but primary font is Helvetica Neue which is a system font, so this may not be needed).

### 6. App Component & Router

**Create `src/App.tsx`**

The root component that assembles all providers and defines routes:

- `ThemeProvider` wrapping the entire app (use light theme by default, with a toggle stored in localStorage).
- `CssBaseline` for MUI reset.
- `ApolloProvider` with the configured client.
- `AuthProvider` wrapping the router.
- React Router with these routes:
  - `/login` — `LoginPage` (public, redirects to `/` if already authenticated).
  - `/` — `AppShell` wrapper containing:
    - `/` (index) — Dashboard/Home page (placeholder for Phase 10).
    - `/insights` — Insights page (placeholder for Phase 11).
    - `/chat` — Chat Explorer page (placeholder for Phase 14).
    - `/reports` — Reports page (placeholder for Phase 13).
    - `/settings` — Settings page (placeholder).
  - `*` — 404 not found page.
- Protected route logic: If user is not authenticated and tries to access any route other than `/login`, redirect to `/login`.
- Dark mode state: Store preference in localStorage key `theme-mode`. Provide a toggle function via context or a simple zustand store.

### 7. Login Page

**Create `src/pages/LoginPage.tsx`**

A clean login page:

- Centered card on the `#f5f7fa` background.
- Application logo or title ("Chat Analysis") at the top.
- "Sign in with Google" button using MUI Button with a Google icon.
- On click, calls `authClient.signIn.social({ provider: 'google' })`.
- If the user is already authenticated (check via `useAuth()`), redirect to `/`.
- Error display if sign-in fails.
- No email/password fields (Google OAuth only).

### 8. App Shell Layout

**Create `src/components/layout/AppShell.tsx`**

The layout wrapper for all authenticated pages:

- Contains the `Sidebar` on the left and a content area on the right.
- Content area has left margin equal to the sidebar width (60px collapsed).
- Content area is scrollable independently.
- Max content width: 1063px, centered horizontally within the content area.
- Padding: 20px on all sides of the content area.
- Renders the child route via React Router's `<Outlet />`.
- No top header bar. Navigation is entirely in the sidebar.

### 9. Sidebar

**Create `src/components/layout/Sidebar.tsx`**

The main navigation component, always rendered in dark theme:

**Structure:**
- Fixed position on the left side of the viewport.
- Full viewport height.
- Width transitions between 60px (collapsed) and 280px (expanded).
- Always wrapped in the `sidebarTheme` provider so it stays dark regardless of the app's light/dark mode.
- Background: `#1a1a1a` (or the dark theme paper color).

**Expand/collapse behavior:**
- Default state: collapsed (60px, icon-only).
- On mouse enter: expand to 280px with a smooth CSS transition (200ms ease).
- On mouse leave: collapse back to 60px.
- Optional: A pin button to keep it expanded (stored in localStorage).

**Navigation items** (top section):
- Home/Dashboard — icon: `HomeOutlined` (or similar), path: `/`.
- Insights — icon: `InsightsOutlined`, path: `/insights`.
- Chat Explorer — icon: `ChatOutlined`, path: `/chat`.
- Reports — icon: `DescriptionOutlined`, path: `/reports`.
- Settings — icon: `SettingsOutlined`, path: `/settings`.

Each item:
- Shows only the icon when collapsed, icon + label when expanded.
- Tooltip with the label when collapsed (using MUI Tooltip).
- Active state: Highlighted background when the current route matches.
- Hover state: Subtle background highlight.

**User section** (bottom of sidebar):
- User avatar (from Google OAuth profile picture) or initials fallback.
- When expanded: show user name and email below the avatar.
- Sign out button/link.
- Dark mode toggle (sun/moon icon).

**Responsive considerations:**
- On mobile (viewport < 768px), sidebar becomes a hamburger menu that slides in as an overlay.
- The sidebar overlay has a backdrop that closes the sidebar when clicked.
- Mobile sidebar is always 280px wide when open.

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/theme.ts` | Light + dark + sidebar MUI themes with Digication design tokens |
| `src/lib/auth-client.ts` | Better Auth client configuration |
| `src/lib/AuthProvider.tsx` | React context for auth state, useAuth() hook |
| `src/lib/apollo-client.ts` | Apollo Client with credentials and error handling |
| `src/main.tsx` | React entry point |
| `src/App.tsx` | Root component with providers, router, dark mode state |
| `src/pages/LoginPage.tsx` | Google OAuth login page |
| `src/components/layout/AppShell.tsx` | Layout shell with sidebar + content area |
| `src/components/layout/Sidebar.tsx` | Dark-themed collapsible sidebar navigation |
| `index.html` | Vite HTML entry point |

## Verification

Run from the project root:

```bash
# Type-check the frontend code
docker compose exec chat-explorer pnpm tsc --noEmit

# Build to verify no compilation errors
docker compose exec chat-explorer pnpm build

# Start the dev server
docker compose up -d --build
```

Then open `https://chat-explorer.localhost` in a browser and verify:

- [ ] All 10 files exist in their specified paths.
- [ ] TypeScript compiles with no errors.
- [ ] The login page renders at `/login` with a Google sign-in button.
- [ ] Unauthenticated users are redirected from `/` to `/login`.
- [ ] After Google OAuth sign-in, user is redirected to `/`.
- [ ] The sidebar renders on the left, collapsed to 60px.
- [ ] Hovering the sidebar expands it to 280px with labels visible.
- [ ] Moving the mouse off the sidebar collapses it back to 60px.
- [ ] Clicking a nav item navigates to the correct route.
- [ ] The active nav item is visually highlighted.
- [ ] Tooltips appear on nav icons when the sidebar is collapsed.
- [ ] The user avatar and name appear at the bottom of the expanded sidebar.
- [ ] Sign out returns to the login page.
- [ ] Dark mode toggle switches the content area between light and dark themes.
- [ ] The sidebar remains dark in both light and dark mode.
- [ ] Content area is capped at 1063px width and centered.
- [ ] Panel elements use 2px border radius, 20px padding.
- [ ] Buttons have no uppercase text transform.
- [ ] Text inputs use the standard (underline) variant.
- [ ] On mobile viewport (< 768px), the sidebar becomes a hamburger overlay.
- [ ] Spacing increments are 5px (inspect element to verify padding/margin values).
