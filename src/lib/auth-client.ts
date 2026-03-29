import { createAuthClient } from "better-auth/react";

// Point auth client directly to Express server on localhost:4000.
// The session cookie lives on localhost (set during Google OAuth callback),
// so all auth requests must go to the same domain to include the cookie.
export const authClient = createAuthClient({
  baseURL: "http://localhost:4000",
  fetchOptions: {
    credentials: "include",  // send cookies cross-origin
  },
});

export const { useSession, signIn, signOut } = authClient;
