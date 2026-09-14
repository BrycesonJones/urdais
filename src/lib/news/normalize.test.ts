import { describe, expect, it } from "vitest";

import {
  articleKey,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeArticleUrl,
  normalizeImageUrl,
  normalizePublishedAt,
  normalizeSummary,
  normalizeTitle,
} from "@/lib/news/normalize";

const RETRIEVED_AT = "2026-09-14T17:45:00.000Z";

function canonical(raw: string, rewrite?: { from: string; to: string }) {
  const result = normalizeArticleUrl(raw, rewrite);
  if (!result.ok) throw new Error(`expected a normalized URL, got ${result.reason}`);
  return result.value;
}

describe("canonical URLs", () => {
  it("drops campaign parameters and the fragment, and keeps everything else", () => {
    const { canonicalUrl } = canonical(
      "https://cloud.google.com/blog/products/compute/a?utm_source=x&utm_medium=y&gclid=z&hl=en#intro",
    );
    expect(canonicalUrl).toBe("https://cloud.google.com/blog/products/compute/a?hl=en");
  });

  it("leaves a parameter it does not recognise alone", () => {
    // Removing a parameter that selects content would send readers elsewhere.
    expect(canonical("https://example.com/a?id=7&page=2").canonicalUrl).toBe("https://example.com/a?id=7&page=2");
  });

  it("lowercases the host but never the path", () => {
    expect(canonical("https://Cloud.Google.COM/Blog/Post").canonicalUrl).toBe("https://cloud.google.com/Blog/Post");
  });

  it("applies only a recorded host rewrite, and only to that host", () => {
    const rewrite = { from: "wf.coreweave.com", to: "www.coreweave.com" };
    expect(canonical("https://wf.coreweave.com/blog/x", rewrite).canonicalUrl).toBe("https://www.coreweave.com/blog/x");
    expect(canonical("https://example.com/blog/x", rewrite).canonicalUrl).toBe("https://example.com/blog/x");
    expect(canonical("https://wf.coreweave.com/blog/x").canonicalUrl).toBe("https://wf.coreweave.com/blog/x");
  });

  it("gives two spellings of one story the same identity but keeps the published link faithful", () => {
    const a = canonical("https://example.com/a/?b=2&a=1");
    const b = canonical("https://example.com/a?a=1&b=2&utm_source=news");
    expect(a.urlKey).toBe(b.urlKey);
    expect(a.canonicalUrl).not.toBe(a.urlKey);
    expect(a.canonicalUrl).toBe("https://example.com/a/?b=2&a=1");
  });

  it("refuses anything that is not a parseable https destination", () => {
    expect(normalizeArticleUrl("http://example.com/a")).toEqual({ ok: false, reason: "not_https" });
    expect(normalizeArticleUrl("/relative/path")).toEqual({ ok: false, reason: "unparseable" });
    expect(normalizeArticleUrl("javascript:alert(1)")).toEqual({ ok: false, reason: "not_https" });
    expect(normalizeArticleUrl("")).toEqual({ ok: false, reason: "unparseable" });
  });
});

describe("titles", () => {
  it("resolves entities, removes markup and collapses whitespace", () => {
    expect(normalizeTitle("  AT&amp;T   &amp; <em>NVIDIA</em>\nannounce  ")).toBe("AT&T & NVIDIA announce");
  });

  it("is null when nothing survives, so an untitled entry is rejected rather than shown blank", () => {
    expect(normalizeTitle(null)).toBeNull();
    expect(normalizeTitle("   ")).toBeNull();
    expect(normalizeTitle("<span></span>")).toBeNull();
  });

  it("bounds a pathological title at a word boundary", () => {
    const long = normalizeTitle(`${"word ".repeat(200)}end`);
    expect(long!.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(long!.endsWith("…")).toBe(true);
  });
});

describe("summaries", () => {
  it("keeps the publisher's own snippet", () => {
    expect(normalizeSummary("<p>Capacity came online in three regions.</p>", "source_description")).toBe(
      "Capacity came online in three regions.",
    );
  });

  it("stores nothing where the feed's description is the article body", () => {
    expect(normalizeSummary("<p>An entire article…</p>", "omit_feed_carries_body")).toBeNull();
  });

  it("removes the syndication platform's trailer, which is not the publisher's words", () => {
    expect(
      normalizeSummary(
        '<p>Real dek.</p><p>The post <a href="https://x/y">Title</a> appeared first on <a href="https://x">Blog</a>.</p>',
        "source_description",
      ),
    ).toBe("Real dek.");
  });

  it("is null when the publisher supplies none", () => {
    expect(normalizeSummary(null, "source_description")).toBeNull();
    expect(normalizeSummary("  ", "source_description")).toBeNull();
  });

  it("bounds a long description rather than storing a body", () => {
    const summary = normalizeSummary(`${"sentence ".repeat(200)}end`, "source_description");
    expect(summary!.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
  });
});

describe("timestamps", () => {
  it("reads RFC 822 and ISO 8601 onto the same instant", () => {
    expect(normalizePublishedAt("Sat, 12 Sep 2026 19:24:20 GMT", RETRIEVED_AT)).toEqual({
      ok: true,
      value: "2026-09-12T19:24:20.000Z",
    });
    expect(normalizePublishedAt("2026-09-12T19:24:20+02:00", RETRIEVED_AT)).toEqual({
      ok: true,
      value: "2026-09-12T17:24:20.000Z",
    });
  });

  it("rejects what it cannot read and what cannot be true", () => {
    expect(normalizePublishedAt(null, RETRIEVED_AT)).toEqual({ ok: false, reason: "unparseable" });
    expect(normalizePublishedAt("last Tuesday", RETRIEVED_AT)).toEqual({ ok: false, reason: "unparseable" });
    expect(normalizePublishedAt("1995-01-01T00:00:00Z", RETRIEVED_AT)).toEqual({ ok: false, reason: "implausible" });
    expect(normalizePublishedAt("2027-01-01T00:00:00Z", RETRIEVED_AT)).toEqual({ ok: false, reason: "implausible" });
  });

  it("tolerates a publisher clock a little ahead of Urdais's", () => {
    expect(normalizePublishedAt("2026-09-15T00:00:00Z", RETRIEVED_AT).ok).toBe(true);
  });
});

describe("images and identity", () => {
  it("references a feed thumbnail only where the source opts in", () => {
    expect(normalizeImageUrl("https://cdn.example.com/a.jpg", "none")).toBeNull();
    expect(normalizeImageUrl("https://cdn.example.com/a.jpg", "feed_media")).toBe("https://cdn.example.com/a.jpg");
    expect(normalizeImageUrl("http://cdn.example.com/a.jpg", "feed_media")).toBeNull();
    expect(normalizeImageUrl("not a url", "feed_media")).toBeNull();
  });

  it("prefers the publisher's stable id and falls back to the URL key", () => {
    expect(articleKey("https://x/?p=1", "https://x/a")).toBe("https://x/?p=1");
    expect(articleKey(null, "https://x/a")).toBe("https://x/a");
    expect(articleKey("   ", "https://x/a")).toBe("https://x/a");
  });
});
