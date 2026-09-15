import { describe, expect, it } from "vitest";

import {
  assertNewsIngestPermitted,
  enabledNewsSources,
  NEWS_SOURCES,
  NEWS_SOURCES_REVIEWED_NOT_APPROVED,
  newsSource,
  newsSourcesForCategory,
} from "@/lib/news/sources";
import { NEWS_SOURCE_SLUGS, NewsPermissionError, UnknownNewsSourceError } from "@/lib/news/types";
import { NEWS_CATEGORIES } from "@/types/news";

describe("the approved source registry", () => {
  it("defines every registered source and nothing else", () => {
    expect(Object.keys(NEWS_SOURCES).sort()).toEqual([...NEWS_SOURCE_SLUGS].sort());
    for (const slug of NEWS_SOURCE_SLUGS) expect(NEWS_SOURCES[slug].slug).toBe(slug);
  });

  it("holds the categories that have migrated, and nothing else", () => {
    expect(newsSourcesForCategory("compute").length).toBe(8);
    expect(newsSourcesForCategory("energy-power").length).toBe(4);
    expect(newsSourcesForCategory("compute").length + newsSourcesForCategory("energy-power").length).toBe(
      NEWS_SOURCE_SLUGS.length,
    );
    for (const category of NEWS_CATEGORIES) {
      if (category.id === "compute" || category.id === "energy-power") continue;
      expect(newsSourcesForCategory(category.id)).toEqual([]);
    }
  });

  it("gives Energy / Power three publishers across four feeds", () => {
    const energy = newsSourcesForCategory("energy-power");
    expect(new Set(energy.map((source) => source.publisherName)).size).toBe(3);
    // None of these feeds attaches media, so none references an image.
    expect(energy.every((source) => source.imagePolicy === "none" && source.imageHosts.length === 0)).toBe(true);
  });

  it("carries a working endpoint, a publisher and a rights state for every source", () => {
    for (const slug of NEWS_SOURCE_SLUGS) {
      const source = NEWS_SOURCES[slug];
      expect(source.feedUrl.startsWith("https://")).toBe(true);
      expect(source.publisherHomepage.startsWith("https://")).toBe(true);
      expect(source.publisherName.length).toBeGreaterThan(0);
      expect(source.registry.termsReviewState).toBe("permitted");
      expect(source.registry.dataUseTermsState).toBe("permitted");
      expect(source.registry.productionAccessState).toBe("production_approved");
      expect(source.sourceInterfaceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(source.permissionGrantId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("gives each source its own interface and its own grant", () => {
    const interfaces = NEWS_SOURCE_SLUGS.map((slug) => NEWS_SOURCES[slug].sourceInterfaceId);
    const grants = NEWS_SOURCE_SLUGS.map((slug) => NEWS_SOURCES[slug].permissionGrantId);
    expect(new Set(interfaces).size).toBe(interfaces.length);
    expect(new Set(grants).size).toBe(grants.length);
  });

  it("names a source it does not know rather than guessing one", () => {
    expect(() => newsSource("techcrunch")).toThrow(UnknownNewsSourceError);
  });

  it("is deep enough that no one publisher can own the rail", () => {
    // The Phase 1A roster was four feeds from three publishers, and one of
    // them stamps its whole feed with a single minute. Concentration is a
    // source-roster problem first and a presentation problem second.
    const enabled = enabledNewsSources();
    expect(enabled.length).toBeGreaterThanOrEqual(8);
    expect(new Set(enabled.map((source) => source.publisherName)).size).toBeGreaterThanOrEqual(7);
  });

  it("reads both feed formats, so the Atom path is exercised in production", () => {
    const mechanisms = new Set(enabledNewsSources().map((source) => source.mechanism));
    expect(mechanisms).toContain("rss");
    expect(mechanisms).toContain("atom");
  });

  it("records an image decision for every source, and an allowlist wherever images are on", () => {
    for (const slug of NEWS_SOURCE_SLUGS) {
      const source = NEWS_SOURCES[slug];
      if (source.imagePolicy === "none") {
        expect(source.imageHosts).toEqual([]);
        continue;
      }
      expect(source.imageHosts.length).toBeGreaterThan(0);
      for (const entry of source.imageHosts) {
        // A host on its own is never enough: two publishers share a CDN.
        expect(entry.pathPrefix.startsWith("/")).toBe(true);
        expect(entry.pathPrefix.length).toBeGreaterThan(1);
        expect(entry.host).not.toContain("*");
      }
    }
  });

  it("never lets one publisher's allowlist admit another's assets on a shared CDN", () => {
    // Two feeds from one publisher may share an allowlist — Google Cloud has
    // two. Two different publishers on one host may not.
    const entries = NEWS_SOURCE_SLUGS.flatMap((slug) =>
      NEWS_SOURCES[slug].imageHosts.map((entry) => ({ publisher: NEWS_SOURCES[slug].publisherName, ...entry })),
    );
    for (const a of entries) {
      for (const b of entries) {
        if (a.publisher === b.publisher || a.host !== b.host) continue;
        expect(a.pathPrefix.startsWith(b.pathPrefix)).toBe(false);
      }
    }
  });

  it("records the Memory qualification pass, and enables nothing from it", () => {
    // Phase 2A researched Memory and found no source it could ingest. The
    // record of that is the deliverable; the absence of Memory sources is the
    // result, and both are asserted so neither is quietly undone.
    const memory = NEWS_SOURCES_REVIEWED_NOT_APPROVED.filter((row) => row.category === "memory");
    expect(memory.length).toBeGreaterThanOrEqual(8);
    expect(newsSourcesForCategory("memory")).toEqual([]);
    expect(
      enabledNewsSources().every((source) => source.category === "compute" || source.category === "energy-power"),
    ).toBe(true);

    // The one refused on rights rather than on quality or relevance.
    const skhynix = memory.find((row) => row.sourceInterfaceSlug === "skhynix-newsroom-feed");
    expect(skhynix?.refusalKind).toBe("terms");
    expect(skhynix?.reason).toContain("non-commercial use only");

    // Every kind of refusal the pass produced is represented, because they age
    // differently and a later reader needs to know which are worth re-testing.
    expect(new Set(memory.map((row) => row.refusalKind))).toEqual(
      new Set(["terms", "abandoned", "unusable", "relevance"]),
    );
  });

  it("never lists a refused feed as an approved one", () => {
    const approved = new Set(NEWS_SOURCE_SLUGS.map((slug) => NEWS_SOURCES[slug].feedUrl));
    const approvedInterfaces = new Set(NEWS_SOURCE_SLUGS.map((slug) => NEWS_SOURCES[slug].sourceInterfaceSlug));
    for (const row of NEWS_SOURCES_REVIEWED_NOT_APPROVED) {
      expect(approved.has(row.feedUrl)).toBe(false);
      expect(approvedInterfaces.has(row.sourceInterfaceSlug)).toBe(false);
      expect(row.reason.length).toBeGreaterThan(80);
    }
  });

  it("keeps the refused feeds and the reason they were refused", () => {
    const slugs = NEWS_SOURCES_REVIEWED_NOT_APPROVED.map((row) => row.sourceInterfaceSlug);
    expect(slugs).toContain("nvidia-newsroom-feed");
    expect(slugs).toContain("aws-news-blog-feed");
    for (const row of NEWS_SOURCES_REVIEWED_NOT_APPROVED) {
      expect(row.reason.length).toBeGreaterThan(80);
      // A refused feed is never also an ingested one.
      expect(NEWS_SOURCE_SLUGS.some((slug) => NEWS_SOURCES[slug].feedUrl === row.feedUrl)).toBe(false);
    }
  });
});

describe("the permission gate", () => {
  it("permits production collection only when both axes are permitted and production is approved", () => {
    for (const slug of NEWS_SOURCE_SLUGS) {
      expect(() => assertNewsIngestPermitted("production", NEWS_SOURCES[slug])).not.toThrow();
    }
  });

  it("refuses production collection from a source under review", () => {
    const underReview = {
      ...NEWS_SOURCES["coreweave-blog"],
      registry: {
        slug: "aws-news-blog-feed",
        termsReviewState: "under_review" as const,
        dataUseTermsState: "under_review" as const,
        productionAccessState: "production_review_pending" as const,
        writtenAgreementRequired: null,
      },
    };
    expect(() => assertNewsIngestPermitted("production", underReview)).toThrow(NewsPermissionError);
    // Research reading of a source that is merely unsettled is still allowed.
    expect(() => assertNewsIngestPermitted("research", underReview)).not.toThrow();
  });

  it("refuses even research retrieval from a blocked source", () => {
    const blocked = {
      ...NEWS_SOURCES["coreweave-blog"],
      registry: { ...NEWS_SOURCES["coreweave-blog"].registry, productionAccessState: "production_blocked" as const },
    };
    expect(() => assertNewsIngestPermitted("research", blocked)).toThrow(NewsPermissionError);
  });
});
