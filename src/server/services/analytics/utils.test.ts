import { describe, it, expect } from "vitest";
import { modalOf, emptyCategoryDistribution } from "./utils.js";
import type { ReflectionCategory } from "./types.js";

describe("modalOf", () => {
  it("returns the most frequent category", () => {
    const categories: ReflectionCategory[] = [
      "DESCRIPTIVE_WRITING",
      "DESCRIPTIVE_WRITING",
      "DIALOGIC_REFLECTION",
    ];
    expect(modalOf(categories)).toBe("DESCRIPTIVE_WRITING");
  });

  it("breaks ties toward higher reflective depth", () => {
    // 1 each of descriptive writing and critical reflection — critical wins
    const categories: ReflectionCategory[] = [
      "DESCRIPTIVE_WRITING",
      "CRITICAL_REFLECTION",
    ];
    expect(modalOf(categories)).toBe("CRITICAL_REFLECTION");
  });

  it("breaks 3-way tie toward highest depth present", () => {
    const categories: ReflectionCategory[] = [
      "DESCRIPTIVE_WRITING",
      "DESCRIPTIVE_REFLECTION",
      "DIALOGIC_REFLECTION",
    ];
    expect(modalOf(categories)).toBe("DIALOGIC_REFLECTION");
  });

  it("handles a single-element array", () => {
    expect(modalOf(["DIALOGIC_REFLECTION"])).toBe("DIALOGIC_REFLECTION");
  });

  it("returns DESCRIPTIVE_WRITING for empty array", () => {
    expect(modalOf([])).toBe("DESCRIPTIVE_WRITING");
  });

  it("correctly handles majority that is not highest depth", () => {
    // 3 descriptive reflection vs 1 critical — descriptive reflection wins by count
    const categories: ReflectionCategory[] = [
      "DESCRIPTIVE_REFLECTION",
      "DESCRIPTIVE_REFLECTION",
      "DESCRIPTIVE_REFLECTION",
      "CRITICAL_REFLECTION",
    ];
    expect(modalOf(categories)).toBe("DESCRIPTIVE_REFLECTION");
  });
});

describe("emptyCategoryDistribution", () => {
  it("returns all zeros", () => {
    const dist = emptyCategoryDistribution();
    expect(dist).toEqual({
      DESCRIPTIVE_WRITING: 0,
      DESCRIPTIVE_REFLECTION: 0,
      DIALOGIC_REFLECTION: 0,
      CRITICAL_REFLECTION: 0,
    });
  });
});
