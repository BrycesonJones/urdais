import { describe, expect, it } from "vitest";

import { loadFeedFixture } from "@/lib/news/fixtures";
import { ingestNewsSource, ingestNewsSources, type RetrievedFeed } from "@/lib/news/ingest";
import { NEWS_SOURCES, newsSourcesForCategory } from "@/lib/news/sources";
import { InMemoryNewsStore } from "@/lib/news/store";
import { MalformedFeedError, NewsPermissionError, type NewsSourceDefinition, type NewsSourceSlug } from "@/lib/news/types";

// One sequence for the whole file. A per-call counter would hand a second run
// the first run's retrieval id and make a fresh retrieval look already stored.
let counter = 0;
const nextId = () => `id-${(counter += 1)}`;

function artifact(slug: NewsSourceSlug, overrides: Partial<RetrievedFeed> = {}): RetrievedFeed {
  const fixture = loadFeedFixture(slug);
  return {
    body: fixture.body,
    contentType: fixture.contentType,
    url: fixture.sourceUrl,
    requestedAt: fixture.retrievedAt,
    retrievedAt: fixture.retrievedAt,
    status: 200,
    ...overrides,
  };
}

function ingest(slug: NewsSourceSlug, store: InMemoryNewsStore, overrides: Partial<RetrievedFeed> = {}) {
  return ingestNewsSource({
    source: NEWS_SOURCES[slug],
    mode: "production",
    artifact: artifact(slug, overrides),
    store,
    idFactory: nextId,
  });
}

describe("one source, one retained feed", () => {
  it("stores every entry with attribution, a canonical link and a publication time", () => {
    const store = new InMemoryNewsStore();
    const report = ingest("coreweave-blog", store);

    expect(report.entriesParsed).toBe(4);
    expect(report.articlesInserted).toBe(4);
    expect(report.entriesRejected).toBe(0);
    for (const row of store.all) {
      expect(row.category).toBe("compute");
      expect(row.sourceInterfaceId).toBe(NEWS_SOURCES["coreweave-blog"].sourceInterfaceId);
      expect(row.canonicalUrl.startsWith("https://")).toBe(true);
      expect(Number.isFinite(new Date(row.publishedAt).getTime())).toBe(true);
      expect(row.retrievalId).toBe(report.retrievalId);
    }
  });

  it("links to the host the publisher's own pages declare canonical", () => {
    const store = new InMemoryNewsStore();
    ingest("coreweave-blog", store);
    expect(store.all.every((row) => row.canonicalUrl.startsWith("https://www.coreweave.com/blog/"))).toBe(true);
    // The identity the feed gave is kept as it was given, host and all.
    expect(store.all[0]!.sourceGuid).toContain("wf.coreweave.com");
  });

  it("stores the publisher's dek without the syndication trailer", () => {
    const store = new InMemoryNewsStore();
    ingest("microsoft-azure-blog", store);
    const summaries = store.all.map((row) => row.summary);
    expect(summaries.some((summary) => summary !== null)).toBe(true);
    expect(summaries.every((summary) => summary === null || !summary.includes("appeared first on"))).toBe(true);
  });

  it("stores no description at all where the feed's description is the article body", () => {
    const store = new InMemoryNewsStore();
    const report = ingest("google-cloud-infrastructure", store);
    expect(report.articlesInserted).toBeGreaterThan(0);
    expect(store.all.every((row) => row.summary === null)).toBe(true);
  });

  it("stores an image only where the source's own rights finding allows one", () => {
    const withImages = new InMemoryNewsStore();
    ingest("coreweave-blog", withImages);
    expect(withImages.all.every((row) => row.imageUrl !== null)).toBe(true);

    // Same pipeline, a source whose feed attaches nothing to attach.
    const without = new InMemoryNewsStore();
    ingest("microsoft-azure-blog", without);
    expect(without.all.every((row) => row.imageUrl === null)).toBe(true);
  });

  it("retains the feed body and its hash as the evidence behind the articles", () => {
    const store = new InMemoryNewsStore();
    const report = ingest("coreweave-blog", store);
    const retrieval = store.retrievals[0]!;
    expect(retrieval.responseHash).toBe(report.responseHash);
    expect(retrieval.responseBody.body).toBe(loadFeedFixture("coreweave-blog").body);
    expect(retrieval.retrievalPurpose).toBe("production");
    expect(retrieval.permissionGrantId).toBe(NEWS_SOURCES["coreweave-blog"].permissionGrantId);
  });

  it("asserts no permission basis for a research pass", () => {
    const store = new InMemoryNewsStore();
    ingestNewsSource({
      source: NEWS_SOURCES["coreweave-blog"],
      mode: "research",
      artifact: artifact("coreweave-blog"),
      store,
      idFactory: nextId,
    });
    expect(store.retrievals[0]!.permissionGrantId).toBeNull();
    expect(store.retrievals[0]!.retrievalPurpose).toBe("research");
  });
});

describe("idempotency", () => {
  it("writes nothing on a second pass over the same retrieval", () => {
    const store = new InMemoryNewsStore();
    const first = ingest("coreweave-blog", store);
    const second = ingest("coreweave-blog", store);

    expect(second.alreadyPresentForRetrieval).toBe(true);
    expect(second.articlesInserted).toBe(0);
    expect(second.diagnostics.map((d) => d.code)).toContain("RETRIEVAL_IDEMPOTENT");
    expect(store.all.length).toBe(first.articlesInserted);
  });

  it("writes nothing when the same stories arrive under a later retrieval", () => {
    const store = new InMemoryNewsStore();
    const first = ingest("coreweave-blog", store);
    // A scheduled fetch an hour later is a new retrieval and the same stories.
    const later = ingest("coreweave-blog", store, {
      requestedAt: "2026-09-14T18:45:00Z",
      retrievedAt: "2026-09-14T18:45:00Z",
    });

    expect(later.alreadyPresentForRetrieval).toBe(false);
    expect(later.entriesParsed).toBe(4);
    expect(later.articlesInserted).toBe(0);
    expect(later.articlesAlreadyStored).toBe(4);
    expect(store.all.length).toBe(first.articlesInserted);
  });

  it("is stable over many runs", () => {
    const store = new InMemoryNewsStore();
    for (let run = 0; run < 5; run += 1) {
      ingest("coreweave-blog", store, {
        requestedAt: `2026-09-14T2${run}:00:00Z`,
        retrievedAt: `2026-09-14T2${run}:00:00Z`,
      });
    }
    expect(store.all.length).toBe(4);
  });

  it("stores one row for a story two approved feeds both carry", () => {
    const store = new InMemoryNewsStore();
    const shared = `<rss version="2.0"><channel><title>Feed</title>
      <item><title>Shared story</title><link>https://cloud.google.com/blog/products/compute/shared/</link>
        <guid isPermaLink="false">a-guid</guid><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
    const sameStoryElsewhere = shared
      .replace("a-guid", "a-different-guid")
      .replace("/shared/", "/shared?utm_source=compute");

    ingestNewsSource({
      source: NEWS_SOURCES["google-cloud-infrastructure"],
      mode: "production",
      artifact: artifact("google-cloud-infrastructure", { body: shared }),
      store,
      idFactory: nextId,
    });
    const second = ingestNewsSource({
      source: NEWS_SOURCES["google-cloud-compute"],
      mode: "production",
      artifact: artifact("google-cloud-compute", { body: sameStoryElsewhere }),
      store,
      idFactory: nextId,
    });

    expect(second.articlesInserted).toBe(0);
    expect(second.articlesAlreadyStored).toBe(1);
    expect(store.all.length).toBe(1);
  });

  it("stores one row when a single feed repeats a story", () => {
    const store = new InMemoryNewsStore();
    const item = `<item><title>Twice</title><link>https://www.coreweave.com/blog/twice</link>
      <pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate></item>`;
    const report = ingest("coreweave-blog", store, {
      body: `<rss version="2.0"><channel><title>F</title>${item}${item}</channel></rss>`,
    });
    expect(report.entriesParsed).toBe(2);
    expect(report.articlesInserted).toBe(1);
    expect(report.diagnostics.map((d) => d.code)).toContain("ENTRY_DUPLICATE_IN_FEED");
  });
});

describe("entries Urdais will not store", () => {
  const cases: { name: string; item: string; code: string }[] = [
    { name: "no title", item: "<item><link>https://www.coreweave.com/blog/a</link><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate></item>", code: "ENTRY_NO_TITLE" },
    { name: "no link", item: "<item><title>A</title><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate></item>", code: "ENTRY_NO_LINK" },
    { name: "insecure link", item: "<item><title>A</title><link>http://www.coreweave.com/blog/a</link><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate></item>", code: "ENTRY_LINK_NOT_HTTPS" },
    { name: "unparseable link", item: "<item><title>A</title><link>/blog/a</link><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate></item>", code: "ENTRY_LINK_UNPARSEABLE" },
    { name: "no date", item: "<item><title>A</title><link>https://www.coreweave.com/blog/a</link></item>", code: "ENTRY_NO_PUBLISHED_AT" },
    { name: "unreadable date", item: "<item><title>A</title><link>https://www.coreweave.com/blog/a</link><pubDate>soon</pubDate></item>", code: "ENTRY_PUBLISHED_AT_UNPARSEABLE" },
  ];

  for (const testCase of cases) {
    it(`skips an entry with ${testCase.name} and names the reason`, () => {
      const store = new InMemoryNewsStore();
      const good = `<item><title>Good</title><link>https://www.coreweave.com/blog/good</link><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate></item>`;
      const report = ingest("coreweave-blog", store, {
        body: `<rss version="2.0"><channel><title>F</title>${testCase.item}${good}</channel></rss>`,
      });
      expect(report.entriesRejected).toBe(1);
      expect(report.diagnostics.map((d) => d.code)).toContain(testCase.code);
      // The sound entry beside it is still stored.
      expect(report.articlesInserted).toBe(1);
      expect(store.all[0]!.title).toBe("Good");
    });
  }

  it("writes nothing when the feed returned an error status", () => {
    const store = new InMemoryNewsStore();
    const report = ingest("coreweave-blog", store, { body: "upstream failure", status: 503 });
    expect(report.articlesInserted).toBe(0);
    expect(report.diagnostics.map((d) => d.code)).toContain("HTTP_ERROR");
    expect(store.all.length).toBe(0);
  });

  it("reports an empty feed rather than treating it as success", () => {
    const store = new InMemoryNewsStore();
    const report = ingest("coreweave-blog", store, {
      body: '<rss version="2.0"><channel><title>F</title></channel></rss>',
    });
    expect(report.diagnostics.map((d) => d.code)).toContain("FEED_EMPTY");
  });

  it("refuses production ingestion of a source that is not approved on both axes", () => {
    const blocked: NewsSourceDefinition = {
      ...NEWS_SOURCES["coreweave-blog"],
      registry: {
        slug: "nvidia-newsroom-feed",
        termsReviewState: "under_review",
        dataUseTermsState: "under_review",
        productionAccessState: "production_review_pending",
        writtenAgreementRequired: null,
      },
    };
    expect(() =>
      ingestNewsSource({ source: blocked, mode: "production", artifact: artifact("coreweave-blog"), store: new InMemoryNewsStore() }),
    ).toThrow(NewsPermissionError);
  });
});

describe("a run over every Compute source", () => {
  it("ingests every approved feed into one Compute set", async () => {
    const store = new InMemoryNewsStore();
    const run = await ingestNewsSources({
      sources: newsSourcesForCategory("compute"),
      mode: "production",
      store,
      retrieve: (source) => Promise.resolve(artifact(source.slug)),
      idFactory: nextId,
      now: () => new Date("2026-09-14T17:45:00Z"),
    });

    const compute = newsSourcesForCategory("compute");
    expect(run.sourcesSucceeded).toBe(compute.length);
    expect(run.sourcesFailed).toBe(0);
    expect(run.articlesInserted).toBe(store.all.length);
    expect(store.all.every((row) => row.category === "compute")).toBe(true);
    expect(new Set(store.all.map((row) => row.sourceInterfaceId)).size).toBe(compute.length);
  });

  it("keeps ingesting when one source fails", async () => {
    const store = new InMemoryNewsStore();
    const run = await ingestNewsSources({
      sources: newsSourcesForCategory("compute"),
      mode: "production",
      store,
      retrieve: (source) =>
        source.slug === "microsoft-azure-blog"
          ? Promise.reject(new Error("connect ETIMEDOUT"))
          : Promise.resolve(artifact(source.slug)),
      idFactory: nextId,
    });

    expect(run.sourcesFailed).toBe(1);
    expect(run.sourcesSucceeded).toBe(newsSourcesForCategory("compute").length - 1);
    const failed = run.outcomes.find((outcome) => !outcome.ok);
    expect(failed && !failed.ok && failed.error.message).toContain("ETIMEDOUT");
    expect(store.all.length).toBeGreaterThan(0);
    expect(store.all.some((row) => row.sourceInterfaceId === NEWS_SOURCES["microsoft-azure-blog"].sourceInterfaceId)).toBe(false);
  });

  it("records a feed that returned the wrong kind of document without stopping the run", async () => {
    const store = new InMemoryNewsStore();
    const run = await ingestNewsSources({
      sources: newsSourcesForCategory("compute"),
      mode: "production",
      store,
      retrieve: (source) =>
        Promise.resolve(
          source.slug === "google-cloud-compute"
            ? artifact(source.slug, { body: "<html><body>Service unavailable</body></html>" })
            : artifact(source.slug),
        ),
      idFactory: nextId,
    });

    expect(run.sourcesSucceeded).toBe(newsSourcesForCategory("compute").length - 1);
    const failed = run.outcomes.find((outcome) => !outcome.ok);
    expect(failed && !failed.ok && failed.error.name).toBe(new MalformedFeedError("x").name);
  });
});
