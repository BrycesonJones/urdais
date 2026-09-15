# News ingestion

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 14 September 2026 when the homepage Compute rail stopped reading mock data (Phase 1A); rewritten 15 September 2026 when Compute was finished (Phase 1B).

The homepage Compute rail reads production data from eight approved publisher
feeds, refreshed every four hours. This document records how, from which
sources, under what reading of their terms, and what is deliberately not built.

Phase 1B completes Compute for V1. There is no `/news` page, no news navigation
item, no article page, and no public news API; the only reader is the homepage.

---

## 1. Scope

| Rail | State |
| --- | --- |
| Compute | **production** — eight approved feeds, seven publishers, thumbnails where permitted |
| Memory | mock |
| Photonics | mock |
| Energy / Power | mock |
| AI Chips | mock |
| Crypto | mock |

The six categories, their order, and the rail and card components are unchanged
from the original landing page. Mock rails carry a `Demo content` badge; the
Compute rail carries `Live`.

### What each phase did

**Phase 1A** built the pipeline and proved it on four feeds: schema, source
qualification, permission gating, normalization, deterministic deduplication,
the homepage read path, and fail-closed behaviour.

**Phase 1B** finished the category: four more publishers, feed-supplied
thumbnails under their own rights decision, a presentation rule so no publisher
owns the rail, and scheduled ingestion every four hours under a policy the
remaining five categories will inherit.

---

## 2. Architecture

```text
reference.news_sources          which approved feed serves which category,
                                and whether its images may be referenced
        │
reference.source_interfaces     the endpoint, the two-axis terms review, approval
reference.permission_grants     the basis a production retrieval is made under
        │
pipeline.source_retrievals      one fetch, body and hash retained as evidence
        │
pipeline.news_articles          normalized metadata. Never a body.
        │
loadComputeNews()               newest first, ranked per source, diversified
        │
NewsSections → NewsRail → NewsCard
```

Nothing in this path is news-specific except the two tables. The registry, the
permission gate, the append-only retrieval table and the Postgres pool are the
ones the UCPI and token-price pipelines already use.

### Files

| Concern | File |
| --- | --- |
| Approved sources, image allowlists | `src/lib/news/sources.ts` |
| Feed reading (RSS, Atom) | `src/lib/news/feed.ts` |
| Urdais normalization rules | `src/lib/news/normalize.ts` |
| Pipeline | `src/lib/news/ingest.ts` |
| One production run, shared by both callers | `src/lib/news/run.ts` |
| Refresh policy and cron expression | `src/lib/news/schedule.ts` |
| Write surface | `src/lib/news/store.ts`, `src/lib/news/sql.ts` |
| Homepage accessor | `src/lib/news/read/load.ts` |
| Visible-source diversity | `src/lib/news/read/diversity.ts` |
| Backend record → `NewsArticle` | `src/lib/news/read/read-model.ts` |
| Retained feed artifacts | `src/lib/news/fixtures/` |
| Scheduled invocation | `src/app/api/cron/news/route.ts`, `vercel.json` |
| Operator invocation | `scripts/news/ingest.ts` (`npm run news:ingest`) |
| Schema | `supabase/migrations/20260914070000_*.sql`, `20260915010000_*.sql` |

---

## 3. Database model

### `reference.news_sources`

One row per approved feed: `category`, `feed_mechanism`, `syndication_basis`,
`is_enabled`, `image_policy`, `image_hosts`, `image_evidence`, and a pointer to
the source interface holding its endpoint and rights state. A trigger refuses a
row pointing at a non-news interface, and refuses to enable one whose interface
is not `production_approved`.

`image_policy` defaults to `none`. Setting it to `feed_media` requires at least
one `image_hosts` entry and an `image_evidence` note; setting it to `none`
forbids an allowlist. Both are CHECK constraints, and the first uses
`coalesce(array_length(...), 0)` because an empty array yields NULL and a CHECK
that evaluates to NULL passes — which would have made the requirement no
requirement at all for exactly the value it exists to reject.

### `pipeline.news_articles`

`source_interface_id`, `retrieval_id`, `category`, `canonical_url`, `url_key`,
`source_guid`, `article_key`, `title`, `summary`, `image_url`, `published_at`,
`ingested_at`, `withdrawn_at`, `withdrawal_reason`, `created_at`.

There is **no column an article body could be written to**. `summary` is capped
at 500 characters and `title` at 400, by constraint.

Insert-only. A trigger rejects every delete and every update except one: setting
`withdrawn_at` and `withdrawal_reason` together on a row not already withdrawn.
`service_role` holds no `DELETE` privilege.

### Changes in Phase 1B

* `reference.news_sources` gains the three image columns above.
* Two providers added (Cloudflare, Together AI); Lambda and DigitalOcean reuse
  the provider rows from the Phase 4A compute review.
* Four `news_feed` source interfaces, four permission grants, four source rows.
* No change to `pipeline.news_articles`, to the retrieval gate, or to any
  invariant Phase 1A established.

---

## 4. Source qualification

A source is ingested only when all of the following hold.

1. The publisher offers a machine-readable feed or an official API. A page that
   can technically be scraped is not a source, and a 403 to a non-browser agent
   is an answer, not an obstacle to route around.
2. Automated retrieval of that endpoint is permitted by the publisher's own
   terms read together with its robots rules.
3. Displaying the feed's headline metadata with attribution and a link back is
   permitted, or is the plain purpose of the feed.
4. Both terms axes are `permitted`, the interface is `production_approved`, and
   a permission grant records the basis with the decisive clauses verbatim.

Where the answer is unsettled the source is recorded as reviewed and **not**
ingested. Four are.

`syndication_basis` is `publisher_feed_syndication` for all eight. That is a
reasonable operational interpretation of ordinary feed syndication — the
publisher packages headline, link, timestamp and description precisely so third
parties can display them and link back — and it is **not** a written grant, not
legal advice, and not index permission. Cloudflare is the one source with
something stronger, recorded in its evidence rather than as a different basis.

### Approved — eight feeds, seven publishers

All verified live on 14 September 2026 and their responses hashed.

| Publisher | Endpoint | Mechanism | Description | Image |
| --- | --- | --- | --- | --- |
| Google Cloud — Infrastructure | `cloudblog.withgoogle.com/products/infrastructure/rss/` | RSS | none (body) | `media:content` |
| Google Cloud — Compute | `cloudblog.withgoogle.com/products/compute/rss/` | RSS | none (body) | `media:content` |
| Microsoft Azure | `azure.microsoft.com/en-us/blog/feed/` | RSS | publisher dek | none offered |
| CoreWeave | `www.coreweave.com/blog/rss.xml` | RSS | publisher dek | `media:content` |
| Lambda | `lambda.ai/blog/rss.xml` | RSS | none (body) | none taken |
| Together AI | `www.together.ai/blog/rss.xml` | RSS | publisher dek | `media:content` |
| Cloudflare — Workers | `blog.cloudflare.com/tag/workers/rss/` | RSS | publisher dek | `enclosure` |
| DigitalOcean | `www.digitalocean.com/rss/blog.atom` | Atom | none (body) | none offered |

**Google Cloud (both feeds).** Google's Terms of Service prohibit "using
automated means to access content from any of our services in violation of the
machine-readable instructions on our web pages (for example, robots.txt files
that disallow crawling…)" — conditioning automated access on robots rather than
prohibiting it. `cloudblog.withgoogle.com/robots.txt` is two lines,
`User-agent: *` / `Disallow: /search/`. Items link to `cloud.google.com`.

**Microsoft Azure.** The Microsoft Terms of Use state "You may not obtain or
attempt to obtain any materials or information through any means not
intentionally made available through the Services." A published RSS feed is
intentionally made available — the same clause and reading the Phase 4A review
recorded for the Azure Retail Prices API. The scraping prohibition in the same
document is scoped to "the AI services".

**CoreWeave.** The Terms of Service (30 June 2022) are a customer contract
entered on account creation; Urdais holds no account. Read in full for
automated-access, robot, spider, scraper, crawler, data-mining, harvesting,
index and benchmark language; it contains none. Robots disallows
`/blog-categories/` and `/event/` only.

**Lambda.** Approved on its blog feed while `lambda-instance-types` stays
`production_blocked`, and that is not a contradiction. A registry row is a
decision about one interface under one document. The API is reached as a
customer under the Cloud Terms of Service, whose clause (iv) bars monitoring
"the Services" for benchmarking. The blog is a public page under the Website
Terms of Use, which define the "Sites" separately and contain no
automated-access clause. The Acceptable Use Policy prohibits only "web crawling
which is not restricted to a rate"; one request every four hours is
rate-restricted by construction. Robots disallows only HubSpot preview paths.

**Together AI.** The Terms of Service are a customer agreement for the inference
and GPU Services and do not address the public website at all; read in full,
they contain no automated-access or scraping clause. `robots.txt` allows every
agent the whole site and restricts only `Google-Extended`, which is AI training.
Silence here sits beside an affirmative robots allowance, a published feed and a
demonstrated ability to express a restriction — which is a different thing from
silence alone.

**Cloudflare — Workers.** The strongest evidence in the roster.
`blog.cloudflare.com/robots.txt` allows every agent and carries
`Content-Signal: ai-train=yes, search=yes, ai-input=yes`, above a preamble
stating "If a content-signal = yes, you may collect content for the
corresponding use" and defining search as "building a search index and providing
search results (e.g., returning hyperlinks and short excerpts from your
website's contents)". That is an express machine-readable grant for what a news
rail does. The feed is tag-scoped to Workers so the rail gets the serverless
compute platform rather than the whole Cloudflare blog, most of which is network
and security reporting.

**DigitalOcean.** Approved on its blog feed while `digitalocean-sizes` stays
`production_review_pending`, for the same interface-level reason as Lambda. The
AUP clause the Phase 4A review could not settle — "Monitoring or crawling of a
System that impairs or disrupts the System being monitored or crawled, or other
harvesting or scraping of any content of the Services" — sits under a **Network
Abuse** heading whose lead sentence is about connecting without permission, and
is qualified by impairment or disruption. Six requests a day to an endpoint the
blog advertises by `link rel="alternate"`, on a site whose robots allows every
agent everything but four authentication paths, is neither.

### Reviewed and refused

| Source | Endpoint | Why not |
| --- | --- | --- |
| NVIDIA Newsroom | `nvidianews.nvidia.com/releases.xml` | The NVIDIA Terms of Service linked from the newsroom footer bar "any robot, spider, scraper, crawler, data mining tool… to access, acquire, copy or monitor any portion of the Site", with no carve-out for the feed the newsroom publishes. Recorded `under_review` in Phase 1A; re-checked 2026-09-15 and nothing in the terms has changed, so the refusal stands. |
| AWS News Blog | `aws.amazon.com/blogs/aws/feed/` | The AWS Site Terms exclude "any use of data mining, robots, or similar data gathering and extraction tools" from the Site licence, and a blog feed has none of the separate programmatic documentation the Price List Bulk API review relied on. robots.txt is **not** the obstacle: the blanket `Disallow: /blogs/` belongs to the `AdsBot-Google` group. Refusal stands. |

Both are recorded in `reference.source_interfaces` with their evidence and in
`NEWS_SOURCES_REVIEWED_NOT_APPROVED`, so the refusal travels with the code.

### Researched, no usable interface

No approved feed exists for these, so no terms question arose. Listed so the
next person does not repeat the search.

| Publisher | Finding (2026-09-14) |
| --- | --- |
| AMD | No RSS or Atom endpoint found on the newsroom; no autodiscovery link. |
| Intel | `newsroom.intel.com/feed` and `/rss.xml` both return HTML, not a feed. |
| Oracle / OCI | `blogs.oracle.com/cloud-infrastructure/rss` returns 403 to a non-browser agent. Not routed around. |
| Vultr | `www.vultr.com/blog/rss/` returns 403; no other endpoint found. |
| IBM Cloud | The legacy blog feed path returns HTML. |
| Crusoe | No feed endpoint or autodiscovery link found. |
| Nebius | No feed endpoint or autodiscovery link found. |

---

## 5. Normalization rules

**Canonical URL.** Must parse and must be `https`. Scheme and host lowercased,
fragment dropped, campaign parameters removed by an exact list plus the `utm_`,
`hsa_`, `pk_`, `mtm_` and `piwik_` prefixes. An unrecognised parameter is left
alone, because removing one that selects content would send readers elsewhere.

**Host rewrite.** The CoreWeave feed emits links on `wf.coreweave.com`; four
article pages fetched on 2026-09-14 each declared `rel="canonical"` on
`www.coreweave.com` with the path unchanged. Recorded on the source definition;
never inferred at parse time; applies to that host only.

**`url_key`.** The canonical URL reduced further for identity: query parameters
ordered, trailing slash on a non-root path dropped. Unique across every source.

**Title.** Markup removed, entities resolved, whitespace collapsed, bounded at
400 characters on a word boundary. An entry whose title normalizes to nothing is
rejected — see the Together AI limitation in §10.

**Summary.** Under `source_description`: markup removed, the WordPress "The post
… appeared first on …" trailer removed, bounded at 500 characters. Under
`omit_feed_carries_body`: `null`. Empty is `null`, never an empty string. Urdais
generates no description, ever.

**Timestamp.** RFC 822 (`pubDate`) and ISO 8601 (Atom `published`/`updated`)
both resolve to one UTC instant. Before 2000-01-01, or more than 48 hours after
the retrieval, is rejected as implausible.

**Image.** See §6.

---

## 6. Image policy

Thumbnail rights are a **separate decision from headline rights** and are
recorded separately. Permission to read a feed is not permission to republish
artwork, and a feed that syndicates headlines does not license everything on the
publisher's CDN.

### What is taken

Only `media:content`, `media:thumbnail`, or an `enclosure` whose type begins
`image/` — elements the feed itself attaches to an item for syndication. Never
`og:image`, never an `<img>` inside an article body, never anything obtained by
fetching an article page. Lambda is the clear case: its feed carries a featured
image, but only inside the post body, so Urdais takes nothing.

### The allowlist, and where it is enforced

Each source names the exact `host` + `path prefix` pairs its images may come
from. **Enforcement is at ingestion**, in `normalizeImageUrl`: a URL outside the
allowlist is stored as `NULL` and reported as `ENTRY_IMAGE_HOST_NOT_PERMITTED`.
A rights decision belongs where the data enters, not only where it renders, and
a publisher moving its CDN should look like a diagnostic rather than like a feed
that quietly stopped having artwork.

The path matters as much as the host. CoreWeave and Together AI serve from the
same Webflow CDN under different site identifiers; a host-only rule would admit
each other's assets and every other site on that CDN.

| Source | Field | Permitted origin |
| --- | --- | --- |
| Google Cloud (both) | `media:content` | `storage.googleapis.com/gweb-cloudblog-publish/` |
| CoreWeave | `media:content` | `cdn.prod.website-files.com/62bc66d283fd9c34ffec780a/` |
| Together AI | `media:content` | `cdn.prod.website-files.com/69654e88dce9154b5f12070c/` |
| Cloudflare | `enclosure` (`image/png`) | `blog.cloudflare.com/_emdash/api/media/file/` |
| Microsoft Azure, Lambda, DigitalOcean | — | none; feed offers none, or none that is a syndicated enclosure |

### Referenced, not rehosted

`NewsThumbnail` renders remote images `unoptimized`. Routing them through the
Next image optimizer would mean Urdais fetching and caching publisher artwork;
rendering directly leaves the bytes with the publisher, along with their logs,
their cache headers and their ability to stop serving them. Urdais stores a URL
and never an image byte, in the database or anywhere else.

`next.config.ts` mirrors the same allowlist, pinned to path as well as host, for
anything that does reach the optimizer and so the permitted origins are visible
in the build configuration. It is a mirror; the ingestion allowlist is the gate.

### Fallback

```text
permitted thumbnail        → the publisher's image
no thumbnail offered       → the Urdais fallback
image fails to load        → the Urdais fallback (onError)
policy is none             → the Urdais fallback
host outside the allowlist → the Urdais fallback, plus a diagnostic
```

No broken-image slot ever reaches the rail.

---

## 7. Deduplication and idempotency

Identity is deterministic. `article_key` is the publisher's stable GUID where
the feed gives one, the `url_key` otherwise. Headline similarity is never an
identity signal.

Three layers, in order of authority:

1. **Database.** `unique (source_interface_id, article_key)` and a global
   `unique (url_key)`. Correctness does not depend on application code.
2. **Within a run.** A story two feeds both carry, or one a feed repeats, is
   offered once. The two Google Cloud feeds overlap and the first to carry a
   story owns it.
3. **Reported honestly.** A run seeds itself with the identity already stored,
   so the counts it prints are what it wrote.

Verified 2026-09-14 against a local database: first live run over all eight
feeds inserted 359 articles in 5.4 s; the second inserted 0; the authenticated
cron route then inserted 0 again.

---

## 8. Read path

`loadComputeNews()` in `src/lib/news/read/load.ts`. One bounded query, filtered
to rows that are not withdrawn and whose source is still enabled and still
`production_approved`, so an article whose source loses approval stops
publishing without anything having to delete it.

The query ranks **per source** before ranking across sources
(`ROW_NUMBER() OVER (PARTITION BY source_interface_id ORDER BY published_at DESC, id)`,
capped at 12 per source and 96 overall). That is not cosmetic: one approved feed
stamps all 100 of its items with a single publication minute, and a flat
newest-first window is filled by that publisher alone, leaving the presentation
rule below nothing to work with.

Rows become `NewsArticle` objects in `read-model.ts`; no url key, article key,
GUID, retrieval or terms state crosses that boundary.

### Visible-source diversity

`diversifyBySource` in `src/lib/news/read/diversity.ts`.

> Walking the candidate list newest-first, never place a third consecutive card
> from the same publisher. When only one publisher has anything left, its cards
> are placed anyway.

Properties, all tested: deterministic; presentation-only; stored order,
timestamps and rows are never modified; each publisher's own stories keep their
published order; no publisher is hidden; no card is dropped; the rail is filled
rather than shortened when the rule cannot be satisfied.

The maximum run is 2 (`MAX_CONSECUTIVE_PER_SOURCE`). Chronology is preserved
except where breaking a run requires promoting a slightly older story from
another publisher, which is the entire point.

### Failure behaviour

`{ articles: [], available: false }` when the store cannot be read at all;
`{ articles: [], available: true }` when it can be read and holds nothing. The
rail says "Compute news is unavailable right now." or "No Compute stories have
been ingested yet." Mock content never appears in either case. A single
unreadable row is skipped rather than emptying the rail.

There is no API route for reading news, and no `/news` page.

---

## 9. Scheduled ingestion

### The policy

`src/lib/news/schedule.ts` holds one constant for all of Urdais news:

```ts
NEWS_REFRESH_INTERVAL_HOURS = 4
NEWS_REFRESH_CRON = "0 */4 * * *"   // 00, 04, 08, 12, 16, 20 UTC
NEWS_REFRESH_PATH = "/api/cron/news"
```

**This is a news policy, not a Compute one.** One cron entry, one route, one
cadence. Compute is the only production-backed category today, so today the run
ingests Compute — a fact about the registry, not about the schedule. When a
later phase approves a Memory feed, that feed joins this run by existing.
A test asserts there is exactly one cron entry and that the schedule module
names no category.

Four hours suits what these sources are: a publisher newsroom produces a handful
of items a day, so polling more often costs the publisher requests and gains
Urdais nothing, while polling less often leaves a rail stale for most of a day.

> **Deployment constraint.** Vercel's Hobby plan runs cron jobs **once per day**
> and *"expressions that run more frequently will fail deployment"*. `0 */4 * * *`
> therefore requires a Pro team. If the Urdais Vercel project is on Hobby, the
> deploy will reject `vercel.json` until the plan is upgraded or
> `NEWS_REFRESH_CRON` and the `vercel.json` entry are changed together.

### The route

`GET /api/cron/news`, `maxDuration = 60`, `dynamic = "force-dynamic"`.

It **takes no input**: not a mode, not a source, not an endpoint. Sources come
from the registry and the mode is production, hard-coded. There is no request
that could widen what it retrieves or make it publish research data; a test
sends `?mode=research&source=nvidia-newsroom` and asserts the runner is called
with the executor and nothing else.

Both the route and `npm run news:ingest -- --mode production --live --write` call
`runProductionNewsIngestion` in `src/lib/news/run.ts`. Neither reimplements the
pipeline, so the scheduled path and the operator path cannot drift.

### Authentication

Vercel sends the project's `CRON_SECRET` as `Authorization: Bearer <secret>`.
The route compares with `timingSafeEqual` after a length check (the function
throws on mismatched lengths, which would itself leak the length).

* No secret configured → every request refused. An unconfigured deployment has
  no ingestion trigger rather than a public one.
* No `Bearer` prefix, wrong value, or a secret in the query string → 401.
* Verified locally: 401 for no credential, 401 for a wrong one, 401 for
  `?secret=…`, 200 for the correct header.

The secret is never logged, never echoed in a response body, and is not in git.
`DATABASE_URL` is named in an error but never quoted.

### Concurrency

A full eight-source run takes about 5 seconds against a live network; the
interval is four hours; `maxDuration` is 60 seconds. Overlap is not credible, so
there is no lock, and no Redis or other infrastructure service was introduced
for one. The real protection is that the run is idempotent: Vercel's own
documentation says cron delivery "can also occasionally invoke the same
scheduled run more than once", and a duplicate invocation writes nothing because
the database holds the unique indexes. A missed run is caught by the next one,
since each run reads the feed's current window rather than a delta.

### Reporting

One structured JSON line per run: start, end, duration, sources attempted /
succeeded / failed, retrievals and articles inserted, and per source the entries
parsed, inserted, already stored and rejected, with a named diagnostic behind
every rejection. No secret, no connection string, no article body.

One failed source does not stop the others — it is recorded as a failed outcome
and the run continues. A run in which **every** source failed returns 500; the
operator command exits non-zero in the same case.

---

## 10. Known limitations

* **Category by source, not by item.** Every article from a Compute source is
  Compute. Tag-scoping the Cloudflare feed narrowed this, but the Azure and
  DigitalOcean feeds are whole-blog and some items are only loosely compute.
  Per-item classification is a later decision and is not an LLM task by default.
* **Together AI publishes 20 of its 100 items with an empty `<title>`.** Those
  entries are skipped with `ENTRY_NO_TITLE` rather than having a headline
  invented from the URL slug. That is the correct behaviour and it is also a
  fifth of that feed.
* **Phase 1A articles have no thumbnail and will not get one.** They were
  ingested while every source's image policy was `none`, and the article table
  is insert-only: a thumbnail is not a reason to rewrite a stored record, and
  adding an enrichment path would weaken the invariant that makes repeated
  ingestion safe. Those rows age out of the rail as newer stories arrive. A
  database test asserts that such an update is refused.
* **First headline wins.** A publisher that later edits a headline keeps the one
  first ingested. Withdrawal is available; correction is not.
* **Rolling window only.** A feed publishes recent items; the retrieval records
  `enumeration_assessment` `unknown` rather than claiming completeness. No
  backfill.
* **Identity seeding loads all stored keys** for the sources in a run — 359 rows
  today. It would need a bounded query at a much larger scale.
* **CoreWeave and DigitalOcean each publish 100-item feeds**, so they dominate
  the stored corpus. The per-source query cap and the diversity rule keep that
  out of the rail, but the row counts are lopsided.
* **The cadence needs a Vercel Pro team.** See §9.

---

## 11. Migrating the remaining five categories

Nothing structural is missing, and the scheduler does not change.

1. Research candidate first-party feeds; verify each endpoint works and inspect
   what fields it supplies.
2. Read the publisher's terms and robots rules; record the decisive clauses
   verbatim. Unsettled means excluded.
3. Decide the image question separately from the headline question.
4. One migration: the provider (if new), the `news_feed` source interface with
   evidence, a permission grant covering collection and content syndication, and
   a `reference.news_sources` row with its category and image policy.
5. Add the definition to `NEWS_SOURCES` and its slug to `NEWS_SOURCE_SLUGS` —
   the `Record` over the union means a slug without a definition does not
   compile. Retain a trimmed fixture with its provenance.
6. Switch that rail in `src/components/home/news-sections.tsx` from
   `getMockNewsByCategory` to `loadNewsRail(<category>)`.
7. If the source references images, add its host and path prefix to
   `next.config.ts` as well.

The scheduled run picks the new sources up automatically, because it iterates
the registry rather than a category list. The pipeline itself should not need to
change; if it does, the source-specific fact belongs in a definition rather than
in `ingest.ts`.
