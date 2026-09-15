-- Energy / Power becomes the second production news category.
--
-- Four approved feeds across three publishers, and the candidates that were
-- researched and refused. The schema is Compute's; nothing structural is added
-- beyond one new syndication basis, because two of the approved sources are
-- United States federal publications whose reuse terms are materially stronger
-- than the feed-syndication reading everything else rests on, and recording
-- them as ordinary syndication would understate what they actually grant.

alter table reference.news_sources
  drop constraint news_sources_basis_allowed,
  add constraint news_sources_basis_allowed check (syndication_basis in (
    'publisher_feed_syndication',
    'official_api_terms',
    'written_permission',
    'public_domain'
  ));

comment on column reference.news_sources.syndication_basis is
  'publisher_feed_syndication: the publisher offers a machine-readable feed of headline metadata and neither its terms nor its robots rules restrict reading it. This is a reasonable operational interpretation of ordinary feed syndication, not a written grant. public_domain: the publisher states its material is not subject to copyright and may be freely used and distributed, typically a United States federal agency, usually with a request for acknowledgement that Urdais satisfies by attributing every card to its publisher. official_api_terms: an API whose own terms address the use. written_permission: a grant addressed to Urdais.';

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('66666666-0000-4000-8000-00000000000e', 'us-doe',          'U.S. Department of Energy',        'other', 'https://www.energy.gov'),
  ('66666666-0000-4000-8000-00000000000f', 'pjm',             'PJM Interconnection',              'other', 'https://www.pjm.com'),
  ('66666666-0000-4000-8000-000000000010', 'power-magazine',  'POWER Magazine',                   'other', 'https://www.powermag.com'),
  ('66666666-0000-4000-8000-000000000011', 'us-eia',          'U.S. Energy Information Administration', 'other', 'https://www.eia.gov'),
  ('66666666-0000-4000-8000-000000000012', 'utility-dive',    'Utility Dive',                     'other', 'https://www.utilitydive.com'),
  ('66666666-0000-4000-8000-000000000013', 'canary-media',    'Canary Media',                     'other', 'https://www.canarymedia.com'),
  ('66666666-0000-4000-8000-000000000014', 'iso-new-england', 'ISO New England',                  'other', 'https://www.iso-ne.com'),
  ('66666666-0000-4000-8000-000000000015', 'datacenterdynamics', 'Data Center Dynamics',          'other', 'https://www.datacenterdynamics.com')
on conflict (slug) do nothing;

-- Approved ----------------------------------------------------------------------

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-000000000014',
  '66666666-0000-4000-8000-00000000000e',
  'doe-newsroom-feed', 'U.S. Department of Energy newsroom', 'news_feed',
  'https://www.energy.gov/newsroom/rss.xml', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'A United States federal agency publication whose material is in the public domain. The strongest data-use basis in the registry, alongside EIA''s. Descriptions are short plain-text summaries and are stored. No media element, and the reuse notice separately warns that some images on DOE sites are licensed from third parties, so no image is referenced from this source on either ground.',
  '{"reviewed_on": "2026-09-15", "documents": [{"title": "DOE Web Policies — Copyright, Restrictions and Permissions Notice", "url": "https://www.energy.gov/about-us/web-policies", "retrieved_on": "2026-09-15", "clauses": [{"axis": "data_use", "text": "Government information at DOE websites is in the public domain. Public domain information may be freely distributed and copied, but it is requested that in any subsequent use the Department of Energy be given appropriate acknowledgement.", "note": "An express grant to distribute and copy. The acknowledgement request is satisfied by attributing every card to its publisher by name, which the card already does."}, {"axis": "images", "text": "When using DOE websites, you may encounter documents, illustrations, photographs or other information resources contributed or licensed by private individuals, companies or organizations ... reproduction of protected items beyond that allowed by fair use as defined in the copyright laws requires the written permission of the copyright owners.", "note": "The public-domain grant does not extend to every image on the site, which is why this source references none. The feed supplies no media element in any case."}]}, {"title": "energy.gov/newsroom/rss.xml", "url": "https://www.energy.gov/newsroom/rss.xml", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=utf-8, 7274 bytes, RSS 2.0, 10 items, current to the retrieval day. Plain-text descriptions around 180 characters. No media element. The site-wide energy.gov/rss.xml is a different and abandoned feed whose newest item is from 2020; this newsroom feed is the live one."}], "data_use_basis": "Public domain, with acknowledgement requested and given."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000015',
  '66666666-0000-4000-8000-00000000000f',
  'pjm-inside-lines-feed', 'PJM Inside Lines', 'news_feed',
  'https://insidelines.pjm.com/feed/', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'The grid operator for the largest wholesale electricity market in North America, and the most directly relevant source in the roster: its recent window includes proposed reliability standards for large load disconnection, which is data-center interconnection. PJM lists RSS feeds as a published feature of its own site. The description element carries the post body with an inline image, so no description and no image is stored.',
  '{"reviewed_on": "2026-09-15", "documents": [{"title": "PJM Legal & Privacy", "url": "https://www.pjm.com/about-pjm/legal.aspx", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "not addressed", "note": "The page was read in full. It is a disclaimer, a trademark notice and a privacy notice. There is no automated-access, robot, spider, scraper, crawler, data-mining, harvesting, commercial-use or redistribution clause of any kind."}, {"axis": "data_use", "text": "PJM is a registered trademark of PJM Interconnection, L.L.C. Thus, use of PJM Trademarks and Logos by third parties is not generally permitted except through express written PJM authorization.", "note": "A trademark restriction, not a content one. Urdais attributes the story to PJM by name, which is nominative use identifying the source; it reproduces no PJM logo or mark."}]}, {"title": "PJM published RSS feeds", "url": "https://www.pjm.com/about-pjm/legal.aspx", "retrieved_on": "2026-09-15", "note": "PJM''s own site navigation lists RSS Feeds, RSS Feeds - Committees, RSS Feeds - Stakeholder Meetings, RSS Feeds - Subcommittees, RSS Feeds - Task Forces and RSS Feeds - User Groups as published features, which is the operator offering syndication rather than merely tolerating it."}, {"title": "insidelines.pjm.com robots.txt", "url": "https://insidelines.pjm.com/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /wp-admin/ Allow: /wp-admin/admin-ajax.php", "note": "The entire user-agent block. The feed is not disallowed."}]}, {"title": "PJM Inside Lines feed", "url": "https://insidelines.pjm.com/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=UTF-8, 49930 bytes, RSS 2.0, 10 items, current. Stable ?p= GUIDs distinct from the canonical link. Descriptions carry the post body with an inline img; no media or enclosure element."}], "data_use_basis": "Ordinary feed syndication, from an operator that publishes feeds as a site feature. Not a written grant and not index permission."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000016',
  '66666666-0000-4000-8000-000000000010',
  'power-magazine-feed', 'POWER Magazine', 'news_feed',
  'https://www.powermag.com/feed/', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'A power-generation and grid trade publication. Its robots file restricts AI training agents by name and permits everything else, which is the Together AI shape already accepted for Compute: the publisher demonstrably knows how to express a restriction and restricted training rather than retrieval. No terms-of-use document governing content reuse exists on the site; the only legal page is a subscriber privacy policy. Descriptions carry the article body, so none is stored.',
  '{"reviewed_on": "2026-09-15", "documents": [{"title": "powermag.com robots.txt", "url": "https://www.powermag.com/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /cgi-bin/ Disallow: /wp-admin/ Disallow: /wp-includes/", "note": "The catch-all group permits everything else, including the feed paths."}, {"axis": "collection", "text": "User-agent: GPTBot Disallow: / ... User-agent: Google-Extended Disallow: /", "note": "The publisher restricts AI training crawlers by name and does not restrict ordinary retrieval. Urdais neither trains nor performs inference on this content."}]}, {"title": "POWER Magazine privacy policy and terms", "url": "https://www.powermag.com/privacy-policy-terms-conditions/", "retrieved_on": "2026-09-15", "clauses": [{"axis": "both", "text": "not addressed", "note": "Read in full. The document is a subscriber privacy policy covering email, registration and advertising data. It contains no automated-access, scraping, crawling, data-mining, commercial-use or redistribution clause. /terms/ returns HTTP 404; no separate content terms-of-use exists."}]}, {"title": "POWER Magazine feed", "url": "https://www.powermag.com/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=UTF-8, 31082 bytes, RSS 2.0, 10 items, current. Stable ?p= GUIDs. Descriptions carry the article body with inline images; no media or enclosure element."}], "data_use_basis": "Ordinary feed syndication. Silence in the publisher''s own documents sits beside an affirmative robots allowance, a published feed, and a demonstrated ability to restrict the uses it did not want."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000017',
  '66666666-0000-4000-8000-000000000010',
  'power-magazine-data-centers-feed', 'POWER Magazine — Data Centers', 'news_feed',
  'https://www.powermag.com/category/data-centers/feed/', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'The publisher''s own Data Centers category, and the most precisely scoped feed in the roster: power-industry reporting on the electricity demand, generation and interconnection that data centers create. Same publisher, host, robots and terms as the main POWER feed; a separate interface because it is a separate endpoint whose contents overlap.',
  '{"reviewed_on": "2026-09-15", "documents": [{"title": "powermag.com robots.txt", "url": "https://www.powermag.com/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /cgi-bin/ Disallow: /wp-admin/ Disallow: /wp-includes/"}]}, {"title": "POWER Magazine Data Centers feed", "url": "https://www.powermag.com/category/data-centers/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=UTF-8, 30561 bytes, RSS 2.0, 10 items, current. Items carry the publisher''s own category terms, Data Centers among them, which is how this feed is scoped: Urdais selects a publisher-scoped endpoint rather than classifying stories itself."}], "data_use_basis": "As the main POWER feed."}'::jsonb
);

insert into reference.permission_grants (
  id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
  covers_content_syndication, granted_on, effective_from, evidence
) values
(
  '6e6e6e6e-0000-4000-8000-00000000000b', '6f6f6f6f-0000-4000-8000-000000000014', 'provider_terms',
  'DOE Web Policies, Copyright, Restrictions and Permissions Notice (energy.gov/about-us/web-policies), retrieved 2026-09-15',
  true, false, true, '2026-09-15', '2026-09-15T00:00:00Z',
  'Government information at DOE websites is in the public domain and may be freely distributed and copied, with acknowledgement requested. Urdais attributes every card to its publisher, which is the acknowledgement.'
),
(
  '6e6e6e6e-0000-4000-8000-00000000000c', '6f6f6f6f-0000-4000-8000-000000000015', 'provider_terms',
  'PJM Legal & Privacy (pjm.com/about-pjm/legal.aspx) read with insidelines.pjm.com/robots.txt, both retrieved 2026-09-15',
  true, false, true, '2026-09-15', '2026-09-15T00:00:00Z',
  'The legal page carries no automated-access or content-reuse clause, robots disallows only /wp-admin/, and PJM publishes RSS feeds as a listed feature of its own site. The trademark restriction it does carry concerns marks and logos, which Urdais does not reproduce.'
),
(
  '6e6e6e6e-0000-4000-8000-00000000000d', '6f6f6f6f-0000-4000-8000-000000000016', 'provider_terms',
  'powermag.com/robots.txt read with the site privacy policy, both retrieved 2026-09-15',
  true, false, true, '2026-09-15', '2026-09-15T00:00:00Z',
  'The catch-all robots group permits the feed; the publisher restricts AI training crawlers by name and nothing else. No content terms-of-use exists on the site.'
),
(
  '6e6e6e6e-0000-4000-8000-00000000000e', '6f6f6f6f-0000-4000-8000-000000000017', 'provider_terms',
  'powermag.com/robots.txt read with the site privacy policy, both retrieved 2026-09-15',
  true, false, true, '2026-09-15', '2026-09-15T00:00:00Z',
  'Same publisher, host, robots file and absence of content terms as the main POWER feed; a separate grant because a grant covers one interface.'
);

insert into reference.news_sources (
  id, source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes,
  image_policy, image_hosts, image_evidence
) values
(
  '6d6d6d6d-0000-4000-8000-000000000009', '6f6f6f6f-0000-4000-8000-000000000014',
  'doe-newsroom', 'energy-power', 'rss', 'public_domain', true,
  'Federal energy policy, generation and financing announcements.',
  'none', '{}'::text[],
  'The feed attaches no media element, and the DOE reuse notice separately warns that some images on its sites are licensed from third parties rather than public domain. Two independent reasons to reference none.'
),
(
  '6d6d6d6d-0000-4000-8000-00000000000a', '6f6f6f6f-0000-4000-8000-000000000015',
  'pjm-inside-lines', 'energy-power', 'rss', 'publisher_feed_syndication', true,
  'The PJM grid operator newsroom: reliability standards, large-load interconnection and operations.',
  'none', '{}'::text[],
  'No media or enclosure element. The only image is inline in the post body, which is body content rather than a syndicated enclosure, and Urdais does not take images out of article HTML.'
),
(
  '6d6d6d6d-0000-4000-8000-00000000000b', '6f6f6f6f-0000-4000-8000-000000000016',
  'power-magazine', 'energy-power', 'rss', 'publisher_feed_syndication', true,
  'Power generation, transmission and grid trade reporting.',
  'none', '{}'::text[],
  'No media or enclosure element; images appear only inline in the body description, which is not taken.'
),
(
  '6d6d6d6d-0000-4000-8000-00000000000c', '6f6f6f6f-0000-4000-8000-000000000017',
  'power-magazine-data-centers', 'energy-power', 'rss', 'publisher_feed_syndication', true,
  'The publisher''s Data Centers category: the electricity demand and generation that data centers create. Overlaps the main POWER feed; a shared story is stored once.',
  'none', '{}'::text[],
  'As the main POWER feed.'
);

-- Researched and refused --------------------------------------------------------

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-000000000018',
  '66666666-0000-4000-8000-000000000012',
  'utility-dive-news-feed', 'Utility Dive news feed', 'news_feed',
  'https://www.utilitydive.com/feeds/news/', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_reviewed', true,
  'The best-scoped commercial candidate — its window was utility mergers, EPA power plant standards and generation acquisitions, all squarely on topic — and refused on the collection axis. The Informa TechTarget terms that govern it prohibit data mining, robots and similar data gathering methods, the same clause shape as the AWS Site Terms this registry already refuses. robots.txt is not the obstacle; it permits the feed with a five-second crawl delay.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "Informa TechTarget Terms of Use", "url": "https://www.informatechtarget.com/terms-of-use/", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "(c) use any data mining, robots or similar data gathering or extraction methods or (d) use any of the Services other than for its intended purpose.", "note": "Listed among the licence restrictions. No carve-out for the RSS feed the publication itself offers. Utility Dive links this document as its terms of use."}]}, {"title": "utilitydive.com robots.txt", "url": "https://www.utilitydive.com/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "User-agent: * Crawl-delay: 5 Disallow: /admin/ ... Disallow: /subscriber/", "note": "The feed path is not disallowed. Robots permits what the terms prohibit, and the terms govern."}]}, {"title": "Utility Dive news feed", "url": "https://www.utilitydive.com/feeds/news/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=utf-8, 8776 bytes, RSS 2.0, 10 items, current. Technically usable and well scoped; not permitted."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000019',
  '66666666-0000-4000-8000-000000000011',
  'eia-today-in-energy-feed', 'EIA Today in Energy', 'news_feed',
  'https://www.eia.gov/rss/todayinenergy.xml', true,
  'public_unauthenticated', 'production_review_pending', 'permitted', 'permitted', false,
  'The only candidate refused on relevance while holding the strongest possible rights. EIA material is public domain and expressly free to distribute, and robots permits the feed — but Today in Energy is the agency''s whole energy brief, and roughly six of sixteen items in the retrieved window were electricity or grid stories. The remainder were crude oil production, LNG export capacity, refining crack spreads and petroleum pipelines, which the Energy / Power rail explicitly excludes. The feed carries no category element, so there is no publisher-supplied topic metadata to select on and no EIA electricity-scoped feed exists. Narrowing it would require Urdais to classify stories itself, which the pipeline deliberately does not do. Recorded permitted on both axes so that the decision to be made is the editorial one, not a rights one.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "EIA Copyrights and Reuse", "url": "https://www.eia.gov/about/copyrights_reuse.php", "retrieved_on": "2026-09-15", "clauses": [{"axis": "data_use", "text": "U.S. government publications are in the public domain and are not subject to copyright protection. You may use and/or distribute any of our data, files, databases, reports, graphs, charts, and other information products that are on our website or that you receive through our email distribution service.", "note": "An express grant, stronger than any other basis in the registry."}, {"axis": "data_use", "text": "However, if you use or reproduce any of our information products, you should use an acknowledgment, which includes the publication date, such as: \"Source: U.S. Energy Information Administration (Oct 2008).\"", "note": "Satisfied by attributing every card to its publisher with its publication date, which the card already shows."}]}, {"title": "eia.gov robots.txt", "url": "https://www.eia.gov/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "User-agent: * Allow: /", "note": "Followed by narrow path disallows; /rss/ is not among them."}]}, {"title": "EIA Today in Energy feed", "url": "https://www.eia.gov/rss/todayinenergy.xml", "retrieved_on": "2026-09-15", "note": "HTTP 200, text/xml, 9931 bytes, RSS 2.0, 16 items, current to the retrieval day, plain-text descriptions, no category element and no media element. Roughly 6 of 16 items were electricity or grid; the rest were oil, LNG, refining and pipelines."}, {"title": "Absence of an electricity-scoped EIA feed", "url": "https://www.eia.gov/tools/rss/", "retrieved_on": "2026-09-15", "note": "The RSS index lists no electricity-scoped feed, and /rss/electricity.xml, /rss/tie_electricity.xml and /electricity/rss.xml are all absent or HTML."}], "note": "Rights are settled and favourable; only editorial scope is unresolved. If Urdais ever adopts publisher-metadata or deterministic topic selection, this is the first source to revisit."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-00000000001a',
  '66666666-0000-4000-8000-000000000013',
  'canary-media-feed', 'Canary Media feed', 'news_feed',
  'https://www.canarymedia.com/rss.xml', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'A live, well-produced clean-energy publication whose beat is climate policy, heat pumps, residential solar and state politics. That is the content the Energy / Power scope names as out: it is a climate and consumer-energy rail, not a power-market and grid-infrastructure one.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "Canary Media feed", "url": "https://www.canarymedia.com/rss.xml", "retrieved_on": "2026-09-15", "note": "HTTP 200, served as text/html but the body is RSS 2.0, 93840 bytes, 100 items, current. The window was thermal batteries for cement, California heat-pump and solar permitting, and a governor''s climate legacy. Terms were not reviewed because relevance decided it first."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-00000000001b',
  '66666666-0000-4000-8000-000000000014',
  'iso-new-england-newswire-feed', 'ISO New England ISO Newswire', 'news_feed',
  'https://isonewswire.com/feed/', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'A grid operator, and the institutional source this roster would most like to add, but its newswire is stakeholder administration rather than power-market news: settlement forum materials, satisfaction surveys, conference appearances and webinar notices. PJM covers the same role with operational reporting, which is why PJM is in and this is not.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "ISO Newswire feed", "url": "https://isonewswire.com/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=UTF-8, 58269 bytes, RSS 2.0, 10 items, current, with media:content images on all ten. Content is stakeholder notices. Terms were not reviewed because relevance decided it first."}, {"title": "Other grid operators", "url": "https://www.iso-ne.com/", "retrieved_on": "2026-09-15", "note": "ERCOT, CAISO, NYISO and SPP publish no feed at any probed path; MISO and FERC answer a non-browser agent with HTTP 403 and were not retried."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-00000000001c',
  '66666666-0000-4000-8000-000000000015',
  'datacenterdynamics-feed', 'Data Center Dynamics feed', 'news_feed',
  'https://www.datacenterdynamics.com/en/rss/', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'Live, image-rich, and carrying an express machine-readable grant — its robots file sets Content-Signal search=yes and use=reference, the same instrument that settled Cloudflare for Compute. Refused here on scope rather than rights: it is a data-centre publication covering construction, subsea cable and regional expansion, of which power is one strand, and its power-scoped channel feeds all return 403. It belongs to the Compute rail''s question, not this one. Its terms-and-conditions page is also behind a Cloudflare challenge and could not be read, so the review is incomplete either way.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "datacenterdynamics.com robots.txt", "url": "https://www.datacenterdynamics.com/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "data_use", "text": "User-agent: * Content-Signal: search=yes,ai-train=no,use=reference Allow: /", "note": "An express grant for the search use and for reference use, with training refused. Urdais does neither training nor inference on this content."}]}, {"title": "Data Center Dynamics feed", "url": "https://www.datacenterdynamics.com/en/rss/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=utf-8, 13512 bytes, RSS 2.0, 20 items, current, enclosure images on all 20 from media.datacenterdynamics.com. Power-scoped channel paths under /en/rss/power-cooling/ and equivalents all return HTTP 403."}, {"title": "Terms and conditions", "url": "https://www.datacenterdynamics.com/en/terms-conditions/", "retrieved_on": "2026-09-15", "note": "HTTP 403 behind a Cloudflare managed challenge. Not retried with a different agent."}]}'::jsonb
);

do $$
declare n integer;
begin
  select count(*) into n from reference.news_sources where is_enabled and category = 'energy-power';
  if n <> 4 then raise exception 'expected 4 enabled Energy / Power sources, found %', n; end if;
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and si.production_access_state <> 'production_approved';
  if n <> 0 then raise exception '% enabled source(s) are not production-approved', n; end if;
  select count(*) into n from reference.news_sources where is_enabled and category = 'compute';
  if n <> 8 then raise exception 'expected 8 enabled Compute sources, found %', n; end if;
  select count(*) into n from reference.news_sources where is_enabled;
  if n <> 12 then raise exception 'expected 12 enabled sources across Compute and Energy / Power, found %', n; end if;
  select count(*) into n from reference.news_sources where category not in ('compute', 'energy-power');
  if n <> 0 then raise exception 'a source was registered outside the two production categories'; end if;
  -- Memory stayed refused and Crypto was not started.
  select count(*) into n from reference.news_sources where category in ('memory', 'crypto', 'photonics', 'ai-chips');
  if n <> 0 then raise exception 'a deferred category gained a source registration'; end if;
  if (select production_access_state from reference.source_interfaces where slug = 'skhynix-newsroom-feed') <> 'production_blocked' then
    raise exception 'the Memory research record was disturbed';
  end if;
  select count(*) into n from reference.permission_grants g
    join reference.source_interfaces si on si.id = g.source_interface_id
   where si.source_class = 'news_feed' and g.covers_index_use;
  if n <> 0 then raise exception 'a news grant claims index permission it was never given'; end if;
  select count(*) into n from reference.news_sources
   where image_policy = 'feed_media' and coalesce(array_length(image_hosts, 1), 0) = 0;
  if n <> 0 then raise exception 'an image policy was enabled with no host allowlist'; end if;
  select count(*) into n from pipeline.news_articles;
  if n <> 0 then raise exception 'news articles were seeded'; end if;
end
$$;
