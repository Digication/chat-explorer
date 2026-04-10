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
        onToggle={() => {}}
      />
    );
    // MUI Avatar renders text initials — look for Avatar elements
    const avatars = container.querySelectorAll(".MuiAvatar-root");
    expect(avatars.length).toBe(3);
  });

  it("single click calls onSelect (not onToggle)", () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(
      <StudentCarousel
        students={students}
        selectedIds={[]}
        onSelect={onSelect}
        onToggle={onToggle}
      />
    );
    // Find the first student slot and click it
    const slots = container.querySelectorAll('[class*="MuiBox-root"]');
    // The student slots are nested; find one that matches our width
    const studentSlot = Array.from(slots).find(
      (el) => (el as HTMLElement).style.width === "80px" || el.getAttribute("style")?.includes("80")
    );
    if (studentSlot) {
      fireEvent.click(studentSlot);
      expect(onSelect).toHaveBeenCalledWith("s1");
      expect(onToggle).not.toHaveBeenCalled();
    }
  });

  it("shift+click calls onToggle (not onSelect)", () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(
      <StudentCarousel
        students={students}
        selectedIds={["s1"]}
        onSelect={onSelect}
        onToggle={onToggle}
      />
    );
    const slots = container.querySelectorAll('[class*="MuiBox-root"]');
    const studentSlot = Array.from(slots).find(
      (el) => (el as HTMLElement).style.width === "80px" || el.getAttribute("style")?.includes("80")
    );
    if (studentSlot) {
      fireEvent.click(studentSlot, { shiftKey: true });
      expect(onToggle).toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    }
  });

  it("shows name only for selected students", () => {
    render(
      <StudentCarousel
        students={students}
        selectedIds={["s1"]}
        onSelect={() => {}}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });
});
