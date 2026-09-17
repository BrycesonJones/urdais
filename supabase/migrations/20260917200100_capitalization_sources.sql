-- Sources for the capitalization inputs, and the seeded evidence.
--
-- Two source families, both already rights-reviewed for other purposes and both extended here to
-- the endpoints that carry share counts and corporate actions:
--
--   SEC XBRL       the structured form of filings Urdais already collects from EDGAR, under the
--                  same access policy: collection permitted with a declared User-Agent and a rate
--                  ceiling, data use unaddressed and therefore not established
--   TWSE OpenAPI   the same platform and the same Open Government Data License as the daily
--                  closes, extended to company data, insider holdings and ex-rights notices
--
-- And one family with no source at all: free float. That is the substantive finding of this
-- phase and it is recorded as rows rather than as an absence.

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface', 'catalog_price_interface', 'availability_interface',
    'product_reference_documentation', 'hardware_reference_documentation',
    'provider_terms_documentation', 'price_surface', 'news_feed', 'statistical_dataset',
    'exchange_rate_series', 'chain_data_interface', 'spot_price_interface',
    'usage_dataset_interface', 'benchmark_dataset_interface', 'regulatory_filing_repository',
    'equity_eod_price_interface',
    -- Issuer-level structured company data: share counts, ownership, corporate actions.
    'issuer_fundamentals_interface'
  ));

-- ------------------------------------------------------------------------- SEC XBRL
--
-- data.sec.gov serves the same filings Urdais already reads from sec.gov/Archives, parsed into
-- XBRL concepts. Same operator, same access policy, so the rights position is identical: the
-- access page publishes collection conditions and says nothing about redistribution or retention,
-- and silence is not permission.
--
-- What it gives, and what it does not. `dei:EntityCommonStockSharesOutstanding` is the cover-page
-- count -- a point-in-time capitalization figure with an effective date and a filing date, which
-- is exactly the shape this phase needs. `dei:EntityPublicFloat` is the aggregate market value
-- held by non-affiliates: a genuine, official float measure, denominated in currency rather than
-- expressed as a factor, measured once a year at a fiscal date. It is float evidence. It is not a
-- float factor, and turning it into one would require dividing by a market capitalization at that
-- same date -- a derivation the parent methodology has not authorised.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state, notes,
   terms_evidence)
values
  ('5e000000-0000-4000-8000-000000000108', '5e000000-0000-4000-8000-000000000001',
   'sec-xbrl-company-concepts', 'SEC XBRL company concepts and facts',
   'regulatory_filing_repository',
   'https://data.sec.gov/api/xbrl/companyconcept/', true,
   'public_unauthenticated', 'production_review_pending', 'permitted', 'under_review',
   'The structured form of the filings already collected from EDGAR, under the same access policy. Supplies dei:EntityCommonStockSharesOutstanding (cover-page share count, effective-dated) and dei:EntityPublicFloat (aggregate market value held by non-affiliates -- float evidence in currency, never a factor).',
   '{
     "reviewed_on": "2026-09-17",
     "documents": [{
       "title": "Accessing EDGAR Data",
       "url": "https://www.sec.gov/os/accessing-edgar-data",
       "retrieved_on": "2026-09-17",
       "clauses": [
         {"axis": "collection", "text": "Please declare your user agent in request headers"},
         {"axis": "collection", "text": "Current max request rate: 10 requests/second"},
         {"axis": "data_use", "text": "not addressed",
          "note": "Same policy and same silence as the filing archives interface. Redistribution and retention are not addressed and are not claimed."}
       ]
     }]
   }'::jsonb);

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use, covers_internal_use, covers_index_calculation,
   covers_storage, covers_historical_retention, covers_post_termination_retention,
   covers_historical_reconstruction, covers_raw_redistribution,
   rights_layer, termination_obligation,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
values
  ('5e000000-0000-4000-8000-000000000208', '5e000000-0000-4000-8000-000000000108',
   'provider_terms',
   'SEC, Accessing EDGAR Data, https://www.sec.gov/os/accessing-edgar-data, retrieved 17 September 2026',
   true, true, true, true, true, true, true, true, false,
   'regulator', 'none',
   timestamptz '2026-09-17T00:00:00Z',
   'Same access policy as the EDGAR filing archives. Collection conditions published; redistribution not addressed and not claimed.',
   'Please declare your user agent in request headers ... Current max request rate: 10 requests/second.',
   'Urdais research', date '2026-09-17');

-- --------------------------------------------------------------- TWSE company data
--
-- Three endpoints on the platform whose licence was settled in Phase 5.3: company basic data
-- (which carries the issued common share count), the ex-rights and ex-dividend notice table, and
-- director and supervisor shareholding balances. Same Open Government Data License, same
-- attribution condition.
--
-- What Taiwan does not publish is a free-float factor. The insider holdings endpoint gives share
-- counts for directors and supervisors, and the major-shareholder endpoint gives the *names* of
-- holders above ten percent with no percentage at all. Those are float inputs and they are not a
-- float population: strategic corporate holders, cross-holdings and government stakes are not in
-- either list. Summing what is published would produce a confident number that is wrong in an
-- unknown direction.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state, notes,
   terms_evidence)
values
  ('5e000000-0000-4000-8000-000000000109', '5e000000-0000-4000-8000-000000000004',
   'tw-twse-openapi-company', 'TWSE OpenAPI listed company basic data',
   'issuer_fundamentals_interface',
   'https://openapi.twse.com.tw/v1/opendata/t187ap03_L', true,
   'public_unauthenticated', 'production_approved', 'permitted', 'permitted',
   'Carries 已發行普通股數 (issued common shares), 私募股數 (privately placed shares), 特別股 (preferred shares) and paid-in capital per listed company. The issued-share count reconciles against paid-in capital divided by par value, which is a useful independent check on a parse.',
   '{"reviewed_on": "2026-09-17", "documents": [{"title": "TWSE OpenAPI service metadata (info.description)", "url": "https://openapi.twse.com.tw/v1/swagger.json", "retrieved_on": "2026-09-17", "clauses": [{"axis": "collection", "text": "本平臺提供臺灣證券交易所服務API，歡迎各位介接使用。"}, {"axis": "data_use", "text": "[授權說明網址](https://data.gov.tw/license)", "note": "Open Government Data License: derivative works for any purpose, attribution a condition."}]}]}'::jsonb),
  ('5e000000-0000-4000-8000-000000000110', '5e000000-0000-4000-8000-000000000004',
   'tw-twse-openapi-corporate-actions', 'TWSE OpenAPI ex-rights and ex-dividend notices',
   'issuer_fundamentals_interface',
   'https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL', true,
   'public_unauthenticated', 'production_approved', 'permitted', 'permitted',
   'The venue''s own ex-rights and ex-dividend advance notice table: cash dividend per share, stock dividend ratio, rights subscription ratio and subscription price, keyed to the ex-date. Covers the action types that change a share count or a price basis.',
   '{"reviewed_on": "2026-09-17", "documents": [{"title": "TWSE OpenAPI service metadata (info.description)", "url": "https://openapi.twse.com.tw/v1/swagger.json", "retrieved_on": "2026-09-17", "clauses": [{"axis": "collection", "text": "本平臺提供臺灣證券交易所服務API，歡迎各位介接使用。"}, {"axis": "data_use", "text": "[授權說明網址](https://data.gov.tw/license)", "note": "Same licence as the daily prices."}]}]}'::jsonb),
  ('5e000000-0000-4000-8000-000000000111', '5e000000-0000-4000-8000-000000000004',
   'tw-twse-openapi-insider-holdings', 'TWSE OpenAPI director and supervisor shareholdings',
   'issuer_fundamentals_interface',
   'https://openapi.twse.com.tw/v1/opendata/t187ap11_L', true,
   'public_unauthenticated', 'production_approved', 'permitted', 'permitted',
   'Director and supervisor shareholding balances per company, including pledged shares and related-party holdings. A float input and never a float population: strategic corporate holders, cross-holdings and government stakes appear in neither this endpoint nor the major-shareholder one, which publishes names above ten percent without percentages.',
   '{"reviewed_on": "2026-09-17", "documents": [{"title": "TWSE OpenAPI service metadata (info.description)", "url": "https://openapi.twse.com.tw/v1/swagger.json", "retrieved_on": "2026-09-17", "clauses": [{"axis": "collection", "text": "本平臺提供臺灣證券交易所服務API，歡迎各位介接使用。"}, {"axis": "data_use", "text": "[授權說明網址](https://data.gov.tw/license)", "note": "Same licence as the daily prices."}]}]}'::jsonb);

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use, covers_internal_use, covers_index_calculation,
   covers_storage, covers_historical_retention, covers_post_termination_retention,
   covers_historical_reconstruction, covers_index_level_publication,
   covers_constituent_publication, covers_weight_publication,
   covers_membership_change_publication, covers_raw_redistribution,
   rights_layer, termination_obligation, covered_venues,
   attribution_required, attribution_text,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
select g.id, g.iface, 'provider_terms',
   'Taiwan Open Government Data License v1.0, https://data.gov.tw/license, declared by the TWSE OpenAPI service metadata and retrieved 17 September 2026',
   true, true, true, true, true, true, true, true, true, true, true, true, true,
   'exchange', 'none', array['XTAI']::text[],
   true,
   '資料來源：臺灣證券交易所 (Source: Taiwan Stock Exchange Corporation). Open data released under the Open Government Data License, https://data.gov.tw/license',
   timestamptz '2026-09-17T00:00:00Z',
   'Same licence and platform as the Phase 5.3 daily price interface.',
   'The Data Providing Organization grants User a perpetual, worldwide, non-exclusive, irrevocable, royalty-free copyright license to reproduce, distribute, publicly transmit, publicly broadcast, publicly recite, publicly present, publicly perform, compile, adapt to the Open Data provided for any purpose, including but not limited to making all kinds of Derivative Works either as products or services.',
   'Urdais research', date '2026-09-17'
from (values
  ('5e000000-0000-4000-8000-000000000209'::uuid, '5e000000-0000-4000-8000-000000000109'::uuid),
  ('5e000000-0000-4000-8000-000000000210'::uuid, '5e000000-0000-4000-8000-000000000110'::uuid),
  ('5e000000-0000-4000-8000-000000000211'::uuid, '5e000000-0000-4000-8000-000000000111'::uuid)
) as g(id, iface);
