import { describe, expect, it } from "vitest";

import { loadPublishedNews, type NewsSqlExecutor, type PublishedNewsRow } from "@/lib/news/sql";
import { newsArticleFromRow, newsArticlesFromRows } from "@/lib/news/read/read-model";

const ROW: PublishedNewsRow = {
  id: "11111111-1111-4111-8111-111111111111",
  category: "compute",
  title: "Capacity comes online in three regions",
  summary: "The publisher's own dek.",
  publisherName: "CoreWeave",
  canonicalUrl: "https://www.coreweave.com/blog/capacity",
  imageUrl: null,
  publishedAt: "2026-09-12T19:24:20.000Z",
};

/** A stub executor that records the statement and answers with fixed rows. */
function executor(rows: Record<string, unknown>[]): NewsSqlExecutor & { statements: string[]; params: unknown[][] } {
  const statements: string[] = [];
  const params: unknown[][] = [];
  return {
    statements,
    params,
    async query(text, values) {
      statements.push(text);
      params.push([...values]);
      return { rows };
    },
  };
}

describe("backend record to homepage article", () => {
  it("maps exactly the fields the rail renders, and nothing about ingestion", () => {
    expect(newsArticleFromRow(ROW)).toEqual({
      id: ROW.id,
      category: "compute",
      title: ROW.title,
      summary: "The publisher's own dek.",
      source: "CoreWeave",
      publishedAt: "2026-09-12T19:24:20.000Z",
      url: "https://www.coreweave.com/blog/capacity",
      imageUrl: null,
    });
    // No url key, article key, guid, retrieval or terms state crosses the boundary.
    expect(Object.keys(newsArticleFromRow(ROW)).sort()).toEqual(
      ["category", "id", "imageUrl", "publishedAt", "source", "summary", "title", "url"],
    );
  });

  it("passes a missing description through as null rather than inventing one", () => {
    expect(newsArticleFromRow({ ...ROW, summary: null }).summary).toBeNull();
  });

  it("attributes the story to the publisher, never to Urdais", () => {
    expect(newsArticlesFromRows([ROW, { ...ROW, id: "b", publisherName: "Google Cloud" }]).map((a) => a.source)).toEqual([
      "CoreWeave",
      "Google Cloud",
    ]);
  });
});

describe("the published-news query", () => {
  it("asks for one category, newest first, bounded, and only publishable rows", async () => {
    const sql = executor([]);
    await loadPublishedNews(sql, "compute", 12);
    const statement = sql.statements[0]!;
    expect(sql.params[0]).toEqual(["compute", 12]);
    expect(statement).toMatch(/ORDER BY a\.published_at DESC/);
    expect(statement).toMatch(/LIMIT \$2/);
    expect(statement).toMatch(/a\.withdrawn_at IS NULL/);
    expect(statement).toMatch(/ns\.is_enabled/);
    expect(statement).toMatch(/si\.production_access_state = 'production_approved'/);
  });

  it("reads rows in the order the database returned them", async () => {
    const sql = executor([
      { id: "a", category: "compute", title: "Newer", summary: null, canonical_url: "https://x/a", image_url: null, published_at: "2026-09-13T00:00:00Z", publisher_name: "Google Cloud" },
      { id: "b", category: "compute", title: "Older", summary: "dek", canonical_url: "https://x/b", image_url: null, published_at: "2026-09-12T00:00:00Z", publisher_name: "CoreWeave" },
    ]);
    const rows = await loadPublishedNews(sql, "compute", 12);
    expect(rows.map((row) => row.title)).toEqual(["Newer", "Older"]);
    expect(rows[0]!.publishedAt).toBe("2026-09-13T00:00:00.000Z");
  });

  it("drops a row it cannot read instead of emptying the rail", async () => {
    const sql = executor([
      { id: "a", category: "compute", title: "Fine", summary: null, canonical_url: "https://x/a", image_url: null, published_at: "2026-09-13T00:00:00Z", publisher_name: "Google Cloud" },
      { id: "b", category: "compute", title: "Broken", summary: null, canonical_url: "https://x/b", image_url: null, published_at: "not a date", publisher_name: "CoreWeave" },
    ]);
    expect((await loadPublishedNews(sql, "compute", 12)).map((row) => row.title)).toEqual(["Fine"]);
  });
});
