-- The security master, populated for the first time.
--
-- Phase 5.2 seeded issuers and nothing below them, because eligibility is a question about a
-- company and needs no securities, listings or venues. Prices are not: a close attaches to a
-- line on a venue, in a currency, in a unit. This migration supplies that layer for the issuers
-- a price can currently be sought for, and no further -- an unpopulated security master is an
-- honest gap, and a speculatively populated one is a set of claims nobody checked.
--
-- Every row below is evidenced from a primary source:
--
--   NVIDIA, Palantir   the Section 12(b) registration table on their own Form 10-K cover pages,
--                      which names the title of the class, the trading symbol and the exchange
--   TSMC               the TWSE OpenAPI daily trading response, which is the venue publishing
--                      its own listed code
--
-- Currencies and units are not evidenced from those documents and are properties of the venue:
-- TWSE quotes in whole New Taiwan dollars, Nasdaq in whole US dollars, both major units. Neither
-- venue uses a minor-unit convention, so the hundredfold-error case that the listing's
-- price_unit column exists for is not exercised by any row here. That is worth saying out loud,
-- because it means these rows do not test it and a London line later will.

-- ------------------------------------------------------------------------------ venues

insert into reference.venues
  (id, mic, operating_mic, name, country_code, default_currency, timezone,
   support_state, price_source_state, rights_state, notes)
values
  -- Taiwan: the one venue in this review with an official, free, index-permitting source.
  ('ce000000-0000-4000-8000-000000000001', 'XTAI', null,
   'Taiwan Stock Exchange', 'TW', 'TWD', 'Asia/Taipei',
   'supported', 'implemented', 'permitted',
   'Official TWSE OpenAPI publishes the daily close and a market calendar under the Taiwan Open Government Data License, which grants derivative works for any purpose subject to attribution. The only venue reviewed in Phase 5.3 whose rights reach index publication.'),

  -- Nasdaq, at two levels of granularity, because the two filings name two different things and
  -- recording both as the same venue would be tidier than the evidence.
  ('ce000000-0000-4000-8000-000000000002', 'XNAS', null,
   'Nasdaq Stock Market', 'US', 'USD', 'America/New_York',
   'research', 'unavailable', 'not_permitted',
   'No public end-of-day source. Nasdaq''s website terms grant a personal, non-commercial licence only and refuse storage, derivative works, products based on the content, and automated or manual capture. The official close is a licensed exchange product under the UTP and CTA plans, so the remedy is a written data agreement rather than another public URL. This is the venue both currently eligible issuers list on.'),
  ('ce000000-0000-4000-8000-000000000003', 'XNGS', 'XNAS',
   'Nasdaq Global Select Market', 'US', 'USD', 'America/New_York',
   'research', 'unavailable', 'not_permitted',
   'A market segment of XNAS, seeded because NVIDIA''s Form 10-K registers its common stock on the Global Select Market specifically while Palantir''s names the Nasdaq Stock Market LLC. Same rights position as its operating market.');

-- ------------------------------------------------------------------ securities and listings

-- NVIDIA. "Common Stock, $0.001 par value per share | NVDA | The Nasdaq Global Select Market".
insert into reference.securities
  (id, issuer_id, security_type, share_class, denomination_currency, status, notes)
select 'ce000000-0000-4000-8000-000000000011', i.id, 'ordinary_share', null, 'USD', 'active',
       'Common stock, $0.001 par value per share, per the Section 12(b) registration table on the FY2026 Form 10-K cover page.'
  from reference.issuers i where i.issuer_key = 'nvidia';

insert into reference.listings
  (id, security_id, venue_id, ticker, price_currency, price_unit, listing_status, is_primary,
   effective_from, notes)
values
  ('ce000000-0000-4000-8000-000000000021', 'ce000000-0000-4000-8000-000000000011',
   'ce000000-0000-4000-8000-000000000003', 'NVDA', 'USD', 'major', 'active', true,
   date '2026-01-25',
   'Effective from the FY2026 Form 10-K period end, which is the date this listing is evidenced from rather than the date the line began trading. A listing interval that starts when the evidence starts is a narrower claim than one that back-dates to a founding nobody checked.');

-- Palantir. "Class A Common Stock, par value $0.001 per share | PLTR | The Nasdaq Stock Market LLC".
insert into reference.securities
  (id, issuer_id, security_type, share_class, denomination_currency, status, notes)
select 'ce000000-0000-4000-8000-000000000012', i.id, 'ordinary_share', 'A', 'USD', 'active',
       'Class A common stock, par value $0.001 per share, per the Section 12(b) registration table on the FY2025 Form 10-K cover page. The issuer has further share classes that are not registered under Section 12(b) and are therefore not seeded: an unlisted class is not a listing.'
  from reference.issuers i where i.issuer_key = 'palantir-technologies';

insert into reference.listings
  (id, security_id, venue_id, ticker, price_currency, price_unit, listing_status, is_primary,
   effective_from, notes)
values
  ('ce000000-0000-4000-8000-000000000022', 'ce000000-0000-4000-8000-000000000012',
   'ce000000-0000-4000-8000-000000000002', 'PLTR', 'USD', 'major', 'active', true,
   date '2025-12-31',
   'Effective from the FY2025 Form 10-K period end, for the same reason as NVIDIA''s. Recorded against XNAS rather than XNGS because the filing names The Nasdaq Stock Market LLC.');

-- TSMC. Evidenced by the venue itself: the TWSE OpenAPI daily response carries Code 2330,
-- Name 台積電, with a closing price quoted in New Taiwan dollars.
insert into reference.securities
  (id, issuer_id, security_type, share_class, denomination_currency, status, notes)
select 'ce000000-0000-4000-8000-000000000013', i.id, 'ordinary_share', null, 'TWD', 'active',
       'Ordinary shares listed on the Taiwan Stock Exchange under code 2330, evidenced by TWSE''s own daily trading publication. The issuer also has a US depositary receipt; it is not seeded, because no rights-cleared source exists for its venue and a listing Urdais cannot price is not yet useful.'
  from reference.issuers i where i.issuer_key = 'tsmc';

insert into reference.listings
  (id, security_id, venue_id, ticker, price_currency, price_unit, listing_status, is_primary,
   effective_from, notes)
values
  ('ce000000-0000-4000-8000-000000000023', 'ce000000-0000-4000-8000-000000000013',
   'ce000000-0000-4000-8000-000000000001', '2330', 'TWD', 'major', 'active', true,
   date '2026-01-01',
   'The TWSE code is the venue''s own identifier for the line and is used to resolve a daily record to this listing. Effective from the start of the period Urdais has observed the venue publishing, not from the historical listing date.');

-- --------------------------------------------------------------------------- identifiers

-- Only what a primary document actually stated. No ISIN, CUSIP, SEDOL or FIGI is seeded: those
-- come from identifier authorities Urdais has not licensed, and a plausible-looking identifier
-- that nobody verified is worse than an absent one -- it will be trusted.
insert into reference.security_identifiers
  (security_id, identifier_type, identifier_value, source_note, evidence_url, effective_from)
values
  ('ce000000-0000-4000-8000-000000000011', 'local_code', 'NVDA',
   'Trading symbol in the Section 12(b) registration table, FY2026 Form 10-K cover page.',
   'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm',
   date '2026-01-25'),
  ('ce000000-0000-4000-8000-000000000012', 'local_code', 'PLTR',
   'Trading symbol in the Section 12(b) registration table, FY2025 Form 10-K cover page.',
   'https://www.sec.gov/Archives/edgar/data/1321655/000132165526000011/pltr-20251231.htm',
   date '2025-12-31'),
  ('ce000000-0000-4000-8000-000000000013', 'local_code', '2330',
   'Listed code published by the venue in its own daily trading data.',
   'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
   date '2026-01-01');

-- The Nasdaq refusal is venue-scoped to both MICs, so neither the operating market nor its
-- segment can be reached through the grant that covers the other.
update reference.permission_grants
   set covered_venues = array['XNAS', 'XNGS']::text[]
 where id = '5e000000-0000-4000-8000-000000000207';
