/**
 * Tests for buildSystemPrompt — pure string template, no mocks needed.
 *
 * Run with: docker compose exec app pnpm test
 */
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./ai-instructions.js";

describe("buildSystemPrompt", () => {
  it("returns a non-empty string", () => {
    const result = buildSystemPrompt({
      scope: "test scope",
      data: "some data",
      showPII: false,
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the scope label in output", () => {
    const result = buildSystemPrompt({
      scope: "CS 101 — Fall 2025",
      data: "some data",
      showPII: false,
    });
    expect(result).toContain("CS 101 — Fall 2025");
  });

  it("includes the data context in output", () => {
    const result = buildSystemPrompt({
      scope: "any scope",
      data: "Student A: 5 comments",
      showPII: false,
    });
    expect(result).toContain("Student A: 5 comments");
  });

  it("showPII=true includes full name permission", () => {
    const result = buildSystemPrompt({
      scope: "any scope",
      data: "some data",
      showPII: true,
    });
    // The prompt should say students may be referred to by full name
    const lower = result.toLowerCase();
    expect(
      lower.includes("full name") ||
        lower.includes("refer to students by their full name")
    ).toBe(true);
  });

  it("showPII=false includes privacy warning about initials only", () => {
    const result = buildSystemPrompt({
      scope: "any scope",
      data: "some data",
      showPII: false,
    });
    // The prompt should warn not to reveal full names and enforce initials
    expect(
      result.includes("Do NOT reveal full student names") ||
        result.includes("initials only")
    ).toBe(true);
  });
});
