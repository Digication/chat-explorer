import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/lib/__tests__/test-utils";
import type { MockedResponse } from "@apollo/client/testing";
import { GET_COURSES, GET_CROSS_COURSE_COMPARISON } from "@/lib/queries/analytics";
import CrossCourseComparisonPage from "@/pages/CrossCourseComparisonPage";

const mockScope = { institutionId: "inst-1" };

vi.mock("@/components/insights/ScopeSelector", () => ({
  useInsightsScope: () => ({ scope: mockScope, setScope: vi.fn() }),
  InsightsScopeProvider: ({ children }: any) => children,
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

function coursesMock(): MockedResponse {
  return {
    request: {
      query: GET_COURSES,
      variables: { institutionId: "inst-1" },
    },
    result: {
      data: {
        courses: [
          { id: "c1", name: "Course A" },
          { id: "c2", name: "Course B" },
          { id: "c3", name: "Course C" },
        ],
      },
    },
  };
}

describe("CrossCourseComparisonPage", () => {
  it("renders course picker", async () => {
    render(
      renderWithProviders({
        mocks: [coursesMock()],
        children: <CrossCourseComparisonPage />,
      })
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Courses")).toBeInTheDocument();
    });
  });

  it("shows empty state before selection", async () => {
    render(
      renderWithProviders({
        mocks: [coursesMock()],
        children: <CrossCourseComparisonPage />,
      })
    );
    await waitFor(() => {
      expect(
        screen.getByText("Select at least 2 courses to compare.")
      ).toBeInTheDocument();
    });
  });

  it("renders Compare button", async () => {
    render(
      renderWithProviders({
        mocks: [coursesMock()],
        children: <CrossCourseComparisonPage />,
      })
    );
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Compare" });
      expect(btn).toBeInTheDocument();
      // Should be disabled since no courses selected
      expect(btn).toBeDisabled();
    });
  });

  it("renders breadcrumb with Insights link", async () => {
    render(
      renderWithProviders({
        mocks: [coursesMock()],
        children: <CrossCourseComparisonPage />,
      })
    );
    await waitFor(() => {
      const insightsLink = screen.getByText("Insights");
      expect(insightsLink.closest("a")).toHaveAttribute("href", "/insights");
    });
  });
});
