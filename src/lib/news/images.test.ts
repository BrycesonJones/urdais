import { describe, expect, it } from "vitest";

import { loadFeedFixture } from "@/lib/news/fixtures";
import { parseFeed } from "@/lib/news/feed";
import { ingestNewsSource, type RetrievedFeed } from "@/lib/news/ingest";
import { normalizeImageUrl } from "@/lib/news/normalize";
import { NEWS_SOURCES } from "@/lib/news/sources";
import { InMemoryNewsStore } from "@/lib/news/store";
import { NEWS_SOURCE_SLUGS, type NewsSourceSlug } from "@/lib/news/types";

let counter = 0;
const nextId = () => `img-${(counter += 1)}`;

const GOOGLE_HOSTS = [{ host: "storage.googleapis.com", pathPrefix: "/gweb-cloudblog-publish/" }];

function artifact(slug: NewsSourceSlug, body?: string): RetrievedFeed {
  const fixture = loadFeedFixture(slug);
  return {
    body: body ?? fixture.body,
    contentType: fixture.contentType,
    url: fixture.sourceUrl,
    requestedAt: fixture.retrievedAt,
    retrievedAt: fixture.retrievedAt,
    status: 200,
    ...(body ? {} : {}),
  };
}

function ingest(slug: NewsSourceSlug, body?: string) {
  const store = new InMemoryNewsStore();
  const report = ingestNewsSource({
    source: NEWS_SOURCES[slug],
    mode: "production",
    artifact: artifact(slug, body),
    store,
    idFactory: nextId,
  });
  return { store, report };
}

describe("reading an image out of a feed", () => {
  it("reads a media:content url", () => {
    const parsed = parseFeed(loadFeedFixture("coreweave-blog").body, "rss");
    expect(parsed.entries[0]!.imageUrl).toMatch(/^https:\/\/cdn\.prod\.website-files\.com\/62bc66d2/);
  });

  it("reads an image enclosure", () => {
    const parsed = parseFeed(loadFeedFixture("cloudflare-workers-blog").body, "rss");
    expect(parsed.entries[0]!.imageUrl).toMatch(/^https:\/\/blog\.cloudflare\.com\/_emdash\/api\/media\/file\//);
  });

  it("falls back to media:thumbnail when there is no media:content", () => {
    const item = `<item><title>T</title><link>https://www.together.ai/blog/x</link>
      <pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate>
      <media:thumbnail url="https://cdn.prod.website-files.com/69654e88dce9154b5f12070c/t.jpg"/></item>`;
    const parsed = parseFeed(`<rss version="2.0"><channel><title>F</title>${item}</channel></rss>`, "rss");
    expect(parsed.entries[0]!.imageUrl).toBe("https://cdn.prod.website-files.com/69654e88dce9154b5f12070c/t.jpg");
  });

  it("ignores an enclosure that is not an image", () => {
    const item = `<item><title>T</title><link>https://x/y</link><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate>
      <enclosure url="https://x/y.mp3" type="audio/mpeg" length="1"/></item>`;
    const parsed = parseFeed(`<rss version="2.0"><channel><title>F</title>${item}</channel></rss>`, "rss");
    expect(parsed.entries[0]!.imageUrl).toBeNull();
  });

  it("reports no image when the feed attaches none", () => {
    for (const slug of ["microsoft-azure-blog", "lambda-blog", "digitalocean-blog"] as const) {
      const fixture = loadFeedFixture(slug);
      const parsed = parseFeed(fixture.body, NEWS_SOURCES[slug].mechanism);
      expect(parsed.entries.every((entry) => entry.imageUrl === null)).toBe(true);
    }
  });
});

describe("the image host allowlist", () => {
  it("permits a URL on the source's own host and path", () => {
    expect(
      normalizeImageUrl("https://storage.googleapis.com/gweb-cloudblog-publish/images/a.png", "feed_media", GOOGLE_HOSTS),
    ).toEqual({ ok: true, value: "https://storage.googleapis.com/gweb-cloudblog-publish/images/a.png" });
  });

  it("refuses another bucket on the same host, which is the whole point of the path", () => {
    const result = normalizeImageUrl("https://storage.googleapis.com/someone-elses-bucket/a.png", "feed_media", GOOGLE_HOSTS);
    expect(result).toEqual({
      ok: false,
      reason: "host_not_permitted",
      url: "https://storage.googleapis.com/someone-elses-bucket/a.png",
    });
  });

  it("keeps two publishers on one shared CDN apart", () => {
    const coreweave = NEWS_SOURCES["coreweave-blog"].imageHosts;
    const together = NEWS_SOURCES["together-ai-blog"].imageHosts;
    expect(coreweave[0]!.host).toBe(together[0]!.host);
    const togetherAsset = "https://cdn.prod.website-files.com/69654e88dce9154b5f12070c/a.jpg";
    expect(normalizeImageUrl(togetherAsset, "feed_media", together).ok).toBe(true);
    expect(normalizeImageUrl(togetherAsset, "feed_media", coreweave).ok).toBe(false);
  });

  it("stores nothing for a source that references no images, even when the feed offers one", () => {
    expect(normalizeImageUrl("https://cdn.example.com/a.png", "none", [])).toEqual({ ok: true, value: null });
    expect(normalizeImageUrl("https://cdn.example.com/a.png", "none", GOOGLE_HOSTS)).toEqual({ ok: true, value: null });
  });

  it("refuses an insecure or unparseable image without failing the story", () => {
    expect(normalizeImageUrl("http://storage.googleapis.com/gweb-cloudblog-publish/a.png", "feed_media", GOOGLE_HOSTS))
      .toEqual({ ok: true, value: null });
    expect(normalizeImageUrl("not a url", "feed_media", GOOGLE_HOSTS)).toEqual({ ok: true, value: null });
    expect(normalizeImageUrl(null, "feed_media", GOOGLE_HOSTS)).toEqual({ ok: true, value: null });
  });

  it("drops the fragment but keeps the path and query the publisher gave", () => {
    const result = normalizeImageUrl(
      "https://storage.googleapis.com/gweb-cloudblog-publish/images/a.png?v=2#x",
      "feed_media",
      GOOGLE_HOSTS,
    );
    expect(result).toEqual({ ok: true, value: "https://storage.googleapis.com/gweb-cloudblog-publish/images/a.png?v=2" });
  });
});

describe("images through ingestion", () => {
  it("stores the feed's thumbnail for a source that references them", () => {
    const { store } = ingest("coreweave-blog");
    expect(store.all.length).toBeGreaterThan(0);
    expect(store.all.every((row) => row.imageUrl?.startsWith("https://cdn.prod.website-files.com/62bc66d2"))).toBe(true);
  });

  it("stores no thumbnail for a source that references none", () => {
    for (const slug of ["microsoft-azure-blog", "lambda-blog", "digitalocean-blog"] as const) {
      const { store } = ingest(slug);
      expect(store.all.length).toBeGreaterThan(0);
      expect(store.all.every((row) => row.imageUrl === null)).toBe(true);
    }
  });

  it("stores the story without an image, and names the refusal, when the host moves", () => {
    const item = `<item><title>Moved CDN</title><link>https://www.coreweave.com/blog/moved</link>
      <pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate>
      <media:content url="https://cdn.example-new-host.com/a.png"/></item>`;
    const { store, report } = ingest("coreweave-blog", `<rss version="2.0"><channel><title>F</title>${item}</channel></rss>`);
    expect(report.articlesInserted).toBe(1);
    expect(store.all[0]!.imageUrl).toBeNull();
    expect(report.diagnostics.map((d) => d.code)).toContain("ENTRY_IMAGE_HOST_NOT_PERMITTED");
  });

  it("only ever stores an image whose host the source declared", () => {
    for (const slug of NEWS_SOURCE_SLUGS) {
      const source = NEWS_SOURCES[slug];
      const { store } = ingest(slug);
      for (const row of store.all) {
        if (row.imageUrl === null) continue;
        const url = new URL(row.imageUrl);
        expect(
          source.imageHosts.some((entry) => url.hostname === entry.host && url.pathname.startsWith(entry.pathPrefix)),
        ).toBe(true);
      }
    }
  });
});
