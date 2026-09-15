-- Phase 1B: four more approved Compute feeds, and image use as its own
-- recorded decision.
--
-- Two separate questions were collapsed into one in Phase 1A because the
-- answer to both was "no image". They are not the same question:
--
--   1. May Urdais display this feed's headline metadata with attribution and
--      a link back? (the existing data_use_terms_state for a news_feed)
--   2. May Urdais reference the image the feed attaches to an item, served
--      from the publisher's own host?
--
-- A feed that syndicates headlines does not thereby license every image on
-- the publisher's CDN, and permission to read a feed says nothing about
-- republishing artwork. Question 2 gets its own columns, its own evidence, and
-- its own allowlist, and the default is still no image.

alter table reference.news_sources
  add column image_policy text not null default 'none'
    constraint news_sources_image_policy_allowed check (image_policy in ('none', 'feed_media')),
  -- The exact host and path prefix pairs an image may come from, as
  -- "host/path-prefix". Narrow on purpose: two of these publishers share one
  -- CDN, so the host alone would let either one's assets in under the other's
  -- decision, and a bare host would let in anything else on that CDN too.
  add column image_hosts text[] not null default '{}'::text[],
  add column image_evidence text,
  -- coalesce, not a bare array_length: an empty array yields NULL, a CHECK that
  -- evaluates to NULL passes, and the allowlist requirement would be no
  -- requirement at all for exactly the value it exists to reject.
  add constraint news_sources_image_policy_needs_hosts
    check (image_policy <> 'feed_media'
           or (coalesce(array_length(image_hosts, 1), 0) >= 1 and image_evidence is not null)),
  add constraint news_sources_image_hosts_empty_when_none
    check (image_policy <> 'none' or array_length(image_hosts, 1) is null);

comment on column reference.news_sources.image_policy is
  'none: no image is referenced from this source, which is the default and the answer wherever reuse is not plainly straightforward. feed_media: the feed attaches an image to its items through the Media RSS or enclosure element and Urdais references that URL.';
comment on column reference.news_sources.image_hosts is
  'Permitted "host/path-prefix" pairs for this source''s images. Enforced at ingestion, not only in the renderer: a URL outside them is stored as NULL. Narrow enough to be publisher-specific even on a shared CDN.';
comment on column reference.news_sources.image_evidence is
  'Why referencing this source''s feed images is a use its own syndication interface supports. Required whenever image_policy is feed_media.';

-- Phase 1A's four sources: images decided, now that the question is asked ----
--
-- Google Cloud and CoreWeave attach images through Media RSS; Azure attaches
-- none, so there is nothing to decide for it.

update reference.news_sources set
  image_policy = 'feed_media',
  image_hosts = array['storage.googleapis.com/gweb-cloudblog-publish/'],
  image_evidence = 'The feed attaches a media:content element to items that have artwork, served from the blog''s own publishing bucket (gweb-cloudblog-publish). Media RSS exists to carry an item''s media to syndication clients, and the bucket path is the blog''s own. Verified 2026-09-14: 12 of 20 items carried one, each on that prefix, each returning HTTP 200 image/png or image/jpeg.'
where slug in ('google-cloud-infrastructure', 'google-cloud-compute');

update reference.news_sources set
  image_policy = 'feed_media',
  image_hosts = array['cdn.prod.website-files.com/62bc66d283fd9c34ffec780a/'],
  image_evidence = 'Every item carries media:content and media:thumbnail on the publisher''s Webflow asset path. The path segment is CoreWeave''s own site identifier, which is what makes this narrower than "the Webflow CDN" — Together AI publishes from the same host under a different identifier. Verified 2026-09-14: 98 distinct URLs, all on that prefix, sampled HTTP 200 image/avif.'
where slug = 'coreweave-blog';

update reference.news_sources set
  image_evidence = 'The feed attaches no image element of any kind. There is nothing to permit and nothing to reference; cards from this source render the Urdais fallback.'
where slug = 'microsoft-azure-blog';

-- Publishers ------------------------------------------------------------------
--
-- Lambda and DigitalOcean already have provider rows from the Phase 4A compute
-- terms review. A provider is a company, not an interface, so their blog feeds
-- hang off the rows that already exist.

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('66666666-0000-4000-8000-000000000004', 'cloudflare',  'Cloudflare',  'cloud_provider', 'https://www.cloudflare.com'),
  ('66666666-0000-4000-8000-000000000005', 'together-ai', 'Together AI', 'cloud_provider', 'https://www.together.ai')
on conflict (slug) do nothing;

-- Four more approved feeds ------------------------------------------------------
--
-- Two of these publishers already appear in the registry with a compute
-- interface that is NOT production-approved, and that is not a contradiction.
-- A registry row is a decision about one interface under one document. Lambda's
-- instance-types API is reached as a customer under the Cloud Terms of Service,
-- whose benchmarking clause is scoped to "the Services"; its blog is a public
-- page under the Website Terms of Use, which contain no such clause and which
-- define the "Sites" as a separate thing. DigitalOcean's sizes API is an
-- authenticated endpoint the Phase 4A review could not settle; its blog feed is
-- advertised by link rel="alternate" on a site whose robots file allows every
-- agent. Neither approval here disturbs the compute decision, and the compute
-- decision is not evidence against these.

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-000000000007',
  '44444444-0000-4000-8000-000000000002',
  'lambda-blog-feed', 'Lambda blog', 'news_feed',
  'https://lambda.ai/blog/rss.xml', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'A GPU cloud operator, and the second Phase 1B source that sells the capacity UCPI measures. Distinct from lambda-instance-types, which stays production_blocked: that interface is the customer API under the Cloud Terms of Service, this one is a public marketing feed under the Website Terms of Use. The description element carries the full HubSpot post body including an inline featured image, so Urdais stores no description and no image for this source.',
  '{"reviewed_on": "2026-09-14", "relationship_to_existing_row": "lambda-instance-types is production_blocked because the Cloud Terms of Service bar monitoring the Services for benchmarking and API access requires being a customer. Neither applies to an unauthenticated marketing feed, and the benchmarking clause is scoped to the Services rather than the Sites.", "documents": [{"title": "Lambda Website Terms of Use", "url": "https://lambda.ai/legal/terms-of-service", "version_date": "August 2025", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "These Website Terms of Use, together with any supplemental terms, notices, and policies available at lambda.ai/legal, and/or any other binding document signed between the parties (\"Terms\") govern your use of the Lambda websites, including the Lambda Chat interface (together, our \"Sites\").", "note": "The document governing the blog is the Website Terms of Use, and the Sites are defined separately from the Services. Read in full for robot, spider, scraper, crawler, data-mining and automated-access language; it contains none."}, {"axis": "data_use", "text": "access any portion of the Services for the purpose of building a similar or competitive product or service, or monitor the Services for any benchmarking or competitive purpose", "note": "Clause (iv) of the Cloud Terms of Service, scoped to the Services. Displaying a blog headline with attribution and a link is neither building a competitive product nor benchmarking the Services."}]}, {"title": "Lambda Acceptable Use Policy", "url": "https://lambda.ai/legal/terms-of-service", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "web crawling which is not restricted to a rate so as not to impair or otherwise disrupt the servers being crawled", "note": "The prohibition is on unrestricted crawling. One feed request a day is rate-restricted by construction."}]}, {"title": "lambda.ai robots.txt", "url": "https://lambda.ai/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /_hcms/preview/ Disallow: /hs/manage-preferences/ Disallow: /hs/preferences-center/ Disallow: /*?*hs_preview=* Disallow: /*?*hsCacheBuster=*", "note": "The entire file. Only HubSpot preview and preference paths; /blog/rss.xml is not disallowed."}]}, {"title": "Lambda blog feed", "url": "https://lambda.ai/blog/rss.xml", "retrieved_on": "2026-09-14", "note": "HTTP 200, text/xml; charset=UTF-8, 34299 bytes, RSS 2.0, 10 items, no media element."}], "data_use_basis": "Ordinary feed syndication. Not a written grant and not index permission."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000008',
  '66666666-0000-4000-8000-000000000005',
  'together-ai-blog-feed', 'Together AI blog', 'news_feed',
  'https://www.together.ai/blog/rss.xml', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'A GPU cloud and inference provider. The feed supplies short publisher deks and attaches media to some items on the publisher''s own Webflow asset path.',
  '{"reviewed_on": "2026-09-14", "documents": [{"title": "Together AI Terms of Service", "url": "https://www.together.ai/terms-of-service", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "You will not directly or indirectly: (a) reverse engineer, decompile, disassemble, modify, create derivative works of or otherwise create, attempt to create, or derive, or permit or assist any third party to create or derive, the source code underlying the Services", "note": "The document is a customer agreement for the inference and GPU Services, addressed to a subscriber. Read in full for robot, spider, scraper, crawler, data-mining, harvesting, automated-access and index language; it contains none, and it does not address the public website at all."}]}, {"title": "together.ai robots.txt", "url": "https://www.together.ai/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Allow: / ... User-agent: Google-Extended Disallow: /", "note": "Every agent may crawl the whole site; the one restriction is on Google-Extended, which is AI training. The publisher demonstrably knows how to express a restriction and restricted training rather than retrieval. Urdais does neither training nor inference on this content."}]}, {"title": "Together AI blog feed", "url": "https://www.together.ai/blog/rss.xml", "retrieved_on": "2026-09-14", "note": "HTTP 200, application/rss+xml; charset=utf-8, 59196 bytes, RSS 2.0, 100 items, short descriptions, media:content on 21."}], "data_use_basis": "Ordinary feed syndication. The terms do not address the public website; silence here sits beside an affirmative robots allowance and a published feed, which is a different thing from silence alone."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000009',
  '66666666-0000-4000-8000-000000000004',
  'cloudflare-workers-blog-feed', 'Cloudflare blog — Workers', 'news_feed',
  'https://blog.cloudflare.com/tag/workers/rss/', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'The tag-scoped feed for Cloudflare Workers, the company''s serverless compute platform, rather than the whole Cloudflare blog, most of which is network and security reporting and not compute. The strongest permission evidence of any Urdais news source: the robots file carries an express machine-readable content signal granting the search use, which is defined as returning hyperlinks and short excerpts.',
  '{"reviewed_on": "2026-09-14", "documents": [{"title": "blog.cloudflare.com robots.txt", "url": "https://blog.cloudflare.com/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Allow: / Disallow: /_emdash/admin Disallow: /preview/ Disallow: /fragments/", "note": "Every agent may crawl the blog; the feed path is not disallowed."}, {"axis": "data_use", "text": "Content-Signal: ai-train=yes, search=yes, ai-input=yes", "note": "An express grant. The same file defines search as \"building a search index and providing search results (e.g., returning hyperlinks and short excerpts from your website''s contents)\", which is what a news rail does. The file states the signals are the operator''s own grant or reservation of rights, so a yes is permission rather than silence."}, {"axis": "collection", "text": "As a condition of accessing this website, you agree to abide by the following content signals: (a) If a content-signal = yes, you may collect content for the corresponding use.", "note": "The publisher''s own statement that a yes signal permits collection for that use."}]}, {"title": "Cloudflare Workers blog feed", "url": "https://blog.cloudflare.com/tag/workers/rss/", "retrieved_on": "2026-09-14", "note": "HTTP 200, application/rss+xml; charset=utf-8, 304887 bytes, RSS 2.0, 20 items, short descriptions, an image enclosure on every item served from blog.cloudflare.com itself."}], "data_use_basis": "An express machine-readable content signal granting the search use, which the same document defines as returning hyperlinks and short excerpts. Stronger than ordinary feed syndication, and still not index permission."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-00000000000a',
  '44444444-0000-4000-8000-000000000004',
  'digitalocean-blog-feed', 'DigitalOcean blog', 'news_feed',
  'https://www.digitalocean.com/rss/blog.atom', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'The one Atom source in the roster, and the only Phase 1B source that exercises that parser in production. Distinct from digitalocean-sizes, which remains production_review_pending: that is an authenticated API the Phase 4A review could not settle against an ambiguous scraping clause, while this feed is advertised by link rel="alternate" on a site whose robots file allows every agent. Atom content elements carry the article body, so Urdais stores no description for this source.',
  '{"reviewed_on": "2026-09-14", "relationship_to_existing_row": "digitalocean-sizes is production_review_pending because the AUP clause on harvesting content of the Services could not be settled as applied to a documented authenticated API. This row is a public Atom feed the site itself advertises for syndication, and the AUP clause sits under Network Abuse and is qualified by impairment or disruption.", "documents": [{"title": "DigitalOcean Acceptable Use Policy", "url": "https://www.digitalocean.com/legal/acceptable-use-policy", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "Network Abuse. You may not make network connections to any users, hosts, or networks unless you have permission to communicate with them. Prohibited activities include: Monitoring or Crawling. Monitoring or crawling of a System that impairs or disrupts the System being monitored or crawled, or other harvesting or scraping of any content of the Services.", "note": "The clause sits under Network Abuse and its lead sentence is about connecting without permission. One feed request a day to an endpoint the publisher advertises for syndication neither impairs nor disrupts, and permission to communicate is what the robots file and the autodiscovery link express."}]}, {"title": "digitalocean.com robots.txt", "url": "https://www.digitalocean.com/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Allow: / Disallow: /v1/login Disallow: /auth-error Disallow: /community/login Disallow: /community/register", "note": "The entire file. Every agent may crawl everything except four authentication paths."}]}, {"title": "Blog feed autodiscovery", "url": "https://www.digitalocean.com/blog", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "<link rel=\"alternate\" type=\"application/rss+xml\" href=\"https://www.digitalocean.com/rss/blog.atom\"/>", "note": "The publisher advertises the feed to syndication clients from the blog page itself."}]}, {"title": "DigitalOcean blog feed", "url": "https://www.digitalocean.com/rss/blog.atom", "retrieved_on": "2026-09-14", "note": "HTTP 200, application/atom+xml, 1442396 bytes, Atom 1.0, 100 entries, tag: URI ids, content type=html carrying article bodies, no media element."}], "data_use_basis": "Ordinary feed syndication. Not a written grant and not index permission."}'::jsonb
);

insert into reference.permission_grants (
  id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
  covers_content_syndication, granted_on, effective_from, evidence
) values
(
  '6e6e6e6e-0000-4000-8000-000000000007', '6f6f6f6f-0000-4000-8000-000000000007', 'provider_terms',
  'Lambda Website Terms of Use and Acceptable Use Policy (lambda.ai/legal/terms-of-service, August 2025) read with lambda.ai/robots.txt, both retrieved 2026-09-14',
  true, false, true, '2026-09-14', '2026-09-14T00:00:00Z',
  'The document governing the blog is the Website Terms of Use, which contain no automated-access clause; the AUP prohibits only unrestricted crawling. The benchmarking clause that blocks the instance-types API is scoped to the Services and does not reach a public marketing feed.'
),
(
  '6e6e6e6e-0000-4000-8000-000000000008', '6f6f6f6f-0000-4000-8000-000000000008', 'provider_terms',
  'Together AI Terms of Service (together.ai/terms-of-service) read with together.ai/robots.txt, both retrieved 2026-09-14',
  true, false, true, '2026-09-14', '2026-09-14T00:00:00Z',
  'The terms are a customer agreement for the inference and GPU Services and contain no automated-access or scraping clause. The robots file allows every agent the whole site and restricts only Google-Extended, which is AI training rather than retrieval.'
),
(
  '6e6e6e6e-0000-4000-8000-000000000009', '6f6f6f6f-0000-4000-8000-000000000009', 'provider_terms',
  'blog.cloudflare.com/robots.txt content signals, retrieved 2026-09-14',
  true, false, true, '2026-09-14', '2026-09-14T00:00:00Z',
  'An express machine-readable grant. The file states that a content-signal of yes permits collection for that use, and sets search=yes, where the same file defines search as returning hyperlinks and short excerpts. Crawling of the feed path is separately allowed for every agent.'
),
(
  '6e6e6e6e-0000-4000-8000-00000000000a', '6f6f6f6f-0000-4000-8000-00000000000a', 'provider_terms',
  'DigitalOcean Acceptable Use Policy read with digitalocean.com/robots.txt and the blog''s own feed autodiscovery link, all retrieved 2026-09-14',
  true, false, true, '2026-09-14', '2026-09-14T00:00:00Z',
  'The AUP clause is an anti-abuse provision qualified by impairment or disruption. The robots file allows every agent everything but four authentication paths, and the blog advertises this feed to syndication clients by link rel="alternate".'
);

insert into reference.news_sources (
  id, source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes,
  image_policy, image_hosts, image_evidence
) values
(
  '6d6d6d6d-0000-4000-8000-000000000005', '6f6f6f6f-0000-4000-8000-000000000007',
  'lambda-blog', 'compute', 'rss', 'publisher_feed_syndication', true,
  'GPU cloud operator. The feed carries full post bodies in description and no media element.',
  'none', '{}'::text[],
  'The feed attaches no media element. The only image is an inline <img> inside the post body, which is body content rather than a syndicated enclosure, and Urdais does not take images out of article HTML.'
),
(
  '6d6d6d6d-0000-4000-8000-000000000006', '6f6f6f6f-0000-4000-8000-000000000008',
  'together-ai-blog', 'compute', 'rss', 'publisher_feed_syndication', true,
  'GPU cloud and inference provider. Short publisher deks.',
  'feed_media', array['cdn.prod.website-files.com/69654e88dce9154b5f12070c/'],
  'Items carry media:content and media:thumbnail on the publisher''s own Webflow asset path. The path segment is Together AI''s site identifier, which keeps the allowance off CoreWeave''s assets on the same CDN. Verified 2026-09-14: 20 distinct URLs, all on that prefix, sampled HTTP 200 image/jpeg.'
),
(
  '6d6d6d6d-0000-4000-8000-000000000007', '6f6f6f6f-0000-4000-8000-000000000009',
  'cloudflare-workers-blog', 'compute', 'rss', 'publisher_feed_syndication', true,
  'Serverless compute platform, scoped by tag so the rail gets Workers rather than the whole Cloudflare blog.',
  'feed_media', array['blog.cloudflare.com/_emdash/api/media/file/'],
  'Every item carries an enclosure of type image/png served from the blog''s own host, so the publisher keeps its own logs, cache control and the ability to stop serving it. The robots content signal that grants the search use covers returning short excerpts of the blog''s contents. Verified 2026-09-14: 20 distinct URLs, all on that prefix, sampled HTTP 200 image/png.'
),
(
  '6d6d6d6d-0000-4000-8000-000000000008', '6f6f6f6f-0000-4000-8000-00000000000a',
  'digitalocean-blog', 'compute', 'atom', 'publisher_feed_syndication', true,
  'Cloud provider, and the roster''s one Atom feed. Content elements carry article bodies, so no description is stored.',
  'none', '{}'::text[],
  'Atom entries carry no media or enclosure element. There is nothing to reference.'
);

do $$
declare
  n integer;
begin
  select count(*) into n from reference.news_sources where is_enabled and category = 'compute';
  if n <> 8 then raise exception 'expected 8 enabled Compute news sources, found %', n; end if;
  select count(*) into n from reference.news_sources where category <> 'compute';
  if n <> 0 then raise exception 'Phase 1B finishes Compute and starts no other category; found % source(s) elsewhere', n; end if;
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and si.production_access_state <> 'production_approved';
  if n <> 0 then raise exception '% enabled news source(s) are not production-approved', n; end if;
  select count(*) into n from reference.permission_grants g
    join reference.source_interfaces si on si.id = g.source_interface_id
   where si.source_class = 'news_feed' and g.covers_index_use;
  if n <> 0 then raise exception 'a news grant claims index permission it was never given'; end if;
  -- The two compute interfaces that stay unapproved are untouched by this migration.
  select count(*) into n from reference.source_interfaces
   where slug in ('lambda-instance-types', 'digitalocean-sizes') and production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a compute price interface was approved by the news migration'; end if;
  select count(*) into n from reference.source_interfaces
   where slug in ('nvidia-newsroom-feed', 'aws-news-blog-feed') and production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a refused news feed was approved'; end if;
  select count(*) into n from reference.news_sources
   where image_policy = 'feed_media' and array_length(image_hosts, 1) is null;
  if n <> 0 then raise exception 'an image policy was enabled with no host allowlist'; end if;
end
$$;
