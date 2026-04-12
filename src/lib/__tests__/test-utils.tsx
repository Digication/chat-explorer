import { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockedResponse } from "@apollo/client/testing";

/**
 * Wraps a component with Apollo MockedProvider and React Router MemoryRouter.
 * Use this for any component that depends on GraphQL queries or routing.
 */
export function renderWithProviders({
  mocks = [],
  initialEntries = ["/"],
  children,
}: {
  mocks?: MockedResponse[];
  initialEntries?: string[];
  children: ReactNode;
}) {
  return (
    <MockedProvider mocks={mocks}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </MockedProvider>
  );
}

/**
 * Creates a mock auth context value for testing.
 */
export function mockAuthUser(overrides: {
  role?: string | null;
  institutionId?: string | null;
  id?: string;
  name?: string;
  email?: string;
} = {}) {
  return {
    id: overrides.id ?? "user-1",
    name: overrides.name ?? "Test User",
    email: overrides.email ?? "test@example.com",
    image: null,
    role: overrides.role ?? "instructor",
    institutionId: overrides.institutionId ?? "inst-1",
  };
}
