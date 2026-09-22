/**
 * One-off: recover the thumbnails The Block's URL change cost us.
 *
 *   DATABASE_URL=... npx tsx scripts/news/backfill-the-block-images.ts
 *   DATABASE_URL=... npx tsx scripts/news/backfill-the-block-images.ts --write
 *
 * On 2026-09-19 The Block began serving its feed artwork through its own
 * Cloudflare Images path. The ingestion allowlist was pinned to the asset path
 * underneath, so those URLs were refused and the articles were stored with no
 * thumbnail. The allowlist now follows the publisher; the article table is
 * insert-only, so the rows written in between do not heal on their own.
 *
 * Nothing is fetched. Every image URL here comes from a feed payload Urdais
 * already retrieved and stored in pipeline.source_retrievals, and each one is
 * put through the same normalizeImageUrl gate as a live ingestion — this
 * command applies the rule to payloads already held, it does not relax it.
 *
 * Idempotent and narrow. It writes only where image_url IS NULL, only for The
 * Block, and only a URL the gate permits, so a second run writes nothing and a
 * row somebody has since set by hand is left alone. Dry run unless --write.
 */

import { parseFeed } from "@/lib/news/feed";
import { normalizeImageUrl } from "@/lib/news/normalize";
import { newsSource } from "@/lib/news/sources";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

const SLUG = "the-block" as const;

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const source = newsSource(SLUG);
  const sql = await createTokenSqlExecutor(databaseUrl);

  const { rows: retrievals } = await sql.query(
    `SELECT r.response_body->>'body' AS body
       FROM pipeline.source_retrievals r
       JOIN reference.news_sources s ON s.source_interface_id = r.source_interface_id
      WHERE s.slug = $1 AND r.response_body ? 'body'
      ORDER BY r.requested_at DESC`,
    [SLUG],
  );

  // Newest retrieval first, and first writer wins: the most recent shape the
  // publisher served for a story is the one to record.
  const offered = new Map<string, string>();
  for (const row of retrievals) {
    for (const entry of parseFeed(String(row.body), source.mechanism).entries) {
      if (entry.link && entry.imageUrl && !offered.has(entry.link)) offered.set(entry.link, entry.imageUrl);
    }
  }

  const { rows: targets } = await sql.query(
    `SELECT a.id, a.canonical_url, a.published_at
       FROM pipeline.news_articles a
       JOIN reference.news_sources s ON s.source_interface_id = a.source_interface_id
      WHERE s.slug = $1 AND a.image_url IS NULL AND a.withdrawn_at IS NULL
      ORDER BY a.published_at`,
    [SLUG],
  );

  const planned: { id: string; url: string; imageUrl: string }[] = [];
  const refused: { url: string; imageUrl: string; reason: string }[] = [];
  const unmatched: string[] = [];

  for (const row of targets) {
    const canonicalUrl = String(row.canonical_url);
    const raw = offered.get(canonicalUrl);
    if (raw === undefined) {
      unmatched.push(canonicalUrl);
      continue;
    }
    const result = normalizeImageUrl(raw, source.imagePolicy, source.imageHosts);
    if (!result.ok) {
      refused.push({ url: canonicalUrl, imageUrl: raw, reason: result.reason });
    } else if (result.value === null) {
      refused.push({ url: canonicalUrl, imageUrl: raw, reason: "not_referenceable" });
    } else {
      planned.push({ id: String(row.id), url: canonicalUrl, imageUrl: result.value });
    }
  }

  let updated = 0;
  if (write) {
    for (const row of planned) {
      const result = await sql.query(
        `UPDATE pipeline.news_articles SET image_url = $2
          WHERE id = $1 AND image_url IS NULL
      RETURNING id`,
        [row.id, row.imageUrl],
      );
      updated += result.rows.length;
    }
  }

  await sql.end();

  console.log(
    JSON.stringify(
      {
        source: SLUG,
        mode: write ? "write" : "dry-run",
        retrievalsRead: retrievals.length,
        articlesMissingImage: targets.length,
        recoverable: planned.length,
        refusedByAllowlist: refused.length,
        noFeedItemHeld: unmatched.length,
        rowsUpdated: write ? updated : 0,
        planned: planned.map((row) => ({ url: row.url, imageUrl: row.imageUrl })),
        refused,
        unmatched,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
