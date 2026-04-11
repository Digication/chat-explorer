import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router";
import { GET_COURSES, GET_MY_INSTITUTION, GET_OVERVIEW } from "@/lib/queries/analytics";
import { REQUEST_EXPORT } from "@/lib/queries/export";

// Mock the PDF renderer so we don't run heavy rendering in component tests
const mockRenderPdf = vi.fn().mockResolvedValue(
  new Blob(["fake-pdf"], { type: "application/pdf" })
);
vi.mock("../renderPdfBlob", () => ({
  renderCourseReportPdf: (...args: unknown[]) => mockRenderPdf(...args),
}));

import ExportDialog from "../ExportDialog";

const INST_ID = "inst-1";

const MOCK_COURSES = [
  { id: "c1", name: "CS 101" },
  { id: "c2", name: "MATH 200" },
];

// A base64-encoded JSON CourseReport payload (what the server returns for PDF)
const MOCK_REPORT_JSON = JSON.stringify({
  courseName: "CS 101",
  generatedAt: "2026-04-01T00:00:00.000Z",
  overview: { totalComments: 10, threadCount: 2, participantCount: 5, toriTagCount: 20 },
  toriFrequencies: [],
  categoryDistribution: {
    DESCRIPTIVE_WRITING: 3,
    DESCRIPTIVE_REFLECTION: 3,
    DIALOGIC_REFLECTION: 2,
    CRITICAL_REFLECTION: 2,
  },
  topCoOccurrences: [],
});
const MOCK_REPORT_B64 = btoa(MOCK_REPORT_JSON);

function coursesMock(): MockedResponse {
  return {
    request: {
      query: GET_COURSES,
      variables: { institutionId: INST_ID },
    },
    result: { data: { courses: MOCK_COURSES } },
  };
}

function myInstitutionMock(): MockedResponse {
  return {
    request: { query: GET_MY_INSTITUTION },
    result: { data: { myInstitution: { id: INST_ID, name: "Test Univ" } } },
  };
}

function overviewMock(courseId: string): MockedResponse {
  return {
    request: {
      query: GET_OVERVIEW,
      variables: { scope: { institutionId: INST_ID, courseId } },
    },
    result: {
      data: {
        overview: {
          data: {
            totalComments: 10,
            userComments: 8,
            assistantComments: 2,
            threadCount: 2,
            participantCount: 5,
            toriTagCount: 20,
            avgCommentsPerThread: 5,
            avgWordsPerComment: 40,
            dateRange: { earliest: "2026-01-01", latest: "2026-04-01" },
          },
        },
      },
    },
  };
}

function csvExportMock(courseId: string): MockedResponse {
  return {
    request: {
      query: REQUEST_EXPORT,
      variables: {
        scope: { institutionId: INST_ID, courseId },
        format: "CSV",
      },
    },
    result: {
      data: {
        requestExport: {
          id: "export-1",
          format: "CSV",
          status: "COMPLETE",
          downloadUrl: `data:text/csv;base64,${btoa("col1,col2\nval1,val2")}`,
          message: "Export complete",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      },
    },
  };
}

function pdfExportMock(courseId: string): MockedResponse {
  return {
    request: {
      query: REQUEST_EXPORT,
      variables: {
        scope: { institutionId: INST_ID, courseId },
        format: "PDF",
      },
    },
    result: {
      data: {
        requestExport: {
          id: "export-2",
          format: "PDF",
          status: "COMPLETE",
          downloadUrl: `data:application/json;base64,${MOCK_REPORT_B64}`,
          message: "Report data ready",
          createdAt: "2026-04-01T00:00:00.000Z",
        },
      },
    },
  };
}

function renderDialog(
  mocks: MockedResponse[],
  props: Partial<React.ComponentProps<typeof ExportDialog>> = {}
) {
  return render(
    <MockedProvider mocks={mocks}>
      <MemoryRouter>
        <ExportDialog
          open={true}
          onClose={vi.fn()}
          institutionId={INST_ID}
          {...props}
        />
      </MemoryRouter>
    </MockedProvider>
  );
}

beforeEach(() => {
  mockRenderPdf.mockClear();
});

describe("ExportDialog", () => {
  it("renders format picker with PDF and CSV options", () => {
    renderDialog([coursesMock(), myInstitutionMock()]);
    expect(screen.getByLabelText("PDF Report")).toBeInTheDocument();
    expect(screen.getByLabelText("CSV Data")).toBeInTheDocument();
  });

  it("shows course selector with loaded courses", async () => {
    renderDialog([coursesMock(), myInstitutionMock()]);

    // Wait for courses to load
    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });

    // Open the MUI Select listbox
    fireEvent.mouseDown(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByText("CS 101")).toBeInTheDocument();
      expect(screen.getByText("MATH 200")).toBeInTheDocument();
    });
  });

  it("disables Generate button when no course selected", () => {
    renderDialog([coursesMock(), myInstitutionMock()]);
    const generateBtn = screen.getByRole("button", { name: "Generate" });
    expect(generateBtn).toBeDisabled();
  });

  it("calls requestExport mutation with CSV format", async () => {
    // Pre-select a course via defaultCourseId to focus on the mutation flow
    renderDialog(
      [coursesMock(), myInstitutionMock(), overviewMock("c1"), csvExportMock("c1")],
      { defaultCourseId: "c1" }
    );

    // Wait for courses to load so Generate is enabled
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Generate" })
      ).not.toBeDisabled();
    });

    // Click Generate
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    // Wait for success
    await waitFor(() => {
      expect(screen.getByText("Export ready!")).toBeInTheDocument();
    });

    // PDF renderer should NOT have been called for CSV
    expect(mockRenderPdf).not.toHaveBeenCalled();
  });

  it("renders PDF after mutation completes with PDF format", async () => {
    // Pre-select a course via defaultCourseId to focus on the mutation flow
    renderDialog(
      [coursesMock(), myInstitutionMock(), overviewMock("c1"), pdfExportMock("c1")],
      { defaultFormat: "PDF", defaultCourseId: "c1" }
    );

    // Wait for courses to load so Generate is enabled
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Generate" })
      ).not.toBeDisabled();
    });

    // Click Generate
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    // Wait for PDF rendering to complete
    await waitFor(() => {
      expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    });

    // Verify the report data was decoded and passed correctly
    const calledWith = mockRenderPdf.mock.calls[0][0];
    expect(calledWith.courseName).toBe("CS 101");
    expect(calledWith.overview.totalComments).toBe(10);
  });

  it("defaults to the specified format", () => {
    renderDialog([coursesMock(), myInstitutionMock()], {
      defaultFormat: "PDF",
    });
    const pdfRadio = screen.getByLabelText("PDF Report") as HTMLInputElement;
    expect(pdfRadio.checked).toBe(true);
  });
});
