-- End-of-day equity price sources, reviewed on both axes.
--
-- The source hierarchy applied, in order: official exchange source, then official regulator or
-- government source, then exchange-hosted historical files, then a public provider whose terms
-- expressly permit the use. Consumer quote pages and developer-tier market-data APIs were not
-- reached, and Phase 2C already recorded why the latter are structurally disqualified -- they
-- oblige deletion on termination and forbid index creation, and those restrictions originate at
-- the exchange and SRO layer, so changing vendor does not change the answer.
--
-- Two venues were reviewed and they came out opposite, which is the useful part:
--
--   XTAI  Taiwan Stock Exchange   official OpenAPI, Open Government Data License, full grant
--                                 with attribution as a condition -> approved for production
--   XNAS  Nasdaq                  website terms refuse collection, storage, derivative works
--                                 and commercial use -> blocked, no public source
--
-- XNAS is the venue both currently eligible issuers list on. Recording it as blocked rather than
-- reaching for a consumer quote page is the whole point of the exercise: the pipeline is proven
-- against the venue where the rights exist, and the venue where they do not is a documented gap.

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface',
    'catalog_price_interface',
    'availability_interface',
    'product_reference_documentation',
    'hardware_reference_documentation',
    'provider_terms_documentation',
    'price_surface',
    'news_feed',
    'statistical_dataset',
    'exchange_rate_series',
    'chain_data_interface',
    'spot_price_interface',
    'usage_dataset_interface',
    'benchmark_dataset_interface',
    'regulatory_filing_repository',
    -- Official end-of-day equity closes, published by the venue that set them.
    'equity_eod_price_interface'
  ));

-- ------------------------------------------------------- XTAI: Taiwan Stock Exchange OpenAPI
--
-- The provider already exists from the Phase 5.2 filing-source review, where TWSE's MOPS filing
-- system was recorded as terms-not-located. This is a different system by the same operator, and
-- it resolves differently, which is why rights live on the interface and not on the provider.
--
-- Collection: the API's own metadata says "本平臺提供臺灣證券交易所服務API，歡迎各位介接使用" --
-- this platform provides TWSE service APIs, everyone is welcome to connect and use them. That is
-- an affirmative invitation to programmatic access from the operator, published at the endpoint.
--
-- Data use: the same metadata links its licence as https://data.gov.tw/license, the Open
-- Government Data License v1.0, whose clause 2.1 grants "a perpetual, worldwide, non-exclusive,
-- irrevocable, royalty-free copyright license to reproduce, distribute, publicly transmit ...
-- compile, adapt to the Open Data provided for any purpose, including but not limited to making
-- all kinds of Derivative Works either as products or services". An index is a derivative work
-- and a product, so this reaches calculation and publication, not merely internal use.
--
-- The condition: clause 3.2 requires attribution and states that "If User fails to comply with
-- the attribution requirement, the rights granted under this License shall be deemed to have
-- been void ab initio". Attribution is therefore not a courtesy here -- an unattributed
-- observation was never lawfully collected -- which is why it is enforced in the price gate.
--
-- Not relied on: the metadata also links a 使用條款 page at www.twse.com.tw, which did not
-- resolve from the review environment. The licence declaration above is published in the API's
-- own metadata and is what this grant rests on; the unread page is recorded as a known gap
-- rather than summarised from memory.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state, notes,
   terms_evidence)
values
  ('5e000000-0000-4000-8000-000000000105', '5e000000-0000-4000-8000-000000000004',
   'tw-twse-openapi-daily', 'TWSE OpenAPI daily trading information',
   'equity_eod_price_interface',
   'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', true,
   'public_unauthenticated', 'production_approved', 'permitted', 'permitted',
   'Official TWSE OpenAPI. Publishes the daily official close for every listed stock, and a separate market open/close calendar that makes an exchange holiday distinguishable from a missing observation. Licensed under the Taiwan Open Government Data License v1.0 with attribution as a condition of the grant. The 使用條款 page linked alongside the licence did not resolve from the review environment and was not read.',
   '{
     "reviewed_on": "2026-09-17",
     "documents": [{
       "title": "TWSE OpenAPI service metadata (info.description)",
       "url": "https://openapi.twse.com.tw/v1/swagger.json",
       "retrieved_on": "2026-09-17",
       "clauses": [
         {"axis": "collection", "text": "本平臺提供臺灣證券交易所服務API，歡迎各位介接使用。",
          "note": "This platform provides TWSE service APIs; everyone is welcome to connect and use them. An affirmative invitation to programmatic access, published by the operator at the endpoint."},
         {"axis": "data_use", "text": "[授權說明網址](https://data.gov.tw/license)",
          "note": "The API declares its own licence as the Taiwan Open Government Data License."}
       ]
     }, {
       "title": "Open Government Data License, version 1.0",
       "url": "https://data.gov.tw/license",
       "retrieved_on": "2026-09-17",
       "clauses": [
         {"axis": "data_use", "text": "The Data Providing Organization grants User a perpetual, worldwide, non-exclusive, irrevocable, royalty-free copyright license to reproduce, distribute, publicly transmit, publicly broadcast, publicly recite, publicly present, publicly perform, compile, adapt to the Open Data provided for any purpose, including but not limited to making all kinds of Derivative Works either as products or services."},
         {"axis": "data_use", "text": "User can sublicense the copyrights which he/she is granted through 2.1. to others."},
         {"axis": "both", "text": "When User makes use of the Open Data and its Derivative Work, he/she must make an explicit notice of statement as attribution requested in the Exhibit below by the Data Providing Organization. If User fails to comply with the attribution requirement, the rights granted under this License shall be deemed to have been void ab initio.",
          "note": "Attribution is a condition of the grant, not a courtesy. Enforced by pipeline.check_price_observation()."}
       ]
     }, {
       "title": "TWSE 使用條款",
       "url": "https://www.twse.com.tw/zh/page/terms/use.html",
       "retrieved_on": null,
       "clauses": [
         {"axis": "both", "text": "not read",
          "note": "Linked from the API metadata alongside the licence. The host did not resolve from the review environment, so this document was not retrieved and nothing is claimed about its contents. A known gap in an otherwise settled review."}
       ]
     }]
   }'::jsonb);

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use,
   covers_internal_use, covers_index_calculation, covers_storage, covers_historical_retention,
   covers_post_termination_retention, covers_historical_reconstruction,
   covers_index_level_publication, covers_constituent_publication, covers_weight_publication,
   covers_membership_change_publication, covers_raw_redistribution,
   rights_layer, termination_obligation, covered_venues,
   attribution_required, attribution_text,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
values
  ('5e000000-0000-4000-8000-000000000205', '5e000000-0000-4000-8000-000000000105',
   'provider_terms',
   'Taiwan Open Government Data License v1.0, https://data.gov.tw/license, declared by the TWSE OpenAPI service metadata and retrieved 17 September 2026',
   true, true,
   true, true, true, true,
   -- Post-termination retention and historical reconstruction follow from a licence that is
   -- perpetual and irrevocable by its own words. This is the axis the Phase 4 vendor review
   -- found nobody would grant, and an open government licence grants it outright.
   true, true,
   -- Publication of level, constituents, weights and membership changes all follow from a grant
   -- that reaches derivative works "as products or services" and permits sublicensing. Recorded
   -- as separate axes even though one clause carries them, because the axes are the question.
   true, true, true, true,
   -- Raw redistribution is included: clause 2.1 permits reproduction and distribution of the
   -- Open Data itself, and 2.2 permits sublicensing. Urdais does not intend to republish the
   -- source data wholesale, but the right is established rather than assumed absent.
   true,
   'exchange', 'none', array['XTAI']::text[],
   true,
   '資料來源：臺灣證券交易所 (Source: Taiwan Stock Exchange Corporation). Open data released under the Open Government Data License, https://data.gov.tw/license',
   timestamptz '2026-09-17T00:00:00Z',
   'Open Government Data License v1.0 as declared by the TWSE OpenAPI metadata, retrieved 17 September 2026. A full grant for any purpose including derivative works as products or services, conditional on attribution.',
   'The Data Providing Organization grants User a perpetual, worldwide, non-exclusive, irrevocable, royalty-free copyright license to reproduce, distribute, publicly transmit, publicly broadcast, publicly recite, publicly present, publicly perform, compile, adapt to the Open Data provided for any purpose, including but not limited to making all kinds of Derivative Works either as products or services.',
   'Urdais research', date '2026-09-17');

-- The holiday calendar is the same platform under the same licence, registered separately
-- because it answers a different question: whether there was a session at all.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state, notes,
   terms_evidence)
values
  ('5e000000-0000-4000-8000-000000000106', '5e000000-0000-4000-8000-000000000004',
   'tw-twse-openapi-holidays', 'TWSE OpenAPI market open and close calendar',
   'equity_eod_price_interface',
   'https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule', true,
   'public_unauthenticated', 'production_approved', 'permitted', 'permitted',
   'The venue''s own trading calendar, under the same Open Government Data License as the daily prices. Without it an exchange holiday and a failed retrieval are indistinguishable, and the difference decides whether a gap is recorded as a session that did not happen or as a source that could not be read.',
   '{
     "reviewed_on": "2026-09-17",
     "documents": [{
       "title": "TWSE OpenAPI service metadata (info.description)",
       "url": "https://openapi.twse.com.tw/v1/swagger.json",
       "retrieved_on": "2026-09-17",
       "clauses": [
         {"axis": "collection", "text": "本平臺提供臺灣證券交易所服務API，歡迎各位介接使用。",
          "note": "Same platform and same invitation as the daily price interface."},
         {"axis": "data_use", "text": "[授權說明網址](https://data.gov.tw/license)",
          "note": "Same declared licence: the Taiwan Open Government Data License, whose clause 2.1 grants derivative works for any purpose and whose clause 3.2 makes attribution a condition."}
       ]
     }]
   }'::jsonb);

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use, covers_internal_use, covers_index_calculation,
   covers_storage, covers_historical_retention, covers_post_termination_retention,
   covers_historical_reconstruction, covers_raw_redistribution,
   rights_layer, termination_obligation, covered_venues,
   attribution_required, attribution_text,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
values
  ('5e000000-0000-4000-8000-000000000206', '5e000000-0000-4000-8000-000000000106',
   'provider_terms',
   'Taiwan Open Government Data License v1.0, https://data.gov.tw/license, declared by the TWSE OpenAPI service metadata and retrieved 17 September 2026',
   true, true, true, true, true, true, true, true, true,
   'exchange', 'none', array['XTAI']::text[],
   true,
   '資料來源：臺灣證券交易所 (Source: Taiwan Stock Exchange Corporation). Open data released under the Open Government Data License, https://data.gov.tw/license',
   timestamptz '2026-09-17T00:00:00Z',
   'Same licence and same platform as the daily price interface.',
   'The Data Providing Organization grants User a perpetual, worldwide, non-exclusive, irrevocable, royalty-free copyright license to reproduce, distribute, publicly transmit, publicly broadcast, publicly recite, publicly present, publicly perform, compile, adapt to the Open Data provided for any purpose, including but not limited to making all kinds of Derivative Works either as products or services.',
   'Urdais research', date '2026-09-17');

-- ----------------------------------------------------------------------------- XNAS: Nasdaq
--
-- The venue both currently eligible issuers list on, and the one with no public source.
--
-- Nasdaq's website terms refuse every axis this pipeline needs, in terms. The licence granted to
-- a site visitor is "solely for your personal, non-commercial use". The content may not be
-- stored for subsequent use, may not have derivative works created from it, and may not form the
-- basis of products or services. Scraping and data mining are named and prohibited without
-- express written permission. An index built on Nasdaq closes is a derivative work offered as a
-- product, which is refused three separate ways.
--
-- The official close is a licensed exchange product distributed under the UTP and CTA plans.
-- There is no regulator source: the SEC publishes filings, not prices. The remedy is a written
-- data agreement with the exchange or its plan administrator, which is a procurement decision
-- and not an engineering one, and Phase 4 is the record of what that would involve.
insert into reference.providers (id, slug, name, provider_kind, website) values
  ('5e000000-0000-4000-8000-000000000005', 'nasdaq',
   'Nasdaq, Inc.', 'other', 'https://www.nasdaq.com')
on conflict (slug) do nothing;

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, notes, terms_evidence)
values
  ('5e000000-0000-4000-8000-000000000107', '5e000000-0000-4000-8000-000000000005',
   'nasdaq-com-historical-quotes', 'Nasdaq.com historical quotes',
   'equity_eod_price_interface',
   'https://www.nasdaq.com/market-activity/quotes/historical', false,
   'documentation', 'production_blocked', 'not_permitted', 'not_permitted',
   true,
   'Refused on both axes by Nasdaq''s own website terms: personal non-commercial licence only, no storage for subsequent use, no derivative works, no products or services based on the content, and scraping and data mining named as prohibited. The official close is a licensed exchange product under the UTP and CTA plans; the remedy is a written data agreement, not a different public URL.',
   '{
     "reviewed_on": "2026-09-17",
     "documents": [{
       "title": "Nasdaq.com Terms of Service",
       "url": "https://www.nasdaq.com/legal",
       "retrieved_on": "2026-09-17",
       "clauses": [
         {"axis": "data_use", "text": "Nasdaq grants you a personal, limited, revocable, non-exclusive, non-assignable, non-sublicensable and non-transferable license to use the Services solely for your personal, non-commercial use."},
         {"axis": "data_use", "text": "You may not copy, reproduce, transmit, display, perform, distribute, rent, sublicense, alter, store for subsequent use, create any derivative works from, offer products or services based on, or otherwise use in whole or in part in any manner the Content without the prior written consent of Nasdaq.",
          "note": "Storage, derivative works and products based on the content are each refused. An index is all three."},
         {"axis": "collection", "text": "without Nasdaq''s express written permission, including, but not limited to, scraping, data mining, and the use of any automated or manual process to capture or compile content for the purposes mentioned above.",
          "note": "Automated and manual capture are both named, so manual transcription is not an alternative route here as it was for HKEXnews."}
       ]
     }]
   }'::jsonb);

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use, covers_internal_use, covers_index_calculation,
   covers_storage, covers_historical_retention, covers_raw_redistribution,
   rights_layer, termination_obligation, covered_venues,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
values
  ('5e000000-0000-4000-8000-000000000207', '5e000000-0000-4000-8000-000000000107',
   'provider_terms',
   'Nasdaq.com Terms of Service, https://www.nasdaq.com/legal, retrieved 17 September 2026',
   false, false, false, false, false, false, false,
   'exchange', 'unspecified', array['XNAS']::text[],
   timestamptz '2026-09-17T00:00:00Z',
   'Recorded as a refusal so that the absence of a US price source is a fact in the registry with a citation, rather than an empty table that looks like work not yet done.',
   'You may not copy, reproduce, transmit, display, perform, distribute, rent, sublicense, alter, store for subsequent use, create any derivative works from, offer products or services based on, or otherwise use in whole or in part in any manner the Content without the prior written consent of Nasdaq.',
   'Urdais research', date '2026-09-17');
