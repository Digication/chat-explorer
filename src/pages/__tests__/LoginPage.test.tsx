import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// Mock useAuth — default: not authenticated, not loading
const mockUseAuth = vi.fn(() => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock authClient.signIn.magicLink
const mockSignInMagicLink = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      magicLink: (...args: unknown[]) => mockSignInMagicLink(...args),
    },
  },
}));

// Mock API_BASE
vi.mock("@/lib/api-base", () => ({
  API_BASE: "http://localhost:4000",
}));

import LoginPage from "../LoginPage";

function renderLogin(initialEntries = ["/login"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it("renders Google sign-in button", () => {
    renderLogin();
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
  });

  it("renders magic link email field and button", () => {
    renderLogin();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(screen.getByText("Send magic link")).toBeInTheDocument();
  });

  it("shows validation error when submitting empty email", async () => {
    renderLogin();
    fireEvent.click(screen.getByText("Send magic link"));
    expect(
      screen.getByText("Please enter your email address.")
    ).toBeInTheDocument();
  });

  it("shows success message after magic link is sent", async () => {
    mockSignInMagicLink.mockResolvedValue({ error: null });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByText("Send magic link"));

    await waitFor(() => {
      expect(
        screen.getByText(/Check your email for a sign-in link/)
      ).toBeInTheDocument();
    });
  });

  it("shows error when magic link fails (no account)", async () => {
    mockSignInMagicLink.mockResolvedValue({
      error: { message: "User not found" },
    });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.click(screen.getByText("Send magic link"));

    await waitFor(() => {
      expect(
        screen.getByText(/No account found for this email/)
      ).toBeInTheDocument();
    });
  });
});
