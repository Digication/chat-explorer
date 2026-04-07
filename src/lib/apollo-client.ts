import { ApolloClient, InMemoryCache, HttpLink, from } from "@apollo/client";
import { onError } from "@apollo/client/link/error";
import { API_BASE } from "./api-base";

const httpLink = new HttpLink({
  // In dev, point at Express on localhost:4000 (where the auth cookie lives).
  // In production, API_BASE is "" so this resolves to /graphql on the current
  // origin (the Railway URL), which serves both the app and the API.
  uri: `${API_BASE}/graphql`,
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
