import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import { MemoryRouter } from "react-router";

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

import AdminPage from "../AdminPage";

function renderAdminPage(role = "digication_admin", initialEntries = ["/admin"]) {
  mockUseAuth.mockReturnValue({
    user: {
      id: "u1",
      role,
      institutionId: "inst-1",
    },
    isLoading: false,
    isAuthenticated: true,
  });

  return render(
    <MockedProvider mocks={[]}>
      <MemoryRouter initialEntries={initialEntries}>
        <AdminPage />
      </MemoryRouter>
    </MockedProvider>
  );
}

describe("AdminPage", () => {
  it("renders Admin Console heading", () => {
    renderAdminPage();
    expect(screen.getByText("Admin Console")).toBeInTheDocument();
  });

  it("shows Users and Course Access tabs for all admin roles", () => {
    renderAdminPage("institution_admin");
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Course Access")).toBeInTheDocument();
  });

  it("shows Institutions tab only for digication_admin", () => {
    renderAdminPage("digication_admin");
    expect(screen.getByText("Institutions")).toBeInTheDocument();
  });

  it("hides Institutions tab for institution_admin", () => {
    renderAdminPage("institution_admin");
    expect(screen.queryByText("Institutions")).not.toBeInTheDocument();
  });
});
