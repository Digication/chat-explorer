import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Mock useAuth with controllable return value
const mockUseAuth = vi.fn();
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useMediaQuery to always return false (desktop view)
vi.mock("@mui/material", async () => {
  const actual = await vi.importActual("@mui/material");
  return {
    ...actual,
    useMediaQuery: () => false,
  };
});

import Sidebar from "../Sidebar";

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("shows Admin nav item for digication_admin", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u1",
        name: "Admin",
        email: "admin@example.com",
        role: "digication_admin",
        institutionId: "inst-1",
      },
      isLoading: false,
      isAuthenticated: true,
    });

    renderSidebar();
    // In collapsed mode, the label is in the tooltip's aria-label
    expect(
      screen.getByTestId("AdminPanelSettingsOutlinedIcon")
    ).toBeInTheDocument();
  });

  it("shows Admin nav item for institution_admin", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u2",
        name: "School Admin",
        email: "school@example.com",
        role: "institution_admin",
        institutionId: "inst-1",
      },
      isLoading: false,
      isAuthenticated: true,
    });

    renderSidebar();
    expect(
      screen.getByTestId("AdminPanelSettingsOutlinedIcon")
    ).toBeInTheDocument();
  });

  it("does not show Admin nav item for instructor", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u3",
        name: "Teacher",
        email: "teacher@example.com",
        role: "instructor",
        institutionId: "inst-1",
      },
      isLoading: false,
      isAuthenticated: true,
    });

    renderSidebar();
    expect(
      screen.queryByTestId("AdminPanelSettingsOutlinedIcon")
    ).not.toBeInTheDocument();
  });
});
