import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StudentCarousel from "../StudentCarousel";

// Mock useUserSettings
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
  { studentId: "s3", name: "Carol", commentCount: 7 },
];

describe("StudentCarousel", () => {
  it("renders student avatars (one per student)", () => {
    const { container } = render(
      <StudentCarousel
        students={students}
        selectedIds={[]}
        onSelect={() => {}}
      />
    );
    // MUI Avatar renders text initials — look for Avatar elements
    const avatars = container.querySelectorAll(".MuiAvatar-root");
    expect(avatars.length).toBe(3);
  });

  it("click calls onSelect", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <StudentCarousel
        students={students}
        selectedIds={[]}
        onSelect={onSelect}
      />
    );
    // Find the first student slot and click it
    const slots = container.querySelectorAll('[class*="MuiBox-root"]');
    const studentSlot = Array.from(slots).find(
      (el) => (el as HTMLElement).style.width === "80px" || el.getAttribute("style")?.includes("80")
    );
    if (studentSlot) {
      fireEvent.click(studentSlot);
      expect(onSelect).toHaveBeenCalledWith("s1");
    }
  });

  it("shift+click still calls onSelect (no multi-select)", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <StudentCarousel
        students={students}
        selectedIds={["s1"]}
        onSelect={onSelect}
      />
    );
    const slots = container.querySelectorAll('[class*="MuiBox-root"]');
    const studentSlot = Array.from(slots).find(
      (el) => (el as HTMLElement).style.width === "80px" || el.getAttribute("style")?.includes("80")
    );
    if (studentSlot) {
      fireEvent.click(studentSlot, { shiftKey: true });
      expect(onSelect).toHaveBeenCalled();
    }
  });

  it("shows name only for selected students", () => {
    render(
      <StudentCarousel
        students={students}
        selectedIds={["s1"]}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });
});
