import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

const mockUseAuth = vi.fn();
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

import RoleBasedRedirect from "../RoleBasedRedirect";

function renderWithRouter() {
  let currentPath = "";

  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<RoleBasedRedirect />} />
        <Route
          path="/student"
          element={<div data-testid="student-page" />}
        />
        <Route
          path="/insights"
          element={<div data-testid="insights-page" />}
        />
      </Routes>
    </MemoryRouter>
  );

  return { currentPath };
}

describe("RoleBasedRedirect", () => {
  it("redirects student to /student", () => {
    mockUseAuth.mockReturnValue({
      user: { role: "student" },
      isLoading: false,
      isAuthenticated: true,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RoleBasedRedirect />} />
          <Route
            path="/student"
            element={<div data-testid="student-page" />}
          />
          <Route
            path="/insights"
            element={<div data-testid="insights-page" />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector("[data-testid='student-page']")).toBeTruthy();
  });

  it("redirects instructor to /insights", () => {
    mockUseAuth.mockReturnValue({
      user: { role: "instructor" },
      isLoading: false,
      isAuthenticated: true,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RoleBasedRedirect />} />
          <Route
            path="/student"
            element={<div data-testid="student-page" />}
          />
          <Route
            path="/insights"
            element={<div data-testid="insights-page" />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(
      container.querySelector("[data-testid='insights-page']")
    ).toBeTruthy();
  });

  it("redirects admin to /insights", () => {
    mockUseAuth.mockReturnValue({
      user: { role: "digication_admin" },
      isLoading: false,
      isAuthenticated: true,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<RoleBasedRedirect />} />
          <Route
            path="/student"
            element={<div data-testid="student-page" />}
          />
          <Route
            path="/insights"
            element={<div data-testid="insights-page" />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(
      container.querySelector("[data-testid='insights-page']")
    ).toBeTruthy();
  });
});
