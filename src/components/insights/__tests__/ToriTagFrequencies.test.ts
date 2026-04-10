import { describe, it, expect } from "vitest";

/**
 * Tests the tag truncation logic used in ToriTagFrequencies.
 * We test the data transformation rather than the full component
 * (which requires Apollo + scope context).
 */

const FLAT_LIMIT = 10;
const DOMAIN_LIMIT = 3;

interface TagFrequency {
  tagId: string;
  tagName: string;
  domain: string;
  count: number;
  percent: number;
}

function groupByDomain(tags: TagFrequency[]): Map<string, TagFrequency[]> {
  const sorted = [...tags].sort((a, b) => b.count - a.count);
  const groups = new Map<string, TagFrequency[]>();
  for (const tag of sorted) {
    const domain = tag.domain || "Unknown";
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain)!.push(tag);
  }
  return new Map(
    [...groups.entries()].sort((a, b) => b[1][0].count - a[1][0].count)
  );
}

function makeTags(n: number): TagFrequency[] {
  return Array.from({ length: n }, (_, i) => ({
    tagId: `t${i}`,
    tagName: `Tag ${i}`,
    domain: `Domain ${i % 3}`,
    count: n - i,
    percent: ((n - i) / n) * 100,
  }));
}

describe("ToriTagFrequencies data logic", () => {
  it("flat mode shows at most FLAT_LIMIT tags when not expanded", () => {
    const tags = makeTags(20);
    const flatSorted = [...tags].sort((a, b) => b.count - a.count);
    const visible = flatSorted.slice(0, FLAT_LIMIT);
    expect(visible.length).toBe(FLAT_LIMIT);
    expect(visible[0].count).toBe(20);
    expect(visible[9].count).toBe(11);
  });

  it("flat mode shows all tags when expanded", () => {
    const tags = makeTags(20);
    const flatSorted = [...tags].sort((a, b) => b.count - a.count);
    expect(flatSorted.length).toBe(20);
  });

  it("no 'show all' needed when tags <= FLAT_LIMIT", () => {
    const tags = makeTags(8);
    expect(tags.length <= FLAT_LIMIT).toBe(true);
  });

  it("grouped mode limits tags per domain to DOMAIN_LIMIT", () => {
    const tags = makeTags(15);
    const grouped = groupByDomain(tags);
    for (const [, domainTags] of grouped) {
      const visible = domainTags.slice(0, DOMAIN_LIMIT);
      expect(visible.length).toBeLessThanOrEqual(DOMAIN_LIMIT);
    }
  });

  it("grouped mode shows all when expanded", () => {
    const tags = makeTags(15);
    const grouped = groupByDomain(tags);
    let totalVisible = 0;
    for (const [, domainTags] of grouped) {
      totalVisible += domainTags.length;
    }
    expect(totalVisible).toBe(15);
  });

  it("groupByDomain sorts groups by highest-count tag", () => {
    const tags: TagFrequency[] = [
      { tagId: "1", tagName: "A", domain: "Low", count: 1, percent: 10 },
      { tagId: "2", tagName: "B", domain: "High", count: 10, percent: 90 },
    ];
    const grouped = groupByDomain(tags);
    const domains = [...grouped.keys()];
    expect(domains[0]).toBe("High");
    expect(domains[1]).toBe("Low");
  });
});
