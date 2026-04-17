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
    // Carousel items are now ButtonBase elements
    const buttons = container.querySelectorAll("button.MuiButtonBase-root");
    // First two buttons are navigation arrows, carousel items follow
    // Find the first avatar button (not an arrow — arrows have aria-label)
    const carouselButtons = Array.from(buttons).filter(
      (btn) => !btn.getAttribute("aria-label")
    );
    if (carouselButtons.length > 0) {
      fireEvent.click(carouselButtons[0]);
      expect(onSelect).toHaveBeenCalledWith("s1");
    }
  });

  it("has navigation arrows", () => {
    render(
      <StudentCarousel
        students={students}
        selectedIds={["s1"]}
        onSelect={() => {}}
      />
    );
    expect(screen.getByLabelText("Previous student")).toBeInTheDocument();
    expect(screen.getByLabelText("Next student")).toBeInTheDocument();
  });

  it("disables previous arrow at start", () => {
    render(
      <StudentCarousel
        students={students}
        selectedIds={["s1"]}
        onSelect={() => {}}
      />
    );
    const prevButton = screen.getByLabelText("Previous student");
    expect(prevButton).toBeDisabled();
  });
});
