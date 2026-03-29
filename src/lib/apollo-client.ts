import { ApolloClient, InMemoryCache, HttpLink, from } from "@apollo/client";
import { onError } from "@apollo/client/link/error";

const httpLink = new HttpLink({
  // Point to the Express server directly (same origin as auth cookies).
  // The session cookie is set on localhost:4000 during Google OAuth,
  // so GraphQL requests must go there too — not through Caddy on
  // chat-explorer.localhost, which is a different domain.
  uri: "http://localhost:4000/graphql",
  credentials: "include", // send auth cookies with every request
});

const errorLink = onError((error: any) => {
  const graphQLErrors = error.graphQLErrors;
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      if (err.extensions?.code === "UNAUTHENTICATED") {
        // Redirect to login if the session has expired
        window.location.href = "/login";
      }
    }
  }
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
  },
});
