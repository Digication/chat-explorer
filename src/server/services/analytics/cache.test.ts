/**
 * Tests for the in-memory analytics cache.
 *
 * These are pure unit tests — no database required.
 * Run with: docker compose exec app pnpm test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  cacheGet,
  cacheSet,
  cacheInvalidate,
  cacheClear,
  withCache,
} from "./cache.js";

describe("analytics cache", () => {
  // Wipe cache before every test so tests are completely independent
  beforeEach(() => {
    cacheClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cacheGet returns null for a miss", () => {
    const result = cacheGet("nonexistent");
    expect(result).toBeNull();
  });

  it("cacheSet + cacheGet returns the stored value", () => {
    cacheSet("key1", { x: 42 }, { institutionId: "inst-1" });
    const result = cacheGet("key1");
    expect(result).toEqual({ x: 42 });
  });

  it("cacheGet returns null after TTL expires", () => {
    vi.useFakeTimers();
    cacheSet("key-ttl", { y: 1 }, { institutionId: "inst-1" }, 1000);
    vi.advanceTimersByTime(1001);
    expect(cacheGet("key-ttl")).toBeNull();
  });

  it("cacheGet returns value before TTL expires", () => {
    vi.useFakeTimers();
    cacheSet("key-ttl2", { z: 99 }, { institutionId: "inst-1" }, 5000);
    vi.advanceTimersByTime(4000);
    expect(cacheGet("key-ttl2")).toEqual({ z: 99 });
  });

  it("cacheInvalidate institution-wide clears all entries for that institution", () => {
    const scope = { institutionId: "inst-1" };
    cacheSet("k1", "a", scope);
    cacheSet("k2", "b", { institutionId: "inst-1", courseId: "course1" });
    cacheSet("k3", "c", { institutionId: "inst-1", courseId: "course2" });

    cacheInvalidate({ institutionId: "inst-1" });

    expect(cacheGet("k1")).toBeNull();
    expect(cacheGet("k2")).toBeNull();
    expect(cacheGet("k3")).toBeNull();
  });

  it("cacheInvalidate course-level clears matching course + institution-wide entries, keeps other courses", () => {
    cacheSet("k-inst", "inst-val", { institutionId: "inst-1" });
    cacheSet("k-c1", "c1-val", { institutionId: "inst-1", courseId: "c1" });
    cacheSet("k-c2", "c2-val", { institutionId: "inst-1", courseId: "c2" });

    cacheInvalidate({ institutionId: "inst-1", courseId: "c1" });

    // Institution-wide and c1 should be gone
    expect(cacheGet("k-inst")).toBeNull();
    expect(cacheGet("k-c1")).toBeNull();
    // c2 should still be present
    expect(cacheGet("k-c2")).toBe("c2-val");
  });

  it("cacheInvalidate does not affect other institutions", () => {
    cacheSet("k-inst2", "inst2-val", { institutionId: "inst-2" });

    cacheInvalidate({ institutionId: "inst-1" });

    expect(cacheGet("k-inst2")).toBe("inst2-val");
  });

  it("withCache calls compute on miss and returns cached=false", async () => {
    const compute = vi.fn().mockResolvedValue({ result: "computed" });
    const { data, cached } = await withCache(
      "miss-key",
      { institutionId: "inst-1" },
      compute
    );

    expect(compute).toHaveBeenCalledOnce();
    expect(cached).toBe(false);
    expect(data).toEqual({ result: "computed" });
  });

  it("withCache returns cached value on hit and does not call compute again", async () => {
    const compute1 = vi.fn().mockResolvedValue({ result: "first" });
    const compute2 = vi.fn().mockResolvedValue({ result: "second" });

    // First call — populates cache
    await withCache("hit-key", { institutionId: "inst-1" }, compute1);

    // Second call — should return the first value, not call compute2
    const { data, cached } = await withCache(
      "hit-key",
      { institutionId: "inst-1" },
      compute2
    );

    expect(compute2).not.toHaveBeenCalled();
    expect(cached).toBe(true);
    expect(data).toEqual({ result: "first" });
  });

  it("cacheClear empties the entire store", () => {
    cacheSet("a", 1, { institutionId: "inst-1" });
    cacheSet("b", 2, { institutionId: "inst-2" });

    cacheClear();

    expect(cacheGet("a")).toBeNull();
    expect(cacheGet("b")).toBeNull();
  });
});
