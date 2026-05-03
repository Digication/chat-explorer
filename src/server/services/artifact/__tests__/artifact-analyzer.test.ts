/**
 * Unit tests for the artifact analyzer pure helpers. Full pipeline
 * behaviour is covered by the e2e test in Step 9.
 */
import { describe, it, expect } from "vitest";
import { combineTitle } from "../artifact-analyzer.js";

describe("combineTitle", () => {
  it("returns the artifact title when no section title is given", () => {
    expect(combineTitle("My Paper", null)).toBe("My Paper");
  });

  it("combines artifact and section titles with an em-dash", () => {
    expect(combineTitle("My Paper", "Introduction")).toBe(
      "My Paper — Introduction"
    );
  });

  it("falls back to 'Untitled' when the artifact title is blank", () => {
    expect(combineTitle("", null)).toBe("Untitled");
    expect(combineTitle("   ", "Body")).toBe("Untitled — Body");
  });

  it("trims whitespace from both inputs", () => {
    expect(combineTitle("  My Paper  ", "  Methods  ")).toBe(
      "My Paper — Methods"
    );
  });
});
