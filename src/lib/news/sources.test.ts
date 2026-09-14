import { describe, expect, it } from "vitest";

import {
  assertNewsIngestPermitted,
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

  it("holds Compute only, because Phase 1A migrates one rail", () => {
    expect(newsSourcesForCategory("compute").length).toBe(NEWS_SOURCE_SLUGS.length);
    for (const category of NEWS_CATEGORIES) {
      if (category.id === "compute") continue;
      expect(newsSourcesForCategory(category.id)).toEqual([]);
    }
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
