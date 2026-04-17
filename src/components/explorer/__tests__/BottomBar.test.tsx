import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BottomBar from "../BottomBar";

// Mock useUserSettings and sidebarTheme
vi.mock("@/lib/UserSettingsContext", () => ({
  useUserSettings: () => ({
    getDisplayName: (name: string) => name,
    showFullNames: true,
    setShowFullNames: () => {},
  }),
}));

const students = [
  { studentId: "s1", name: "Alice", commentCount: 5 },
  { studentId: "s2", name: "Bob", commentCount: 3 },
];

describe("BottomBar", () => {
  const defaultProps = {
    students,
    selectedStudentIds: [],
    onSelectStudent: vi.fn(),
    onOpenStudentList: vi.fn(),
    studentListOpen: false,
    onToggleAnalyze: vi.fn(),
    analyzeOpen: false,
  };

  it("clicking Students button triggers onOpenStudentList", () => {
    const onOpenStudentList = vi.fn();
    render(<BottomBar {...defaultProps} onOpenStudentList={onOpenStudentList} />);
    // The Students button shows count in parentheses
    const studentsButton = screen.getByText("Students (2)").closest("button");
    expect(studentsButton).toBeTruthy();
    fireEvent.click(studentsButton!);
    expect(onOpenStudentList).toHaveBeenCalled();
  });

  it("clicking 'Analyze' label triggers onToggleAnalyze", () => {
    const onToggleAnalyze = vi.fn();
    render(<BottomBar {...defaultProps} onToggleAnalyze={onToggleAnalyze} />);
    const analyzeButton = screen.getByText("Analyze").closest("button");
    expect(analyzeButton).toBeTruthy();
    fireEvent.click(analyzeButton!);
    expect(onToggleAnalyze).toHaveBeenCalled();
  });

  it("shows student count in button label", () => {
    render(<BottomBar {...defaultProps} />);
    expect(screen.getByText("Students (2)")).toBeInTheDocument();
  });
});
