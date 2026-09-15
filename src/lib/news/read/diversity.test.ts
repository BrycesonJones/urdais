import { describe, expect, it } from "vitest";

import { diversifyBySource, MAX_CONSECUTIVE_PER_SOURCE } from "@/lib/news/read/diversity";
import type { NewsArticle } from "@/types/news";

let seq = 0;
function article(source: string, publishedAt = `2026-09-${String(30 - (seq % 28)).padStart(2, "0")}T00:00:00.000Z`): NewsArticle {
  seq += 1;
  return {
    id: `a${seq}`,
    category: "compute",
    title: `${source} ${seq}`,
    summary: null,
    source,
    publishedAt,
    url: `https://example.com/${seq}`,
    imageUrl: null,
  };
}

function sources(list: readonly NewsArticle[]): string[] {
  return list.map((row) => row.source);
}

function longestRun(list: readonly NewsArticle[]): number {
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const row of list) {
    run = row.source === previous ? run + 1 : 1;
    previous = row.source;
    best = Math.max(best, run);
  }
  return best;
}

describe("visible source diversity", () => {
  it("leaves an already-varied rail exactly as the database ordered it", () => {
    const input = [article("A"), article("B"), article("C"), article("A"), article("B")];
    expect(diversifyBySource(input, { limit: 5 })).toEqual(input);
  });

  it("breaks up the run one deep feed would otherwise own", () => {
    // The real case: one publisher stamps its whole feed with the same minute.
    const input = [...Array.from({ length: 20 }, () => article("CoreWeave")), article("Lambda"), article("Cloudflare")];
    const rail = diversifyBySource(input, { limit: 6 });
    expect(longestRun(rail)).toBeLessThanOrEqual(MAX_CONSECUTIVE_PER_SOURCE);
    expect(sources(rail)).toEqual(["CoreWeave", "CoreWeave", "Lambda", "CoreWeave", "CoreWeave", "Cloudflare"]);
  });

  it("keeps each publisher's own stories in the order they were published", () => {
    const a1 = article("A");
    const a2 = article("A");
    const a3 = article("A");
    const b1 = article("B");
    const rail = diversifyBySource([a1, a2, a3, b1], { limit: 4 });
    expect(rail.filter((row) => row.source === "A").map((row) => row.id)).toEqual([a1.id, a2.id, a3.id]);
  });

  it("is deterministic: the same input always yields the same rail", () => {
    const input = [article("A"), article("A"), article("A"), article("B"), article("C"), article("A")];
    const first = diversifyBySource(input, { limit: 5 });
    for (let i = 0; i < 5; i += 1) expect(diversifyBySource(input, { limit: 5 })).toEqual(first);
  });

  it("fills the rail rather than shortening it when only one publisher is left", () => {
    // A short rail would be a worse answer than a third consecutive card, and
    // no publisher is ever hidden to satisfy the rule.
    const rail = diversifyBySource(Array.from({ length: 5 }, () => article("Solo")), { limit: 5 });
    expect(rail).toHaveLength(5);
    expect(new Set(sources(rail))).toEqual(new Set(["Solo"]));
  });

  it("never drops or invents a story, and never touches a timestamp", () => {
    const input = [article("A"), article("A"), article("A"), article("B")];
    const rail = diversifyBySource(input, { limit: 4 });
    expect(rail).toHaveLength(4);
    expect(new Set(rail.map((row) => row.id))).toEqual(new Set(input.map((row) => row.id)));
    for (const row of rail) {
      const original = input.find((candidate) => candidate.id === row.id)!;
      expect(row.publishedAt).toBe(original.publishedAt);
      expect(row).toBe(original);
    }
  });

  it("bounds the rail at the limit and handles a degenerate one", () => {
    expect(diversifyBySource([article("A"), article("B")], { limit: 1 })).toHaveLength(1);
    expect(diversifyBySource([article("A")], { limit: 0 })).toEqual([]);
    expect(diversifyBySource([], { limit: 12 })).toEqual([]);
  });

  it("honours a stricter run length when one is asked for", () => {
    const input = [article("A"), article("A"), article("B"), article("A")];
    expect(longestRun(diversifyBySource(input, { limit: 3, maxConsecutive: 1 }))).toBe(1);
    // Filling the rail still wins over the rule once B is used up: the fourth
    // slot can only be an A, and a short rail is the worse answer.
    expect(sources(diversifyBySource(input, { limit: 4, maxConsecutive: 1 }))).toEqual(["A", "B", "A", "A"]);
  });
});
