-- Crypto becomes the third and last production news category of News V1.
--
-- Three approved feeds across three publishers, and the eleven candidates that
-- were researched and refused. The schema is Compute's and Energy / Power's;
-- nothing structural is added.
--
-- Crypto publishing turned out to have the most restrictive terms of any
-- category Urdais has qualified. Eight publishers with live, well-scoped,
-- technically sound feeds prohibit exactly what Urdais does, most of them in
-- the same two sentences: no robots, and personal non-commercial use only. The
-- three that remain are the three that said something different — a source
-- released under an open licence, a publisher that published a machine-readable
-- grant, and one whose only policy governs its licensed products rather than
-- its blog.
--
-- The result is a smaller rail than the field suggested and a better one than a
-- permissive reading would have produced: Bitcoin protocol engineering, market
-- structure and regulation reporting, and blockchain forensics, with none of
-- the token promotion the editorial scope rules out.

-- An open licence is not a written permission addressed to Urdais, and it is not
-- public domain either: it grants commercial reuse on stated conditions, which
-- is a third thing. Recording it as one of the existing bases would misstate
-- what the publisher actually did.
alter table reference.news_sources
  drop constraint news_sources_basis_allowed,
  add constraint news_sources_basis_allowed check (syndication_basis in (
    'publisher_feed_syndication',
    'official_api_terms',
    'written_permission',
    'public_domain',
    'open_licence'
  ));

comment on column reference.news_sources.syndication_basis is
  'publisher_feed_syndication: the publisher offers a machine-readable feed of headline metadata and neither its terms nor its robots rules restrict reading it. This is a reasonable operational interpretation of ordinary feed syndication, not a written grant. public_domain: the publisher states its material is not subject to copyright and may be freely used and distributed, typically a United States federal agency, usually with a request for acknowledgement that Urdais satisfies by attributing every card to its publisher. open_licence: the publisher releases its material under a named open licence granting commercial reuse on stated conditions, such as MIT or a Creative Commons attribution licence. official_api_terms: an API whose own terms address the use. written_permission: a grant addressed to Urdais.';

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('66666666-0000-4000-8000-000000000016', 'bitcoin-optech',  'Bitcoin Optech',   'other', 'https://bitcoinops.org'),
  ('66666666-0000-4000-8000-000000000017', 'the-block',       'The Block',        'other', 'https://www.theblock.co'),
  ('66666666-0000-4000-8000-000000000018', 'chainalysis',     'Chainalysis',      'other', 'https://www.chainalysis.com'),
  ('66666666-0000-4000-8000-000000000019', 'coindesk',        'CoinDesk',         'other', 'https://www.coindesk.com'),
  ('66666666-0000-4000-8000-00000000001a', 'decrypt',         'Decrypt',          'other', 'https://decrypt.co'),
  ('66666666-0000-4000-8000-00000000001b', 'blockworks',      'Blockworks',       'other', 'https://blockworks.co'),
  ('66666666-0000-4000-8000-00000000001c', 'cointelegraph',   'Cointelegraph',    'other', 'https://cointelegraph.com'),
  ('66666666-0000-4000-8000-00000000001d', 'cryptoslate',     'CryptoSlate',      'other', 'https://cryptoslate.com'),
  ('66666666-0000-4000-8000-00000000001e', 'ethereum-foundation', 'Ethereum Foundation', 'other', 'https://ethereum.org'),
  ('66666666-0000-4000-8000-00000000001f', 'solana-foundation',   'Solana Foundation',   'other', 'https://solana.com'),
  ('66666666-0000-4000-8000-000000000020', 'bitcoin-magazine',    'Bitcoin Magazine',    'other', 'https://bitcoinmagazine.com'),
  ('66666666-0000-4000-8000-000000000021', 'dl-news',         'DL News',          'other', 'https://www.dlnews.com')
on conflict (slug) do nothing;

-- Approved ----------------------------------------------------------------------

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-00000000001d',
  '66666666-0000-4000-8000-000000000016',
  'bitcoin-optech-feed', 'Bitcoin Optech newsletter', 'news_feed',
  'https://bitcoinops.org/feed.xml', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'The technical Bitcoin newsletter, and the clearest grant in the category: everything Optech produces is released under the MIT licence, which permits commercial use and redistribution with attribution. An Atom feed whose summary element is a genuine abstract, so the summary is stored and the newsletter body is not. Its media:thumbnail is the Optech logo, identical on every item, so no image is referenced: a logo repeated down the rail is not article artwork.',
  '{"reviewed_on": "2026-09-15", "documents": [{"title": "Bitcoin Optech — About", "url": "https://bitcoinops.org/en/about/", "retrieved_on": "2026-09-15", "clauses": [{"axis": "data_use", "text": "All material produced by Bitcoin Optech is open source and released under the MIT license.", "note": "An express, permissive licence. It permits commercial use and redistribution subject to attribution, which the card gives by naming the publisher. A headline, a link and a short abstract are in any case far short of a substantial portion."}, {"axis": "collection", "text": "not addressed", "note": "bitcoinops.org publishes no robots.txt, so there are no machine-readable instructions to violate, and the site publishes an Atom feed. Nothing restricts automated retrieval."}]}, {"title": "Bitcoin Optech feed", "url": "https://bitcoinops.org/feed.xml", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/xml, 627631 bytes, Atom 1.0, 10 entries, current to 2026-09-11. Summary elements around 380 characters; content elements carry the full newsletter and are not stored. media:thumbnail is https://bitcoinops.org/img/logos/optech-notext.png on all ten entries."}], "data_use_basis": "An open-source licence granting commercial reuse with attribution."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-00000000001e',
  '66666666-0000-4000-8000-000000000017',
  'the-block-feed', 'The Block', 'news_feed',
  'https://www.theblock.co/rss.xml', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'Market structure, regulation and institutional coverage, and the only crypto news publisher in the field that published a machine-readable grant instead of a prohibition. Its robots file sets Content-Signal search=yes, the same instrument that settled Cloudflare for Compute, above a preamble stating that a yes signal means content may be collected for that use. Short publisher deks are stored; media:content thumbnails are served from the publisher''s own asset host. Its terms pages return 403 to a non-browser agent and could not be read, which is recorded rather than assumed away.',
  '{"reviewed_on": "2026-09-15", "documents": [{"title": "theblock.co robots.txt", "url": "https://www.theblock.co/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "data_use", "text": "User-agent: * Content-Signal: search=yes, ai-input=yes, ai-train=yes", "note": "An express grant. The content-signal preamble the file carries defines search as building a search index and providing search results, for example returning hyperlinks and short excerpts, and states that a yes signal means you may collect content for that use. That is what a news rail does."}, {"axis": "collection", "text": "Disallow: /search Disallow: /api/ Disallow: /preview/ Disallow: /wp-json/ Disallow: /ping Disallow: /ws/", "note": "The catch-all group''s disallows do not reach /rss.xml."}, {"axis": "collection", "text": "User-agent: GPTBot User-agent: ClaudeBot User-agent: CCBot User-agent: PerplexityBot", "note": "Named AI crawlers are restricted separately. Urdais retrieves as its own news collector, trains nothing and performs no inference on this content, so it is not one of them."}]}, {"title": "Terms pages", "url": "https://www.theblock.co/terms", "retrieved_on": "2026-09-15", "note": "HTTP 403 to a non-browser agent, as did /terms-of-service, /terms-of-use, /about/terms and /legal. The review therefore rests on the machine-readable grant alone; no conflicting clause was found, and none could be ruled out. Not retried with a spoofed agent."}, {"title": "The Block feed", "url": "https://www.theblock.co/rss.xml", "retrieved_on": "2026-09-15", "note": "HTTP 200, text/xml; charset=UTF-8, 28904 bytes, RSS 2.0, 20 items, current to the retrieval day. UUID guids distinct from the canonical link, descriptions around 135 characters, media:content on all 20 from www.tbstat.com/wp/uploads/."}], "data_use_basis": "An express machine-readable content signal granting the search use, which the same file defines as returning hyperlinks and short excerpts."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-00000000001f',
  '66666666-0000-4000-8000-000000000018',
  'chainalysis-blog-feed', 'Chainalysis blog', 'news_feed',
  'https://www.chainalysis.com/feed/', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'Blockchain forensics: sanctions actions, exchange and protocol exploits, and enforcement, which is market-infrastructure reporting rather than price commentary. The company''s only published policy is an Acceptable Use Policy addressed to licensees of its compliance products, and it does not govern the public blog — the same interface distinction already recorded for Lambda and DigitalOcean. Descriptions are genuine summary paragraphs and are stored; the feed attaches no media.',
  '{"reviewed_on": "2026-09-15", "relationship_to_existing_row": "The Chainalysis Acceptable Use Policy prohibits robots against the Services, which are its licensed compliance products — Reactor, KYT, Address Screening and the documented APIs behind them. A public marketing blog is not one of them, and no separate website terms of use exists.", "documents": [{"title": "Chainalysis Acceptable Use Policy", "url": "https://www.chainalysis.com/acceptable-use-policy/", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "Licensee shall not, either directly or indirectly: (i) integrate Licensee''s application or system with the Services through APIs other than the documented APIs expressly made available and permitted by Chainalysis for such use, (ii) use any robot, spider, or automated process to scrape, crawl, index, copy, or extract any aspect of the Services", "note": "Addressed to a Licensee and scoped to the Services, which the same document defines as the licensed products. The blog is neither."}]}, {"title": "Chainalysis legal index", "url": "https://www.chainalysis.com/legal/", "retrieved_on": "2026-09-15", "note": "The index links the Acceptable Use Policy and no website terms of use. None was found at any other path."}, {"title": "chainalysis.com robots.txt", "url": "https://www.chainalysis.com/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /wp-content/uploads/*.pdf$ Disallow: /wp-content/uploads/", "note": "The entire catch-all group. The feed is not disallowed."}]}, {"title": "Chainalysis feed", "url": "https://www.chainalysis.com/feed/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=UTF-8, 12503 bytes, RSS 2.0, 10 items, current. Descriptions around 450 characters and genuinely summaries; no media element."}], "data_use_basis": "Ordinary feed syndication. Silence in the publisher''s own documents sits beside an affirmative robots allowance and a published feed."}'::jsonb
);

insert into reference.permission_grants (
  id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
  covers_content_syndication, granted_on, effective_from, evidence
) values
(
  '6e6e6e6e-0000-4000-8000-00000000000f', '6f6f6f6f-0000-4000-8000-00000000001d', 'provider_terms',
  'Bitcoin Optech MIT licence, stated at bitcoinops.org/en/about/, retrieved 2026-09-15',
  true, false, true, '2026-09-15', '2026-09-15T00:00:00Z',
  'All Optech material is released under the MIT licence, which permits commercial use and redistribution with attribution. No robots file exists to restrict retrieval, and the project publishes an Atom feed.'
),
(
  '6e6e6e6e-0000-4000-8000-000000000010', '6f6f6f6f-0000-4000-8000-00000000001e', 'provider_terms',
  'theblock.co/robots.txt content signals, retrieved 2026-09-15',
  true, false, true, '2026-09-15', '2026-09-15T00:00:00Z',
  'An express machine-readable grant: the file states that a content-signal of yes permits collection for that use, and sets search=yes, where search is defined as returning hyperlinks and short excerpts. The terms pages could not be read and the grant is the whole basis, which the interface evidence records.'
),
(
  '6e6e6e6e-0000-4000-8000-000000000011', '6f6f6f6f-0000-4000-8000-00000000001f', 'provider_terms',
  'Chainalysis Acceptable Use Policy and legal index read with chainalysis.com/robots.txt, all retrieved 2026-09-15',
  true, false, true, '2026-09-15', '2026-09-15T00:00:00Z',
  'The only published policy is addressed to licensees of the compliance products and does not govern the public blog. No website terms of use exists, robots permits the feed, and the blog publishes one.'
);

insert into reference.news_sources (
  id, source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes,
  image_policy, image_hosts, image_evidence
) values
(
  '6d6d6d6d-0000-4000-8000-00000000000d', '6f6f6f6f-0000-4000-8000-00000000001d',
  'bitcoin-optech', 'crypto', 'atom', 'open_licence', true,
  'Bitcoin protocol engineering: consensus changes, wallet and node releases, and proposed protocol work.',
  'none', '{}'::text[],
  'The only media element is the Optech logo, identical across every entry. A site logo repeated down the rail is not article artwork, and referencing it would make every card look the same.'
),
(
  '6d6d6d6d-0000-4000-8000-00000000000e', '6f6f6f6f-0000-4000-8000-00000000001e',
  'the-block', 'crypto', 'rss', 'publisher_feed_syndication', true,
  'Market structure, regulation and institutional coverage.',
  'feed_media', array['www.tbstat.com/wp/uploads/'],
  'Every item carries media:content on the publisher''s own asset host under a single path prefix. The content signal that grants the search use covers returning short excerpts of the publisher''s contents, and the images are served by the publisher, who keeps their logs and can stop serving them. Verified 2026-09-15: 20 distinct URLs, all on that prefix, sampled HTTP 200 image/png.'
),
(
  '6d6d6d6d-0000-4000-8000-00000000000f', '6f6f6f6f-0000-4000-8000-00000000001f',
  'chainalysis-blog', 'crypto', 'rss', 'publisher_feed_syndication', true,
  'Sanctions actions, protocol and exchange exploits, and enforcement.',
  'none', '{}'::text[],
  'The feed attaches no media or enclosure element. There is nothing to reference.'
);

-- Researched and refused ---------------------------------------------------------
--
-- Eight of these are terms refusals, which is the highest proportion of any
-- category Urdais has qualified. They are recorded individually rather than
-- summarised because the clauses differ and a later reader should be able to
-- see which publisher said what.

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-000000000020', '66666666-0000-4000-8000-000000000019',
  'coindesk-feed', 'CoinDesk feed', 'news_feed', 'https://www.coindesk.com/arc/outboundfeeds/rss/', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_permitted', true,
  'The largest crypto publication, refused on both axes. Its robots file permits the feed; its terms do not permit what Urdais would do with it.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "CoinDesk Terms of Use", "url": "https://www.coindesk.com/terms", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "You agree that you will not use any robot, spider, scraper, or other automated means to access the Services for any purpose without our express written permission."}, {"axis": "data_use", "text": "you are only authorized to view, play, print and download documents, audio and video found on our Services for personal, informational, and non-commercial purposes only. You may not use, copy, reproduce, republish, upload, post, transmit, distribute, or modify the Content ... without Company''s prior written consent."}]}, {"title": "coindesk.com robots.txt", "url": "https://www.coindesk.com/robots.txt", "retrieved_on": "2026-09-15", "note": "Permits the feed. Robots is not the obstacle; the terms are."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000021', '66666666-0000-4000-8000-00000000001a',
  'decrypt-feed', 'Decrypt feed', 'news_feed', 'https://decrypt.co/feed', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_permitted', true,
  'Refused on both axes despite an entirely permissive robots file that disallows nothing at all.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "Decrypt Terms of Service", "url": "https://decrypt.co/terms-of-service", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "Without Decrypt''s prior written consent, you shall not: ... use robots, spiders, scripts, service, software or any manual or automatic device, tool, or process designed to data mine or scrape the Content, data or information from the Services ... or otherwise access or collect the Content, data or information from the Services using automated means"}, {"axis": "data_use", "text": "The Services shall be used only in a noncommercial manner."}]}, {"title": "decrypt.co robots.txt", "url": "https://decrypt.co/robots.txt", "retrieved_on": "2026-09-15", "note": "User-agent: * with no Disallow of any kind. Permissive robots, prohibitive terms."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000022', '66666666-0000-4000-8000-00000000001b',
  'blockworks-feed', 'Blockworks feed', 'news_feed', 'https://blockworks.co/feed', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_permitted', true,
  'Institutional-grade coverage, refused on both axes. Its Permitted Sharing carve-out covers personal sharing, not commercial aggregation.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "Blockworks terms and conditions", "url": "https://blockworks.co/terms", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "You must not conduct any systematic or automated data collection activities (including without limitation scraping, data mining, data extraction and data harvesting) on or in relation to the Website or Newsletter."}, {"axis": "data_use", "text": "You must not: ... reproduce, duplicate, copy, or otherwise exploit material on this Newsletter or Website for a commercial purpose; republish material from the Website or Newsletter (including republication on another website or app) except for as provided in Permitted Sharing below"}]}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000023', '66666666-0000-4000-8000-00000000001c',
  'cointelegraph-feed', 'Cointelegraph feed', 'news_feed', 'https://cointelegraph.com/rss', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_permitted', true,
  'Refused on both axes. Its terms name the thing Urdais is — an independent content pipeline — as a prohibited use.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "Cointelegraph terms", "url": "https://cointelegraph.com/terms-and-privacy", "retrieved_on": "2026-09-15", "clauses": [{"axis": "both", "text": "Users may access the Content for personal and informational purposes only. Redistribution, reproduction, automated scraping, or creation of independent content pipelines based on Cointelegraph reputation is strictly prohibited without prior written authorization.", "note": "A fair-use quoting carve-out follows, with attribution, but it does not reach an automated pipeline."}, {"axis": "data_use", "text": "you may only download the content ... for your own personal non-commercial use"}]}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000024', '66666666-0000-4000-8000-00000000001d',
  'cryptoslate-feed', 'CryptoSlate feed', 'news_feed', 'https://cryptoslate.com/feed/', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_permitted', true,
  'The most comprehensive prohibition encountered in any category: it names syndication, framing, mirroring and caching individually.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "CryptoSlate Terms", "url": "https://cryptoslate.com/terms/", "retrieved_on": "2026-09-15", "clauses": [{"axis": "data_use", "text": "CryptoSlate grants you a limited, revocable, non-exclusive, non-transferable license to access and use CryptoSlate for personal, informational, and non-commercial purposes ... you may not copy, reproduce, modify, distribute, display, perform, publish, republish, scrape, crawl, harvest, cache, sell, license, syndicate, frame, mirror, create derivative works from, or commercially exploit CryptoSlate content"}, {"axis": "collection", "text": "Use bots, spiders, scripts, automated tools, data-mining systems, artificial intelligence training pipelines, or similar technologies to access, copy, extract, monitor, or interfere with CryptoSlate without prior written permission."}]}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000025', '66666666-0000-4000-8000-00000000001e',
  'ethereum-foundation-blog-feed', 'Ethereum Foundation blog', 'news_feed', 'https://blog.ethereum.org/en/feed.xml', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'permitted', true,
  'The clearest demonstration in the registry of why the two axes are separate. The Foundation licenses all non-code content under Creative Commons Attribution 4.0, which permits exactly what Urdais would display — and in the same document prohibits any robot or automatic device from accessing the Websites for any purpose including monitoring. The content may be used; it may not be fetched this way. Production needs both, so the feed is refused while the data-use axis stands recorded as permitted.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "Ethereum Foundation Terms of Use", "url": "https://ethereum.org/en/terms-of-use/", "retrieved_on": "2026-09-15", "clauses": [{"axis": "data_use", "text": "all material, data, and information on the Websites, such as data files, text, music, audio files or other sounds, photographs, videos, or other images, but excluding any software or computer code (collectively, the \"Non-Code Content\") are licensed under the Creative Commons Attribution 4.0 International License", "note": "An express permissive licence allowing commercial reuse with attribution. The data-use axis is permitted."}, {"axis": "collection", "text": "Use any robot, spider, or other automatic device, process or means to access the Websites for any purpose, including monitoring or copying any of the material on the Websites", "note": "Listed under prohibited uses, with no carve-out for the Atom feed the blog publishes. The collection axis fails, and both axes are required."}]}, {"title": "blog.ethereum.org robots.txt", "url": "https://blog.ethereum.org/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "User-agent: * Allow: /", "note": "Permissive, and does not override the terms clause above."}]}], "note": "A written permission covering automated retrieval would make this source immediately usable, because the content licence is already in place. It is the best outreach candidate in the category."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000026', '66666666-0000-4000-8000-00000000001f',
  'solana-news-feed', 'Solana news feed', 'news_feed', 'https://solana.com/news/rss.xml', true,
  'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_permitted', true,
  'Refused on three independent clauses, despite a robots file that allows everything.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "Solana Foundation EULA and Terms of Service", "url": "https://solana.com/tos", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "using any data mining, robots, or similar data gathering and extraction tools"}, {"axis": "data_use", "text": "Systematically retrieve data or other content from the Service to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us."}, {"axis": "data_use", "text": "The Service may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us."}]}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000027', '66666666-0000-4000-8000-000000000020',
  'bitcoin-magazine-feed', 'Bitcoin Magazine feed', 'news_feed', 'https://bitcoinmagazine.com/feed', true,
  'public_unauthenticated', 'production_blocked', 'not_reviewed', 'not_permitted', true,
  'Refused on the data-use axis. Its terms prohibit reproduction and distribution without prior written consent and offer no syndication or quotation carve-out. The collection axis was not reached: its robots file restricts named SEO crawlers and does not address ordinary retrieval, but the content prohibition settles the question first.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "terms", "documents": [{"title": "Bitcoin Magazine Terms of Use", "url": "https://bitcoinmagazine.com/terms-of-use", "retrieved_on": "2026-09-15", "clauses": [{"axis": "data_use", "text": "All content, including articles, graphics, images, videos, and trademarks, is owned by or licensed to Bitcoin Magazine. Unauthorized reproduction, distribution, or modification is prohibited without our prior written consent.", "note": "The document is short and contains no syndication, quotation or fair-use carve-out."}]}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000028', '66666666-0000-4000-8000-000000000021',
  'dl-news-feed', 'DL News feed', 'news_feed', 'https://www.dlnews.com/arc/outboundfeeds/rss/', true,
  'public_unauthenticated', 'production_review_pending', 'not_reviewed', 'not_reviewed', null,
  'A permissive robots file and a well-scoped feed, and four months stale. Terms were not reviewed because a rail cannot be built from a feed that stopped updating.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "abandoned", "documents": [{"title": "DL News feed", "url": "https://www.dlnews.com/arc/outboundfeeds/rss/", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/xml; charset=utf-8, 264053 bytes, RSS 2.0, 40 items with media on all of them. Newest item Thu, 07 May 2026, against a retrieval date of 2026-09-15."}, {"title": "dlnews.com robots.txt", "url": "https://www.dlnews.com/robots.txt", "retrieved_on": "2026-09-15", "clauses": [{"axis": "collection", "text": "User-Agent: * Allow: /"}]}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000029', '66666666-0000-4000-8000-000000000019',
  'sec-press-releases-feed', 'SEC press releases', 'news_feed', 'https://www.sec.gov/news/pressreleases.rss', true,
  'public_unauthenticated', 'production_review_pending', 'permitted', 'permitted', false,
  'A United States federal agency feed in the public domain, refused on editorial scope for the same reason EIA was refused for Energy / Power: it is the agency''s whole press output, of which crypto enforcement and market-access decisions are a minority. It carries no category element and no crypto-scoped SEC feed exists, so narrowing it would mean Urdais classifying stories. Recorded permitted on both axes so the open question reads as editorial rather than legal.',
  '{"reviewed_on": "2026-09-15", "refusal_kind": "relevance", "documents": [{"title": "SEC press releases feed", "url": "https://www.sec.gov/news/pressreleases.rss", "retrieved_on": "2026-09-15", "note": "HTTP 200, application/rss+xml; charset=utf-8, 18389 bytes, RSS 2.0, 25 items, current. The retrieved window was dominated by general securities enforcement and filing relief; crypto items were a minority and no category element distinguishes them."}], "note": "United States government works are not subject to copyright. The refusal is scope, not rights, and it is the same shape as the EIA refusal recorded for Energy / Power."}'::jsonb
);

do $$
declare n integer;
begin
  select count(*) into n from reference.news_sources where is_enabled and category = 'crypto';
  if n <> 3 then raise exception 'expected 3 enabled Crypto sources, found %', n; end if;
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and si.production_access_state <> 'production_approved';
  if n <> 0 then raise exception '% enabled source(s) are not production-approved', n; end if;
  select count(*) into n from reference.news_sources where is_enabled and category = 'compute';
  if n <> 8 then raise exception 'expected 8 enabled Compute sources, found %', n; end if;
  select count(*) into n from reference.news_sources where is_enabled and category = 'energy-power';
  if n <> 4 then raise exception 'expected 4 enabled Energy / Power sources, found %', n; end if;
  select count(*) into n from reference.news_sources where is_enabled;
  if n <> 15 then raise exception 'expected 15 enabled sources across the three production categories, found %', n; end if;
  select count(*) into n from reference.news_sources where category in ('memory', 'photonics', 'ai-chips');
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
  -- This migration is written for a database replayed from zero. The assertion
  -- below is why it must not be applied verbatim to a populated production
  -- database; see docs/operations/production-environments.md.
  select count(*) into n from pipeline.news_articles;
  if n <> 0 then raise exception 'news articles were seeded'; end if;
end
$$;
