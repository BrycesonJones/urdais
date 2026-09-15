-- Memory news: the source qualification pass, and why the rail stays on mock.
--
-- Phase 2A set out to migrate the homepage Memory rail to production the way
-- Compute was migrated. It did not, because no candidate source qualified. This
-- migration records the pass so the next person does not repeat it: every
-- publisher whose feed actually works is recorded as a reviewed interface with
-- the evidence that decided it, and none of them gets a reference.news_sources
-- row, because none of them may be ingested.
--
-- Nothing here changes behaviour. No source is enabled, no category is
-- migrated, no schedule, pipeline or read path is touched. Compute is
-- untouched. The Memory rail continues to render mock content and to say so.
--
-- Four kinds of refusal came up, and they are worth keeping apart because they
-- age differently:
--
--   terms        the publisher forbids what Urdais would do. Only a change in
--                the terms, or a written permission, moves this.
--   abandoned    the feed exists and parses but the publisher stopped posting
--                to it years ago. A live feed at the same URL would move this.
--   unusable     the feed is published but omits something the pipeline
--                requires and will not invent, such as a publication time.
--   relevance    the feed is live and readable but is not Memory. A
--                memory-scoped feed from the same publisher would move this.

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('66666666-0000-4000-8000-000000000006', 'sk-hynix',        'SK hynix',          'hardware_vendor', 'https://www.skhynix.com'),
  ('66666666-0000-4000-8000-000000000007', 'samsung',         'Samsung',           'hardware_vendor', 'https://www.samsung.com'),
  ('66666666-0000-4000-8000-000000000008', 'jedec',           'JEDEC',             'other',           'https://www.jedec.org'),
  ('66666666-0000-4000-8000-000000000009', 'trendforce',      'TrendForce',        'other',           'https://www.trendforce.com'),
  ('66666666-0000-4000-8000-00000000000a', 'blocks-and-files','Blocks & Files',    'other',           'https://blocksandfiles.com'),
  ('66666666-0000-4000-8000-00000000000b', 'rambus',          'Rambus',            'hardware_vendor', 'https://www.rambus.com'),
  ('66666666-0000-4000-8000-00000000000c', 'snia',            'SNIA',              'other',           'https://www.snia.org'),
  ('66666666-0000-4000-8000-00000000000d', 'cxl-consortium',  'CXL Consortium',    'other',           'https://www.computeexpresslink.org')
on conflict (slug) do nothing;

-- Refused on terms -------------------------------------------------------------
--
-- The one candidate that was both live and squarely on topic, and the only one
-- whose refusal is a rights decision rather than a technical or editorial one.
-- Its terms are more restrictive than NVIDIA's, which this registry already
-- refuses on the collection axis alone: SK hynix additionally limits the site
-- to non-commercial use and requires prior written consent to store or display
-- its material at all. Both axes are not_permitted, so the interface is
-- production_blocked, which the registry's own constraint requires.

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-00000000000b',
  '66666666-0000-4000-8000-000000000006',
  'skhynix-newsroom-feed', 'SK hynix Newsroom feed', 'news_feed',
  'https://news.skhynix.com/feed/', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_permitted', true,
  'The strongest Memory candidate on relevance and the only one refused on rights. A pure-play memory manufacturer whose newsroom publishes working WordPress tag feeds — /tag/hbm/, /tag/dram/ and /tag/nand/ carried 20 distinct, current, on-topic articles between them on 2026-09-15 — but whose Terms of Use prohibit automated access and restrict the site to non-commercial use. The tag feeds are the same site under the same terms and are refused with it; they are not separate interfaces to be reconsidered on their own. Production use needs prior written consent from SK hynix.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "SK hynix Newsroom Terms of Use", "url": "https://news.skhynix.com/en/terms-of-use", "version_date": "07 Mar 2025", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "Use any robot, spider, or other automatic device, process, or means to access the Website for any purpose, including monitoring or copying any of the material on the Website.", "note": "Listed under Prohibited Uses. No carve-out for the RSS feeds the newsroom itself publishes. Stronger than the NVIDIA clause this registry already refuses, because it names monitoring explicitly."}, {"axis": "data_use", "text": "These Terms of Use permit you to use the Website for non-commercial use only. You must not reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store, or transmit any of the material on our Website, without the prior written consent of the Company", "note": "The only carve-outs are RAM caching incidental to viewing, browser cache, and one printed copy for personal non-commercial use. Storing headline metadata and displaying it on a commercial product is none of those."}, {"axis": "data_use", "text": "You must not access or use for any commercial purposes any part of the Website or any services or materials available through the Website.", "note": "Independent of the reproduction clause and equally decisive."}, {"axis": "both", "text": "not present", "note": "The document was searched in full for a press, media, journalism, editorial, fair-use or attribution exception. There is none."}]}, {"title": "news.skhynix.com robots.txt", "url": "https://news.skhynix.com/robots.txt", "retrieved_on": "2026-09-15", "note": "Empty; the file carries no directives. Robots is not the obstacle here, the Terms of Use are."}, {"title": "SK hynix Newsroom tag feeds", "url": "https://news.skhynix.com/tag/hbm/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml, RSS 2.0. /tag/hbm/ 300696 bytes, /tag/dram/ 231483 bytes, /tag/nand/ 248827 bytes, 10 items each, 20 distinct article URLs across the three, newest 2026-09-09, no media element. Technically usable and squarely on topic; not permitted."}], "note": "The main /feed/ additionally paginates one article across five entries with identical titles, which would have been a presentation problem had the terms allowed ingestion."}'::jsonb
);

-- Refused because the feed was abandoned ---------------------------------------

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-00000000000c',
  '66666666-0000-4000-8000-000000000007',
  'samsung-newsroom-memory-tag-feed', 'Samsung Newsroom — memory tag', 'news_feed',
  'https://news.samsung.com/global/tag/memory/feed', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'The right shape and the right scope — a memory-tagged slice of a manufacturer newsroom — and abandoned. Terms were not reviewed because the feed is not publishable regardless: a rail fed from it would show 2016 product announcements. A live feed at this URL would be worth reviewing properly.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "abandoned", "documents": [{"title": "Samsung Newsroom memory tag feed", "url": "https://news.samsung.com/global/tag/memory/feed", "retrieved_on": "2026-09-15", "note": "HTTP 200, text/xml, 28371 bytes, RSS 2.0, 5 items. Newest item Tue, 18 Jul 2017: Samsung Increases Production of Industry''s Fastest DRAM — 8GB HBM2. Remaining four are from 2016. Nine years stale."}, {"title": "Samsung Newsroom global feed", "url": "https://news.samsung.com/global/feed", "retrieved_on": "2026-09-15", "note": "HTTP 200, 493040 bytes and current, but it is all of Samsung — phones, televisions, appliances — and is not a memory source. The semiconductor business-area feed returned 1446 bytes, effectively empty."}], "note": "No memory-scoped Samsung Semiconductor feed was found; semiconductor.samsung.com publishes no feed and advertises no autodiscovery link."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-00000000000d',
  '66666666-0000-4000-8000-000000000008',
  'jedec-standards-feed', 'JEDEC standards and news feed', 'news_feed',
  'https://www.jedec.org/rss.xml', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'The memory standards body, and the most authoritative possible source for DDR and HBM specification news. The feed parses and its content is on topic, but the publisher stopped posting to it in 2020. Terms were not reviewed for the same reason as Samsung.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "abandoned", "documents": [{"title": "JEDEC RSS feed", "url": "https://www.jedec.org/rss.xml", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml, 55605 bytes, RSS 2.0, 10 items, all distinct. Newest item Tue, 14 Jul 2020: JEDEC Publishes New DDR5 Standard. Six years stale. The /feed path returns HTTP 403."}]}'::jsonb
);

-- Refused because the feed omits what the pipeline requires ---------------------

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-00000000000e',
  '66666666-0000-4000-8000-000000000009',
  'dramexchange-weekly-research-feed', 'DRAMeXchange weekly research feed', 'news_feed',
  'https://www.dramexchange.com/rss.xml', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'On topic in a way nothing else was — DRAM and NAND contract and spot pricing is the closest thing in this field to what UCPI measures for compute — and unusable as published. No item carries a publication time, and Urdais will not invent one: a rail ordered by publication date cannot be built from a feed that states no dates. Item links are also site-relative rather than absolute. Both are fixable by the publisher and neither is fixable by Urdais without fabricating data.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "unusable", "documents": [{"title": "DRAMeXchange RSS feed", "url": "https://www.dramexchange.com/rss.xml", "retrieved_on": "2026-09-15", "note": "HTTP 200, text/xml, 3888 bytes, RSS 2.0, 5 items, generator DRAMeXchange Weekly Research RSS 2.0, language zh-TW. Every item carries title, link and description. No item carries pubDate, dc:date or any other time element, and the channel pubDate and lastBuildDate elements are both empty."}, {"title": "Item link form", "url": "https://www.dramexchange.com/rss.xml", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "<link>/WeeklyResearch/Post/2/12835.html</link>", "note": "Site-relative. Resolving it against the channel link would be a generic and standard change, but the missing publication time is decisive on its own."}]}, {"title": "dramexchange.com robots.txt", "url": "https://www.dramexchange.com/robots.txt", "retrieved_on": "2026-09-15", "note": "No robots file; the path redirects to the site''s 404 handler. Terms were not reviewed because the feed is unusable regardless."}], "note": "DRAMeXchange is operated by TrendForce, which is why both interfaces hang off one provider."}'::jsonb
);

-- Refused on relevance ----------------------------------------------------------
--
-- Live, readable, and about something else. The Memory rail is DRAM, HBM, NAND,
-- DDR and the manufacturing, pricing and supply behind them. A feed that is
-- mostly enterprise storage arrays, mostly security IP, or mostly general
-- semiconductor news would make it a different rail, and admitting one of these
-- is how a category quietly stops meaning what it says.

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-00000000000f',
  '66666666-0000-4000-8000-00000000000a',
  'blocks-and-files-feed', 'Blocks & Files feed', 'news_feed',
  'https://blocksandfiles.com/feed/', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'The closest near miss, and the one worth revisiting if the publisher ever exposes a memory-scoped feed. A live trade publication covering storage and memory, with a genuine NAND, DRAM and HBM beat — but only 12 of 69 items in the retrieved window were memory stories. The rest are storage arrays, disk and filesystems. Ingesting it unfiltered would turn the Memory rail into a storage rail, and filtering it would mean adding story classification the pipeline deliberately does not have.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "Blocks & Files feed", "url": "https://blocksandfiles.com/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, text/xml, 57127 bytes, RSS 2.0, 69 items, current to the retrieval day, image enclosures on 68 of 69. 12 of 69 titles were memory-related; the remainder were storage systems, disk and software. One item was marked sponsored."}, {"title": "blocksandfiles.com robots.txt", "url": "https://blocksandfiles.com/robots.txt", "retrieved_on": "2026-09-15", "note": "Empty; no directives. Terms were not reviewed because relevance decided it first."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000010',
  '66666666-0000-4000-8000-000000000009',
  'trendforce-news-feed', 'TrendForce News feed', 'news_feed',
  'https://www.trendforce.com/news/feed/', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'Carries real memory reporting, including a recurring DRAM and NAND spot price update, inside a general semiconductor feed covering packaging, foundry, passive components and fab construction. No memory-scoped slice exists: the WordPress category and tag feed paths for memory both return 404. The retrieved window was also two and a half months behind the retrieval date.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "TrendForce News feed", "url": "https://www.trendforce.com/news/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, served as text/html but the body is RSS 2.0, 135726 bytes, 20 items, short publisher descriptions. Newest item Wed, 01 Jul 2026, against a retrieval date of 2026-09-15. Roughly one item in five was a memory story."}, {"title": "Memory-scoped feed paths", "url": "https://www.trendforce.com/news/category/memory/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 404, as did /news/topic/memory/feed/, /news/category/semiconductors/feed/ and /news/tag/dram/feed/. The site advertises only the whole-news feed by autodiscovery."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000011',
  '66666666-0000-4000-8000-00000000000b',
  'rambus-feed', 'Rambus feed', 'news_feed',
  'https://www.rambus.com/feed/', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'Rambus licenses memory interface IP, so the company is on topic; the feed is not. Every item in the retrieved window was security IP — root of trust, Caliptra, cryptographic cores — and several link to gated marketing pages rather than articles.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "Rambus feed", "url": "https://www.rambus.com/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml, 127031 bytes, RSS 2.0, 10 items, current. None was a memory story. Five items link to go.rambus.com gated asset pages carrying a #new_tab fragment."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000012',
  '66666666-0000-4000-8000-00000000000c',
  'snia-feed', 'SNIA feed', 'news_feed',
  'https://www.snia.org/rss.xml', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'A live standards-body feed whose beat is storage management and networking rather than memory. Its Compute, Memory and Storage Initiative would be the relevant slice, but that blog publishes no parseable feed.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "SNIA feed", "url": "https://www.snia.org/rss.xml", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml, 66031 bytes, RSS 2.0, 10 items, current. Subject matter is Swordfish, SAS cabling and storage management."}, {"title": "SNIA CMSI blog feed", "url": "https://sniacmsiblog.org/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200 but the body is HTML, not a feed; zero items parsed."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000013',
  '66666666-0000-4000-8000-00000000000d',
  'cxl-consortium-feed', 'CXL Consortium feed', 'news_feed',
  'https://www.computeexpresslink.org/feed', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'Memory expansion and pooling is adjacent to the Memory rail, but the feed is consortium activity — conference appearances, member spotlights, event invitations — rather than reporting on memory technology or markets.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "CXL Consortium feed", "url": "https://www.computeexpresslink.org/feed", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml, 83783 bytes, RSS 2.0, 10 items, all distinct, current to 2026-08-27. Subject matter is events and membership."}]}'::jsonb
);

-- Nothing was enabled, and nothing else moved -----------------------------------

do $$
declare
  n integer;
begin
  -- The point of the whole migration: Memory gains no ingestable source.
  select count(*) into n from reference.news_sources where category = 'memory';
  if n <> 0 then raise exception 'a Memory news source was registered; no candidate qualified'; end if;

  -- Every Memory candidate recorded here is unapproved, and carries evidence.
  select count(*) into n from reference.source_interfaces
   where id between '6f6f6f6f-0000-4000-8000-00000000000b' and '6f6f6f6f-0000-4000-8000-000000000013'
     and production_access_state = 'production_approved';
  if n <> 0 then raise exception '% Memory candidate(s) were approved', n; end if;
  select count(*) into n from reference.source_interfaces
   where id between '6f6f6f6f-0000-4000-8000-00000000000b' and '6f6f6f6f-0000-4000-8000-000000000013'
     and (terms_evidence is null
       or terms_evidence->>'reviewed_on' is null
       or terms_evidence->>'refusal_kind' is null
       or jsonb_array_length(terms_evidence->'documents') = 0);
  if n <> 0 then raise exception '% Memory candidate(s) recorded without evidence or a refusal kind', n; end if;

  -- The one refused on rights is blocked on both axes, not merely unreviewed,
  -- because its terms were read and they say no.
  if (select terms_review_state from reference.source_interfaces where slug = 'skhynix-newsroom-feed') <> 'not_permitted'
     or (select data_use_terms_state from reference.source_interfaces where slug = 'skhynix-newsroom-feed') <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where slug = 'skhynix-newsroom-feed') <> 'production_blocked'
     or (select written_agreement_required from reference.source_interfaces where slug = 'skhynix-newsroom-feed') is not true then
    raise exception 'the SK hynix refusal is not recorded as a terms refusal requiring written permission';
  end if;

  -- Compute is exactly as it was: eight enabled sources, none of them touched.
  select count(*) into n from reference.news_sources where is_enabled and category = 'compute';
  if n <> 8 then raise exception 'expected 8 enabled Compute sources, found %', n; end if;
  select count(*) into n from reference.news_sources where is_enabled;
  if n <> 8 then raise exception 'a source outside Compute was enabled, found % enabled in total', n; end if;

  -- And no article was written by a research migration.
  select count(*) into n from pipeline.news_articles;
  if n <> 0 then raise exception 'news articles were seeded'; end if;
end
$$;
