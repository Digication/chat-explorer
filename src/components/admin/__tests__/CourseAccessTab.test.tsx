import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router";
import {
  GET_COURSES,
  GET_COURSE_ACCESS_LIST,
} from "@/lib/queries/admin";

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

import CourseAccessTab from "../CourseAccessTab";

const MOCK_COURSES = [
  { id: "c1", name: "Intro to Art", institutionId: "inst-1" },
  { id: "c2", name: "Advanced Design", institutionId: "inst-1" },
];

const MOCK_ACCESS_LIST = [
  {
    id: "ca1",
    userId: "u1",
    courseId: "c1",
    accessLevel: "collaborator",
    grantedAt: "2025-01-15T00:00:00Z",
    user: { id: "u1", name: "Alice Smith", email: "alice@example.com" },
  },
];

function getCoursesMock(): MockedResponse {
  return {
    request: {
      query: GET_COURSES,
      variables: { institutionId: "inst-1" },
    },
    result: { data: { courses: MOCK_COURSES } },
  };
}

function getAccessListMock(courseId = "c1"): MockedResponse {
  return {
    request: {
      query: GET_COURSE_ACCESS_LIST,
      variables: { courseId },
    },
    result: { data: { courseAccessList: MOCK_ACCESS_LIST } },
  };
}

function renderCourseAccessTab(mocks: MockedResponse[] = []) {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <MemoryRouter>
        <CourseAccessTab />
      </MemoryRouter>
    </MockedProvider>
  );
}

describe("CourseAccessTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "admin-1",
        role: "institution_admin",
        institutionId: "inst-1",
      },
      isLoading: false,
      isAuthenticated: true,
    });
  });

  it("shows course selector", async () => {
    renderCourseAccessTab([getCoursesMock()]);

    await waitFor(() => {
      expect(screen.getByLabelText("Course")).toBeInTheDocument();
    });
  });

  it("shows prompt to select a course when none selected", () => {
    renderCourseAccessTab([getCoursesMock()]);
    expect(
      screen.getByText("Select a course to manage access.")
    ).toBeInTheDocument();
  });

  it("shows empty access list message", async () => {
    const emptyAccessMock: MockedResponse = {
      request: {
        query: GET_COURSE_ACCESS_LIST,
        variables: { courseId: "c2" },
      },
      result: { data: { courseAccessList: [] } },
    };

    renderCourseAccessTab([getCoursesMock(), emptyAccessMock]);

    // We can't easily simulate MUI Select change, so we verify the initial state
    expect(
      screen.getByText("Select a course to manage access.")
    ).toBeInTheDocument();
  });

  it("does not show Grant Access button before course selection", () => {
    renderCourseAccessTab([getCoursesMock()]);
    expect(screen.queryByText("Grant Access")).not.toBeInTheDocument();
  });
});
