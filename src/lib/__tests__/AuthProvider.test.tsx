import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import { gql } from "@apollo/client";

// The GET_ME query used internally by AuthProvider
const GET_ME = gql`
  query AuthMe {
    me {
      id
      role
      institutionId
    }
  }
`;

// Mock useSession from better-auth
const mockUseSession = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  useSession: () => mockUseSession(),
}));

import { AuthProvider, useAuth } from "../AuthProvider";

// A small component that displays auth state for testing
function AuthConsumer() {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return <div>loading</div>;
  if (!isAuthenticated) return <div>not-authenticated</div>;
  return (
    <div>
      <span data-testid="role">{user?.role ?? "none"}</span>
      <span data-testid="institutionId">
        {user?.institutionId ?? "none"}
      </span>
    </div>
  );
}

describe("AuthProvider", () => {
  it("shows not-authenticated when there is no session", async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MockedProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("not-authenticated")).toBeInTheDocument();
    });
  });

  it("fetches role and institutionId from GET_ME when session exists", async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: "u1",
          name: "Alice",
          email: "alice@example.com",
          image: null,
        },
      },
      isPending: false,
    });

    const meMock = {
      request: { query: GET_ME },
      result: {
        data: {
          me: { id: "u1", role: "institution_admin", institutionId: "inst-1" },
        },
      },
    };

    render(
      <MockedProvider mocks={[meMock]} addTypename={false}>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MockedProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("institution_admin");
      expect(screen.getByTestId("institutionId")).toHaveTextContent("inst-1");
    });
  });

  it("shows loading while session is pending", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });

    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MockedProvider>
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
  });
});
