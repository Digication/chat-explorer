import { createAuthClient } from "better-auth/react";
import { API_BASE } from "./api-base";

// In dev, the auth cookie lives on localhost:4000 (a different origin from
// the Vite dev server), so we have to point at it explicitly.
// In production, the API and the app are on the same origin, so an empty
// baseURL means "current origin".
export const authClient = createAuthClient({
  baseURL: API_BASE,
  fetchOptions: {
    credentials: "include",  // send cookies cross-origin
  },
});

export const { useSession, signIn, signOut } = authClient;
