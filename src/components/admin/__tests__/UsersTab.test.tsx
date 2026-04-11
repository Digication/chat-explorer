import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router";
import { GET_USERS, GET_INSTITUTIONS, ASSIGN_ROLE } from "@/lib/queries/admin";

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

import UsersTab from "../UsersTab";

const MOCK_USERS = [
  {
    id: "u1",
    name: "Alice Smith",
    email: "alice@example.com",
    role: "instructor",
    institutionId: "inst-1",
    institution: { id: "inst-1", name: "Test University" },
  },
  {
    id: "u2",
    name: "Bob Jones",
    email: "bob@example.com",
    role: "institution_admin",
    institutionId: "inst-1",
    institution: { id: "inst-1", name: "Test University" },
  },
];

const MOCK_INSTITUTIONS = [
  { id: "inst-1", name: "Test University", domain: "test.edu", slug: "test" },
];

function getUsersMock(
  variables: Record<string, unknown> = {},
  users = MOCK_USERS
): MockedResponse {
  return {
    request: {
      query: GET_USERS,
      variables: { search: undefined, institutionId: undefined, ...variables },
    },
    result: { data: { users } },
  };
}

function getInstitutionsMock(): MockedResponse {
  return {
    request: { query: GET_INSTITUTIONS },
    result: { data: { institutions: MOCK_INSTITUTIONS } },
  };
}

function renderUsersTab(mocks: MockedResponse[] = []) {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <MemoryRouter>
        <UsersTab />
      </MemoryRouter>
    </MockedProvider>
  );
}

describe("UsersTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "admin-1",
        role: "digication_admin",
        institutionId: "inst-1",
      },
      isLoading: false,
      isAuthenticated: true,
    });
  });

  it("renders user table with data", async () => {
    renderUsersTab([getUsersMock(), getInstitutionsMock()]);

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });
  });

  it("shows loading skeletons initially", () => {
    renderUsersTab([getUsersMock()]);
    // MUI Skeleton renders with role="progressbar" or just as spans
    // During loading, the table should not be visible yet
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
  });

  it("shows empty state when no users found", async () => {
    renderUsersTab([getUsersMock({}, [])]);

    await waitFor(() => {
      expect(screen.getByText("No users found.")).toBeInTheDocument();
    });
  });

  it("shows error with retry button", async () => {
    const errorMock: MockedResponse = {
      request: {
        query: GET_USERS,
        variables: { search: undefined, institutionId: undefined },
      },
      error: new Error("Network error"),
    };

    renderUsersTab([errorMock]);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("shows search input", () => {
    renderUsersTab([getUsersMock()]);
    expect(
      screen.getByPlaceholderText("Search by name or email")
    ).toBeInTheDocument();
  });

  it("shows Invite User button", () => {
    renderUsersTab([getUsersMock()]);
    expect(screen.getByText("Invite User")).toBeInTheDocument();
  });
});
