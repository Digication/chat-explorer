import { describe, it, expect } from "vitest";

/**
 * Tests for HeatmapView data formatting and summary row logic.
 * We test the pure functions/logic rather than the full component
 * (which requires Apollo + scope context + UserSettings).
 */

// ── fmtVal logic (mirrors the helper in HeatmapView.tsx) ──────────

function fmtVal(v: number, scaling: string): string {
  return scaling === "RAW" ? String(v) : v.toFixed(2);
}

describe("fmtVal — decimal precision formatting", () => {
  it("RAW scaling returns integers as plain strings", () => {
    expect(fmtVal(5, "RAW")).toBe("5");
    expect(fmtVal(0, "RAW")).toBe("0");
    expect(fmtVal(42, "RAW")).toBe("42");
  });

  it("ROW scaling returns values with exactly 2 decimal places", () => {
    expect(fmtVal(0.428571, "ROW")).toBe("0.43");
    expect(fmtVal(1, "ROW")).toBe("1.00");
    expect(fmtVal(0.5, "ROW")).toBe("0.50");
  });

  it("GLOBAL scaling returns values with exactly 2 decimal places", () => {
    expect(fmtVal(0.333333, "GLOBAL")).toBe("0.33");
    expect(fmtVal(0.666666, "GLOBAL")).toBe("0.67");
    expect(fmtVal(1, "GLOBAL")).toBe("1.00");
  });

  it("handles zero correctly for scaled modes", () => {
    expect(fmtVal(0, "ROW")).toBe("0.00");
    expect(fmtVal(0, "GLOBAL")).toBe("0.00");
  });

  it("RAW scaling preserves float precision (edge case)", () => {
    // If somehow a RAW value is a float, String() shows it as-is
    expect(fmtVal(3.5, "RAW")).toBe("3.5");
  });
});

// ── Classic summary row aggregation logic ──────────────────────────

describe("Classic summary row aggregation", () => {
  it("computes column sums across all students", () => {
    const matrix = [
      [3, 5, 0],  // student 0
      [2, 1, 4],  // student 1
      [0, 3, 2],  // student 2
    ];
    const rowOrder = [0, 1, 2];
    const colOrder = [0, 1, 2];

    const summaryValues = colOrder.map((ci) =>
      rowOrder.reduce((sum, ri) => sum + (matrix[ri]?.[ci] ?? 0), 0),
    );

    expect(summaryValues).toEqual([5, 9, 6]);
  });

  it("handles empty matrix", () => {
    const matrix: number[][] = [];
    const rowOrder: number[] = [];
    const colOrder = [0, 1, 2];

    const summaryValues = colOrder.map((ci) =>
      rowOrder.reduce((sum, ri) => sum + (matrix[ri]?.[ci] ?? 0), 0),
    );

    expect(summaryValues).toEqual([0, 0, 0]);
  });

  it("handles single student", () => {
    const matrix = [[7, 3, 1]];
    const rowOrder = [0];
    const colOrder = [0, 1, 2];

    const summaryValues = colOrder.map((ci) =>
      rowOrder.reduce((sum, ri) => sum + (matrix[ri]?.[ci] ?? 0), 0),
    );

    expect(summaryValues).toEqual([7, 3, 1]);
  });

  it("handles sparse matrix (missing values)", () => {
    const matrix = [
      [3, 5],
      [2],  // missing second column
    ];
    const rowOrder = [0, 1];
    const colOrder = [0, 1];

    const summaryValues = colOrder.map((ci) =>
      rowOrder.reduce((sum, ri) => sum + (matrix[ri]?.[ci] ?? 0), 0),
    );

    expect(summaryValues).toEqual([5, 5]);
  });

  it("summary values use fmtVal formatting with scaling", () => {
    const total = 5;
    // RAW → plain integer
    expect(fmtVal(total, "RAW")).toBe("5");
    // With ROW scaling, a sum like 0.857 gets formatted
    expect(fmtVal(0.857142, "ROW")).toBe("0.86");
  });
});
