# News ingestion — Phase 1A

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 14 September 2026, when the homepage Compute rail stopped reading mock data.

The homepage Compute rail reads production data. This document records how, from
which sources, under what reading of their terms, and what is deliberately not
built yet.

Phase 1A does not add a `/news` page, a news navigation item, an article page,
or a news API. The only reader is the homepage.

---

## 1. Scope

| Rail | Phase 1A |
| --- | --- |
| Compute | **production** — four approved feeds, ingested and persisted |
| Memory | mock |
| Photonics | mock |
| Energy / Power | mock |
| AI Chips | mock |
| Crypto | mock |

The six categories, their order, and the rail and card components are unchanged.
The mock rails keep their `Demo content` badge; the Compute rail carries `Live`,
so the two are never presented as the same thing.

---

## 2. Architecture

```text
reference.news_sources          which approved feed serves which category
        │
reference.source_interfaces     the endpoint, the two-axis terms review, approval
reference.permission_grants     the basis a production retrieval is made under
        │
pipeline.source_retrievals      one fetch, body and hash retained as evidence
        │
pipeline.news_articles          normalized metadata. Never a body.
        │
loadComputeNews()               newest first, bounded, only publishable rows
        │
NewsSections → NewsRail → NewsCard
```

Nothing in this path is news-specific except the two new tables. The registry,
the permission gate, the retrieval table and the Postgres pool are the ones the
UCPI and token-price pipelines already use.

### Files

| Concern | File |
| --- | --- |
| Approved sources | `src/lib/news/sources.ts` |
| Feed reading (RSS, Atom) | `src/lib/news/feed.ts` |
| Urdais normalization rules | `src/lib/news/normalize.ts` |
| Pipeline | `src/lib/news/ingest.ts` |
| Write surface | `src/lib/news/store.ts`, `src/lib/news/sql.ts` |
| Homepage accessor | `src/lib/news/read/load.ts` |
| Backend record → `NewsArticle` | `src/lib/news/read/read-model.ts` |
| Retained feed artifacts | `src/lib/news/fixtures/` |
| Invocation | `scripts/news/ingest.ts` (`npm run news:ingest`) |
| Schema | `supabase/migrations/20260914070000_news_ingestion_foundation.sql` |

---

## 3. Database model

### `reference.news_sources`

One row per approved feed: `category`, `feed_mechanism`, `syndication_basis`,
`is_enabled`, and a pointer to the source interface that holds its endpoint and
rights state. A trigger refuses a row that points at a non-news interface, and
refuses to enable one whose interface is not `production_approved`, so the
approval decision cannot be made in one table and contradicted in the other.

### `pipeline.news_articles`

`source_interface_id`, `retrieval_id`, `category`, `canonical_url`, `url_key`,
`source_guid`, `article_key`, `title`, `summary`, `image_url`, `published_at`,
`ingested_at`, `withdrawn_at`, `withdrawal_reason`, `created_at`.

There is **no column an article body could be written to**. `summary` is capped
at 500 characters by a check constraint and `title` at 400.

Insert-only. A trigger rejects every delete and every update except one:
setting `withdrawn_at` and `withdrawal_reason` together on a row that has not
been withdrawn. `service_role` holds no `DELETE` privilege at all. Withdrawal
exists because a published surface needs a way to stop showing a story — a
publisher request, or a record ingested in error — without ingested metadata
ever being rewritten.

### Changes to existing objects

* `source_interfaces.source_class` gains `news_feed`.
* `permission_grants` gains `covers_content_syndication`.
* `pipeline.check_retrieval_permission()` now asks the coverage question that
  belongs to the interface's source class: a news feed's non-research retrieval
  needs collection plus content syndication, and every other interface still
  needs collection plus index use. A syndication-only grant cannot authorize a
  price interface, which `supabase/tests/220_news_ingestion.sql` checks.
* Six existing database tests had global registry counts narrowed to the
  compute-market population they were always about.

### Why `data_use_terms_state` did not need a new column

The column asks whether the use Urdais makes of a source's data is permitted.
The use is set by the interface's class: for a price interface it is index
construction, which is what every pre-existing row was reviewed against; for a
news feed it is displaying the feed's own headline metadata with attribution and
a link back. No existing row's meaning changed, because every interface reviewed
before this phase is a price interface.

---

## 4. Source qualification

A source is ingested only when all of the following hold.

1. The publisher offers a machine-readable feed or an official API. A page that
   can technically be scraped is not a source.
2. Automated retrieval of that endpoint is permitted by the publisher's own
   terms, read together with its robots rules.
3. Displaying the feed's headline metadata with attribution and a link back is
   permitted, or is the plain purpose of the feed.
4. Both axes are recorded as `permitted`, the interface is `production_approved`,
   and a permission grant records the basis with the decisive clauses verbatim.

Where the answer is unsettled the source is recorded as reviewed and **not**
ingested. Two were.

`syndication_basis` is `publisher_feed_syndication` for all four Phase 1A
sources. That is a reasonable operational interpretation of ordinary feed
syndication — the publisher packages headline, link, timestamp and description
precisely so third parties can display them and link back — and it is **not** a
written grant, not legal advice, and not index permission.

### Approved

All four were retrieved successfully on 2026-09-14 and their responses hashed.

| Source | Endpoint | Mechanism |
| --- | --- | --- |
| Google Cloud — Infrastructure | `https://cloudblog.withgoogle.com/products/infrastructure/rss/` | RSS 2.0 |
| Google Cloud — Compute | `https://cloudblog.withgoogle.com/products/compute/rss/` | RSS 2.0 |
| Microsoft Azure blog | `https://azure.microsoft.com/en-us/blog/feed/` | RSS 2.0 |
| CoreWeave blog | `https://www.coreweave.com/blog/rss.xml` | RSS 2.0 |

**Google Cloud (both feeds).** The Google Terms of Service prohibit "using
automated means to access content from any of our services in violation of the
machine-readable instructions on our web pages (for example, robots.txt files
that disallow crawling…)". That conditions automated access on the robots rules
rather than prohibiting it. `cloudblog.withgoogle.com/robots.txt` is two lines:
`User-agent: *` / `Disallow: /search/`. The feed paths are not disallowed for any
agent. Items link to `cloud.google.com`, the publisher's canonical host.

**Microsoft Azure.** The Microsoft Terms of Use state "You may not obtain or
attempt to obtain any materials or information through any means not
intentionally made available through the Services." A published RSS feed is
intentionally made available. This is the same clause and the same reading the
Phase 4A review already recorded for the Azure Retail Prices API. The scraping
prohibition in the same document is scoped to "the AI services".
`azure.microsoft.com/robots.txt` does not disallow the blog feed path.

**CoreWeave.** The CoreWeave Terms of Service (last modified 30 June 2022) are a
customer contract entered on account creation; Urdais holds no CoreWeave
account. The document was read in full for automated-access, robot, spider,
scraper, crawler, data-mining, harvesting, index and benchmark language and
contains none. `www.coreweave.com/robots.txt` disallows `/blog-categories/` and
`/event/` only.

### Reviewed and refused

| Source | Endpoint | Why not |
| --- | --- | --- |
| NVIDIA Newsroom | `https://nvidianews.nvidia.com/releases.xml` | The NVIDIA Terms of Service linked from the newsroom footer prohibit "any robot, spider, scraper, crawler, data mining tool… to access, acquire, copy or monitor any portion of the Site", with no carve-out for the RSS feed the newsroom itself publishes. Publishing a feed and prohibiting automated access are in tension and neither settles the other. Same shape as the Runpod finding in Phase 4A; recorded `under_review`. |
| AWS News Blog | `https://aws.amazon.com/blogs/aws/feed/` | The AWS Site Terms exclude "any use of data mining, robots, or similar data gathering and extraction tools" from the licence granted over the AWS Site, and the blog feed is on the AWS Site rather than on a separately documented programmatic interface — the distinction the Phase 4A review relied on to treat the Price List Bulk API differently. robots.txt is **not** the obstacle: the blanket `Disallow: /blogs/` belongs to the `AdsBot-Google` group, and the `User-agent: *` group beginning at line 35 permits the feed. |

Both are recorded in `reference.source_interfaces` with their evidence, and in
`NEWS_SOURCES_REVIEWED_NOT_APPROVED`, so the refusal travels with the code.

### What is stored from each source

Identical for all four: headline, canonical URL, publication time, the
publisher's own snippet where policy allows one, the feed's stable id, the
category, and the retrieval lineage. Never a body, never a paywalled page, never
a generated summary, and in Phase 1A never an image.

| Source | Description stored | Image stored |
| --- | --- | --- |
| Google Cloud — Infrastructure | none (`omit_feed_carries_body`) | none |
| Google Cloud — Compute | none (`omit_feed_carries_body`) | none |
| Microsoft Azure blog | publisher dek, trailer removed | none |
| CoreWeave blog | publisher dek | none |

---

## 5. Normalization rules

**Canonical URL.** Must parse and must be `https`. Scheme and host lowercased,
fragment dropped, campaign parameters removed by an exact list plus the `utm_`,
`hsa_`, `pk_`, `mtm_` and `piwik_` prefixes. A parameter Urdais does not
recognise is left alone, because removing one that selects content would send
readers to a different page than the publisher linked.

**Host rewrite.** The CoreWeave feed emits links on `wf.coreweave.com`. Each of
four article pages fetched on 2026-09-14 declared `rel="canonical"` on
`www.coreweave.com` with the path unchanged. That rewrite is recorded on the
source definition; it is never inferred at parse time, and it applies to that
host only.

**`url_key`.** The canonical URL reduced further for identity: query parameters
ordered, a trailing slash on a non-root path dropped. Unique across every
source.

**Title.** Markup removed, entities resolved, whitespace collapsed, bounded at
400 characters on a word boundary. An entry whose title normalizes to nothing is
rejected.

**Summary.** Under `source_description`: markup removed, the WordPress "The post
… appeared first on …" trailer removed, bounded at 500 characters. Under
`omit_feed_carries_body`: `null`. Empty is `null`, never an empty string. Urdais
generates no description, ever.

**Timestamp.** RFC 822 (`pubDate`) and ISO 8601 (Atom `published`/`updated`) both
resolve to one UTC instant. Before 2000-01-01, or more than 48 hours after the
retrieval, is rejected as implausible rather than stored.

**Image.** Only where the source's `image_policy` is `feed_media`, only from a
`media:content`, `media:thumbnail` or image `enclosure` the feed supplied, and
only over https. No source opts in during Phase 1A, so no publisher image is
referenced and the existing Urdais fallback renders on every production card.

---

## 6. Deduplication and idempotency

Identity is deterministic. `article_key` is the publisher's own stable GUID
where the feed gives one, the `url_key` otherwise. Headline similarity is never
an identity signal.

Three layers, in order of authority:

1. **Database.** `unique (source_interface_id, article_key)` and a global
   `unique (url_key)`. Correctness does not depend on application code.
2. **Within a run.** A story two approved feeds both carry, or one a single feed
   repeats, is offered once.
3. **Reported honestly.** A run against a live database seeds itself with the
   identity already stored, so the counts it prints are what it wrote.

The global `url_key` index is why the two overlapping Google Cloud feeds do not
double up: the first feed to carry a story owns it.

Verified end to end on 2026-09-14 against a local database: first live run
inserted 149 articles across the four feeds (one already deduplicated between
the Google feeds); the second run inserted 0.

---

## 7. Read path

`loadComputeNews()` in `src/lib/news/read/load.ts`. One query, newest first,
`LIMIT 12`, filtered to rows that are not withdrawn and whose source is still
enabled and still `production_approved` — so an article whose source loses
approval stops publishing without anything having to delete it. Rows become
`NewsArticle` objects at `src/lib/news/read/read-model.ts`; no url key, article
key, GUID, retrieval or terms state crosses that boundary.

There is no API route. Nothing outside the homepage reads news, and an endpoint
nobody calls is a surface to maintain rather than a feature.

Because the page reads production state it declares
`export const dynamic = "force-dynamic"`. Without it the homepage would serve
whatever the store held at build time for as long as the build lived.

### Failure behaviour

`{ articles: [], available: false }` when the store cannot be read at all;
`{ articles: [], available: true }` when it can be read and holds nothing. The
rail says "Compute news is unavailable right now." or "No Compute stories have
been ingested yet." respectively. In neither case does mock content appear. A
single unreadable row is skipped rather than emptying the rail.

---

## 8. Running ingestion

```bash
npm run news:ingest -- --mode research                    # fixtures, no network
npm run news:ingest -- --mode research --live             # live GET, nothing published
DATABASE_URL=... npm run news:ingest -- --mode production --live --write
```

`--source <slug>` restricts the run to one feed. Output is one JSON object:
per-source entries parsed, inserted, already stored and rejected, with a named
diagnostic behind every rejection, plus any source that failed outright. No
secret is printed and the database URL is never echoed. A run in which every
source failed exits non-zero.

### The scheduler boundary

**Scheduling is deliberately not built, and no new infrastructure is needed to
add it.** Urdais deploys on Vercel and `urdais.com` went live on 14 September
2026, so the platform already has a scheduler: Vercel Cron. It invokes an HTTP
route rather than a shell command, so wiring it means adding one authenticated
route that calls `ingestNewsSources` and `persistNewsRun` — the same two
functions `scripts/news/ingest.ts` calls — plus a shared secret and a decision
about cadence. Hourly is ample for feeds that publish a few items a day.

That route is Phase 1B work, not because the platform is missing but because an
unauthenticated ingestion trigger on a public origin is a worse thing to ship
than a command an operator runs. What Phase 1A guarantees is the property the
scheduler will depend on: the run is safe to repeat, so a cron that fires twice,
retries, or overlaps writes nothing extra.

### After this merges

The Compute rail will render "Compute news is unavailable right now." on
`urdais.com` until two things are true, in this order:

1. The deployed application has a `DATABASE_URL` for UrdaisProd. Without one the
   read path returns `available: false` — which is the correct fail-closed
   behaviour, not a bug.
2. `npm run news:ingest -- --mode production --live --write` has been run
   against UrdaisProd at least once, by an operator or by the Phase 1B route.

Neither is done by this pull request. See
`docs/operations/production-environments.md`.

---

## 9. Known limitations

* **Category by source, not by item.** Every article from a Compute source is
  Compute. The Azure blog covers more than compute infrastructure, so some items
  on the rail are only loosely on-topic. Per-item classification is a later
  decision and is not an LLM task by default.
* **First headline wins.** The article table is insert-only, so a publisher that
  later edits a headline keeps the one first ingested. Withdrawal is available;
  correction is not.
* **Rolling window only.** A feed publishes recent items. Urdais has what the
  window held when it looked, and the retrieval records `enumeration_assessment`
  `unknown` rather than claiming completeness it cannot check. There is no
  backfill.
* **No images on production cards.** Every Compute card renders the Urdais
  fallback. See §5.
* **Identity seeding loads all stored keys** for the sources in a run. Fine at
  Phase 1A volumes; it would need a bounded query at a much larger scale.
* **Two hyperscaler feeds and one GPU cloud.** The most directly relevant
  accelerator-manufacturer feed, NVIDIA's, is refused on its terms.
* **No `/news`, no article pages, no category pages.** Out of scope by design.

---

## 10. Migrating the other five rails

Nothing structural is missing. For each category:

1. Research candidate first-party feeds; verify each endpoint actually works and
   inspect what fields it supplies.
2. Read the publisher's terms and robots rules and record the decisive clauses
   verbatim. Unsettled means excluded.
3. Add the provider (if new), the `news_feed` source interface with its evidence,
   a permission grant covering collection and content syndication, and a
   `reference.news_sources` row in one migration.
4. Add the definition to `NEWS_SOURCES` and its slug to `NEWS_SOURCE_SLUGS` — the
   `Record` over the union means a slug without a definition does not compile.
   Retain a trimmed feed fixture with its provenance.
5. Switch that rail in `src/components/home/news-sections.tsx` from
   `getMockNewsByCategory` to `loadNewsRail(<category>)`.

The pipeline itself should not need to change. If it does, the source-specific
fact belongs in a definition, not in `ingest.ts`.

A later phase should also decide: per-item relevance filtering, whether to
reference publisher thumbnails and under what policy, headline corrections, and
where recurring ingestion runs once Urdais is deployed.
