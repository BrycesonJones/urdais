-- UBWI Phase 2D: the numerator's terms, retrieved and retained.
--
-- Production V1 registered the four numerator interfaces with `not_reviewed` terms and no
-- artifact, because none had been retrieved. Phase 2D retrieved them. This migration
-- records what they say.
--
-- The finding is that the Phase 1 conclusion -- reading public venue tickers directly
-- removes the licensing dependency a vendor aggregate would carry -- was true about
-- *vendors* and was never a statement about the *venues*. Reproducing a construction
-- yourself does not reproduce the permission to publish it.
--
--   Coinbase   expressly prohibits caching, aggregating, storing and sharing the data,
--              and prohibits recording it by automated program at all.
--   Kraken     permits use of its content "only for your own benefit" and lists
--              commercial exploitation and making it available to a third party among
--              the prohibited acts.
--   Bitstamp   permits exactly what Urdais does -- incorporation, redistribution and
--              derived calculations, commercially -- to a company that has signed its
--              Data License Agreement. Urdais has not signed one.
--   Blockchain grants access to the Explorer API and scopes it to informational
--   .com       purposes; it grants no derived-publication or redistribution right.
--
-- Three of four therefore cannot supply a published numerator, and the fourth's grant is
-- conditional and unmet. UBWI stays `launch_blocked` and nothing is published.
--
-- Every hash below is the SHA-256 of the actual retained bytes, and every quoted clause
-- was cut out of the retained document rather than recalled. `npm run ubwi:verify-terms`
-- re-derives both from the artifact store, and src/lib/ubwi/terms-integrity.ts is what
-- makes a typed-in hash fail rather than pass quietly.

-- ---------------------------------------------------------------- Coinbase
--
-- The one interface whose terms forbid the retrieval itself, which is why both axes move
-- and the production access state follows them. The registry's own constraint requires
-- that: `terms_review_state <> 'not_permitted' or production_access_state = 'production_blocked'`.

update reference.source_interfaces set
  terms_artifact_url    = 'https://www.coinbase.com/legal/developer-platform/terms-of-service',
  terms_artifact_hash   = '1fe28153ef70be9ecebdc14a5603c572f269c4851b0f231f1837eca370484feb',
  terms_artifact_bytes  = 610772,
  terms_artifact_status = 200,
  terms_retrieved_at    = '2026-09-15T01:47:52Z',
  terms_review_state      = 'not_permitted',
  data_use_terms_state    = 'not_permitted',
  production_access_state = 'production_blocked',
  -- The terms name the remedy themselves: "prior written authorization".
  written_agreement_required = true,
  notes = 'Coinbase Developer Platform Terms, item 9 (Use Restrictions): "Collect, cache, aggregate, or store data ' ||
          'or content accessed via the CDP Tools other than for purposes allowed under these terms. You may not share ' ||
          'such data or content with third parties in any manner without Coinbase''s prior written authorization. ' ||
          'Further, you are strictly prohibited from recording data or content accessed via the CDP Tools through the ' ||
          'use of any automated programs, software, or any other method of screen scraping." Urdais''s numerator does ' ||
          'all four: records by automated program, caches, aggregates into a median, and displays publicly. The ' ||
          'licence grant in the same document is narrower still, covering content available at cdp.coinbase.com, ' ||
          'while the production endpoint is api.coinbase.com.'
where slug = 'coinbase-spot';

-- ---------------------------------------------------------------- Kraken
--
-- Retrieval is not itself prohibited; the publication is. The two axes therefore diverge,
-- which is the reason the registry carries two.

update reference.source_interfaces set
  terms_artifact_url    = 'https://www.kraken.com/legal/global-terms',
  terms_artifact_hash   = '6e61bf4ebe741d246e33849f95d10015d8a14d52b6f87501e0f15bacb4d7bea0',
  terms_artifact_bytes  = 3633626,
  terms_artifact_status = 200,
  terms_retrieved_at    = '2026-09-15T01:47:36Z',
  terms_review_state      = 'permitted',
  data_use_terms_state    = 'not_permitted',
  production_access_state = 'production_blocked',
  -- "you must seek prior permission to do so by contacting" -- the remedy is an agreement.
  written_agreement_required = true,
  notes = 'Kraken Global Terms of Service. "Our Content" is defined as the services and platforms, all content and ' ||
          'materials found on them, their selection and arrangement, and the intellectual property rights in them -- ' ||
          'which reaches a published ticker price. The grant is to use it "but only for your own benefit", and the ' ||
          'prohibited acts include to "use (except as expressly permitted in these Terms), license, sublicense, sell, ' ||
          'resell, transfer, assign, distribute or otherwise commercially exploit or make available to any third ' ||
          'party Our Content in any way". The document directs anyone wanting another purpose to seek prior ' ||
          'permission. The Global terms are the applicable ones: Kraken serves separate Canadian, EEA and Brazil terms.'
where slug = 'kraken-ticker';

-- ---------------------------------------------------------------- Bitstamp
--
-- The closest thing to a grant anywhere in the numerator, and the clearest "not yet".
-- Bitstamp states the permission Urdais needs and names the instrument that conveys it.
-- Signing it is an outreach decision, and no outreach was sent.

update reference.source_interfaces set
  terms_artifact_url    = 'https://www.bitstamp.net/api/',
  terms_artifact_hash   = 'd11bf1c0dec89cf397eef81766fa59fa75d90cd09bbe9d301b1e57d007abef76',
  terms_artifact_bytes  = 2007325,
  terms_artifact_status = 200,
  terms_retrieved_at    = '2026-09-15T01:47:44Z',
  terms_review_state      = 'permitted',
  data_use_terms_state    = 'under_review',
  production_access_state = 'production_review_pending',
  -- The Data License Agreement Bitstamp names is exactly a written agreement.
  written_agreement_required = true,
  notes = 'Bitstamp API documentation, "Commercial Use of Bitstamp''s Exchange Data": "Companies seeking to utilize ' ||
          'Bitstamp''s exchange data for their own commercial purposes are directed to contact partners@bitstamp.net ' ||
          'to receive and sign a commercial use Data License Agreement. Bitstamp allows the incorporation and ' ||
          'redistribution of our exchange data for commercial purposes. This includes the right to create ratios, ' ||
          'calculations, new original works, statistics, and similar, based on the exchange data." That is exactly ' ||
          'the UBWI use, and it is conditional on an agreement Urdais does not hold, so the data-use axis stays open. ' ||
          'Retrieval is granted outright: "As standard, all clients can make 400 requests per second. There is a ' ||
          'default limit threshold of 10,000 requests per 10 minutes in place." The bitstamp.net terms-of-use page ' ||
          'sits behind an Imperva challenge returning a 212-byte stub to every request; that is a fact about the ' ||
          'retrieval, and the state above rests on the first-party API documentation, which returned HTTP 200.'
where slug = 'bitstamp-ticker';

-- ---------------------------------------------------------------- Blockchain.com
--
-- Section 20 (Explorer) of the Terms of Service is the governing document for the
-- Explorer API. It grants access and use; it says nothing that grants publication of a
-- commercial derived index, and scopes the service to informational purposes. Silence is
-- recorded as silence rather than read as permission.

update reference.source_interfaces set
  terms_artifact_url    = 'https://www.blockchain.com/legal/terms',
  terms_artifact_hash   = '0e2b690483d494a013ade657ac1e9a84278bc60d0d6fe9c479d13e884de791ef',
  terms_artifact_bytes  = 1476048,
  terms_artifact_status = 200,
  terms_retrieved_at    = '2026-09-15T01:52:11Z',
  terms_review_state      = 'permitted',
  data_use_terms_state    = 'under_review',
  production_access_state = 'production_review_pending',
  notes = 'Blockchain.com Terms of Service section 20 (Explorer): "Subject to these Terms, we grant you a revocable, ' ||
          'limited, non-exclusive, non-transferable licence to access and use the Explorer API", and "The Explorer ' ||
          'and the Explorer API are provided solely for informational purposes and do not constitute investment ' ||
          'advice, legal advice, tax advice, financial advice or any recommendation to engage in any transaction ' ||
          'involving crypto-assets or any other assets." No redistribution, retention or attribution term is stated. ' ||
          'A separate "API Terms of Service" is named in the site''s own translation bundle but is served from no ' ||
          'reachable path (/legal/api returns HTTP 404), so nothing is assumed from it. Issued supply is in any case ' ||
          'a deterministic property of the chain, reproducible from the issuance schedule at a stated height; this ' ||
          'interface is a retrieval path for it, not the authority for it.'
where slug = 'blockchain-info-supply';

-- ------------------------------------------------- a denominator candidate, unreviewed
--
-- Stats NZ is registered although it supplies nothing, because the reason it supplies
-- nothing is a rights fact and rights facts belong in the rights record rather than in a
-- comment. New Zealand's balance sheet is current, land-inclusive, market-valued and
-- exactly the denominator's concept -- Production V1 excluded it on the OECD's 2017
-- mirror, which is no longer the true reason. The true reason is that its licence could
-- not be read: the Stats NZ copyright page renders client-side and returns 22 characters
-- of body text to an HTTP client. No artifact, no rights state, no inclusion.

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('b1b1b1b1-0000-4000-8000-000000000016', 'stats-nz', 'Stats NZ', 'statistical_compiler', 'https://www.stats.govt.nz');

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class,
  terms_review_state, data_use_terms_state, automated_retrieval_available, notes
) values (
  'b2b2b2b2-0000-4000-8000-000000000016', 'b1b1b1b1-0000-4000-8000-000000000016',
  'statsnz-annual-balance-sheets', 'Stats NZ annual balance sheets', 'statistical_dataset',
  'https://www.stats.govt.nz/information-releases/annual-balance-sheets-2024-provisional/',
  true, 'public_unauthenticated',
  'not_reviewed', 'not_reviewed', true,
  'Annual balance sheets: 2024 (provisional), released 27 November 2025. Total-economy net worth at market ' ||
  'value, NZD 2,973,715 mn at 31 March 2024, of which NZD 1,634,567 mn non-produced non-financial assets; ' ||
  'series SG07NLE00000AN20000S800C0. Worth 0.23 pp of world GDP. No terms artifact could be retrieved: ' ||
  'stats.govt.nz/about-us/copyright/ returns HTTP 200 with a client-rendered shell carrying 22 characters of ' ||
  'body text, the published CSV and workbook state no licence, and browser automation was unavailable. That ' ||
  'is a retrieval fact: it is not a refusal and it is not permission. One successful retrieval settles it.'
);

-- ---------------------------------------------------------------- invariants
--
-- The migration must have moved exactly what it says it moved, and must not have moved
-- UBWI any closer to being published.

do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces
   where slug in ('coinbase-spot', 'kraken-ticker', 'bitstamp-ticker', 'blockchain-info-supply')
     and terms_artifact_hash is not null
     and terms_artifact_status = 200
     and terms_retrieved_at is not null;
  if n <> 4 then raise exception 'all four numerator interfaces must carry a retained terms artifact (found %)', n; end if;

  -- Every numerator hash must be distinct: four sources citing one document would mean
  -- three of them were never retrieved.
  select count(distinct terms_artifact_hash) into n from reference.source_interfaces
   where slug in ('coinbase-spot', 'kraken-ticker', 'bitstamp-ticker', 'blockchain-info-supply');
  if n <> 4 then raise exception 'the four numerator terms artifacts must be four distinct documents (found %)', n; end if;

  -- Not one of them is cleared for the use a published numerator makes.
  select count(*) into n from reference.source_interfaces
   where slug in ('coinbase-spot', 'kraken-ticker', 'bitstamp-ticker', 'blockchain-info-supply')
     and terms_review_state = 'permitted' and data_use_terms_state = 'permitted';
  if n <> 0 then raise exception 'a numerator source reads cleared on both axes, which no retained artifact supports (found %)', n; end if;

  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved'
     and source_class in ('chain_data_interface', 'spot_price_interface');
  if n <> 0 then raise exception 'a numerator source became production-approved (found %)', n; end if;

  -- Every blocked source must name written permission as its remedy; the registry's own
  -- test asserts this across the whole table and the two new blocks must satisfy it.
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_blocked' and written_agreement_required is not true;
  if n <> 0 then raise exception '% blocked interface(s) do not record a written-permission requirement', n; end if;

  select count(*) into n from reference.instruments where symbol = 'UBWI' and lifecycle_status = 'launch_blocked';
  if n <> 1 then raise exception 'UBWI must remain launch_blocked'; end if;

  select count(*) into n from pipeline.ubwi_publications;
  if n <> 0 then raise exception 'a UBWI publication exists'; end if;
end
$$;
