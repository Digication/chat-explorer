import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/lib/__tests__/test-utils";
import type { MockedResponse } from "@apollo/client/testing";
import { GET_STUDENT_PROFILE } from "@/lib/queries/analytics";
import StudentProfilePage from "@/pages/StudentProfilePage";

// Mock hooks
const mockScope = { institutionId: "inst-1", courseId: "course-1" };
vi.mock("@/components/insights/ScopeSelector", () => ({
  useInsightsScope: () => ({ scope: mockScope, setScope: vi.fn() }),
  InsightsScopeProvider: ({ children }: any) => children,
}));

vi.mock("@/lib/UserSettingsContext", () => ({
  useUserSettings: () => ({
    getDisplayName: (name: string) => name,
    hideStudentNames: false,
  }),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useParams: () => ({ studentId: "student-1" }),
    useNavigate: () => vi.fn(),
  };
});

const MOCK_PROFILE = {
  studentId: "student-1",
  name: "Jane Doe",
  totalComments: 12,
  totalWordCount: 840,
  avgWordCount: 70,
  threadCount: 4,
  assignmentCount: 3,
  overallCategoryDistribution: {
    DESCRIPTIVE_WRITING: 2,
    DESCRIPTIVE_REFLECTION: 4,
    DIALOGIC_REFLECTION: 5,
    CRITICAL_REFLECTION: 1,
  },
  perAssignment: [
    {
      assignmentId: "a1",
      assignmentName: "Assignment 1",
      date: "2026-01-15T00:00:00.000Z",
      modalCategory: "DESCRIPTIVE_WRITING",
      commentCount: 3,
      categoryDistribution: {
        DESCRIPTIVE_WRITING: 2,
        DESCRIPTIVE_REFLECTION: 1,
        DIALOGIC_REFLECTION: 0,
        CRITICAL_REFLECTION: 0,
      },
    },
    {
      assignmentId: "a2",
      assignmentName: "Assignment 2",
      date: "2026-02-15T00:00:00.000Z",
      modalCategory: "DIALOGIC_REFLECTION",
      commentCount: 5,
      categoryDistribution: {
        DESCRIPTIVE_WRITING: 0,
        DESCRIPTIVE_REFLECTION: 2,
        DIALOGIC_REFLECTION: 3,
        CRITICAL_REFLECTION: 0,
      },
    },
  ],
  toriTagDistribution: [
    { tagId: "t1", tagName: "Critical thinking", domain: "Cognitive-Analytical", count: 5, percent: 50 },
    { tagId: "t2", tagName: "Self-awareness", domain: "Personal Growth", count: 3, percent: 30 },
  ],
  topToriTags: ["Critical thinking", "Self-awareness"],
  evidenceHighlights: [
    {
      commentId: "c1",
      text: "I realized that my approach to problem-solving was fundamentally flawed because I never questioned my assumptions.",
      category: "DIALOGIC_REFLECTION",
      evidenceQuote: "I realized that my approach was fundamentally flawed",
      rationale: "Student examines their own thinking process",
      assignmentName: "Assignment 2",
      threadId: "thread-1",
      timestamp: "2026-02-15T10:30:00.000Z",
    },
  ],
};

function profileMock(
  overrides: Partial<typeof MOCK_PROFILE> = {}
): MockedResponse {
  return {
    request: {
      query: GET_STUDENT_PROFILE,
      variables: { scope: mockScope, studentId: "student-1" },
    },
    result: {
      data: {
        studentProfile: {
          data: { ...MOCK_PROFILE, ...overrides },
          meta: {
            consentedStudentCount: 1,
            excludedStudentCount: 0,
            computedAt: "2026-04-11T00:00:00.000Z",
            cached: false,
          },
        },
      },
    },
  };
}

function errorMock(): MockedResponse {
  return {
    request: {
      query: GET_STUDENT_PROFILE,
      variables: { scope: mockScope, studentId: "student-1" },
    },
    error: new Error("Network error"),
  };
}

describe("StudentProfilePage", () => {
  it("renders loading skeleton while query is in flight", () => {
    render(
      renderWithProviders({
        mocks: [profileMock()],
        children: <StudentProfilePage />,
      })
    );
    // Skeleton elements should be visible
    const skeletons = document.querySelectorAll(".MuiSkeleton-root");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders student name in breadcrumb", async () => {
    render(
      renderWithProviders({
        mocks: [profileMock()],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    });
  });

  it("renders summary cards with correct values", async () => {
    render(
      renderWithProviders({
        mocks: [profileMock()],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      // Multiple elements match due to card + donut + table — use getAllByText
      expect(screen.getAllByText("12").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Comments/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Assignments/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("70")).toBeInTheDocument(); // avg words
    });
  });

  it("renders category distribution donut", async () => {
    render(
      renderWithProviders({
        mocks: [profileMock()],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      // The donut should show "comments" label in the center
      expect(screen.getByText("comments")).toBeInTheDocument();
      expect(screen.getByText("Reflection Category Breakdown")).toBeInTheDocument();
    });
  });

  it("renders TORI tag bars", async () => {
    render(
      renderWithProviders({
        mocks: [profileMock()],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      expect(screen.getByText("Critical thinking")).toBeInTheDocument();
      expect(screen.getByText("Self-awareness")).toBeInTheDocument();
    });
  });

  it("renders evidence highlights", async () => {
    render(
      renderWithProviders({
        mocks: [profileMock()],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      expect(
        screen.getByText(/I realized that my approach was fundamentally flawed/)
      ).toBeInTheDocument();
      expect(screen.getByText("View full conversation →")).toBeInTheDocument();
    });
  });

  it("shows empty state when totalComments is 0", async () => {
    render(
      renderWithProviders({
        mocks: [profileMock({ totalComments: 0 })],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      expect(
        screen.getByText(/No reflection data found/)
      ).toBeInTheDocument();
    });
  });

  it("shows error state on GraphQL error", async () => {
    render(
      renderWithProviders({
        mocks: [errorMock()],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      expect(screen.getByText(/Failed to load student profile/)).toBeInTheDocument();
    });
  });

  it("renders breadcrumb Insights link", async () => {
    render(
      renderWithProviders({
        mocks: [profileMock()],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      const insightsLink = screen.getByText("Insights");
      expect(insightsLink).toBeInTheDocument();
      expect(insightsLink.closest("a")).toHaveAttribute("href", "/insights");
    });
  });

  it("renders per-assignment table", async () => {
    render(
      renderWithProviders({
        mocks: [profileMock()],
        children: <StudentProfilePage />,
      })
    );
    await waitFor(() => {
      // Assignment names appear in both sparkline and table — use getAllByText
      expect(screen.getAllByText("Assignment 1").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Assignment 2").length).toBeGreaterThanOrEqual(1);
    });
  });
});
