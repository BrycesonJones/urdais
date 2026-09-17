-- Filing sources for AI Equity Universe eligibility evidence, with their terms reviewed.
--
-- The founder decision behind Phase 5 is that Urdais builds from publicly obtainable sources
-- rather than waiting for vendors. The guardrail is that "publicly accessible" is not the same
-- fact as "automated collection is permitted", and the four systems below divide cleanly on
-- exactly that line. Recording the division is the point: it is what stops the project from
-- replacing vendor dependence with undocumented scraping.
--
--   SEC EDGAR      automated retrieval expressly contemplated, with conditions
--   OpenDART (KR)  an official API, keyed, with published terms
--   HKEXnews (HK)  automated retrieval expressly prohibited -> manual evidence only
--   TWSE MOPS (TW) terms not located -> review pending, manual evidence only
--
-- Nothing here is approved for production. EDGAR's collection axis is permitted and its data-use
-- axis is not, so it sits at production_review_pending: the registry's two-axis gate does the
-- arguing rather than a comment.

-- A filings repository is not an offer interface, a price catalog or a terms page, and calling
-- it one would make the source_class column a lie in the one place it is most load-bearing.
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
    -- Statutory filing systems: issuer-authored content, access terms set by the operator.
    'regulatory_filing_repository'
  ));

comment on column reference.source_interfaces.source_class is
  'What kind of thing Urdais reads. regulatory_filing_repository covers statutory filing systems such as EDGAR, OpenDART, HKEXnews and MOPS, whose content is issuer-authored and whose access terms are set by the operator.';

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('5e000000-0000-4000-8000-000000000001', 'us-sec',
   'U.S. Securities and Exchange Commission', 'other', 'https://www.sec.gov'),
  ('5e000000-0000-4000-8000-000000000002', 'kr-fss',
   'Financial Supervisory Service (Korea)', 'other', 'https://engopendart.fss.or.kr'),
  ('5e000000-0000-4000-8000-000000000003', 'hkex-news',
   'Hong Kong Exchanges and Clearing Limited', 'other', 'https://www.hkexnews.hk'),
  ('5e000000-0000-4000-8000-000000000004', 'tw-twse-mops',
   'Taiwan Stock Exchange Corporation', 'other', 'https://emops.twse.com.tw')
on conflict (slug) do nothing;

-- ------------------------------------------------------------------------- SEC EDGAR
--
-- Collection: permitted, with two published conditions. The access page states "Please declare
-- your user agent in request headers" and "Current max request rate: 10 requests/second", and
-- asks callers to "use efficient scripting" so that everyone has "equitable access".
--
-- Data use: the page says the information may be downloaded for free and does not address
-- redistribution, retention or commercial use. Silence is not permission, so that axis stays
-- under review. Separately, EDGAR filings are issuer-authored works made publicly available by
-- the Commission; quoting a passage with attribution is ordinary citation, and republishing a
-- filing wholesale is a different act that Urdais does not intend and has not cleared.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state, notes)
values
  ('5e000000-0000-4000-8000-000000000101', '5e000000-0000-4000-8000-000000000001',
   'sec-edgar-filings', 'SEC EDGAR filing archives', 'regulatory_filing_repository',
   'https://www.sec.gov/os/accessing-edgar-data', true,
   'public_unauthenticated', 'production_review_pending', 'permitted', 'under_review',
   'Collection permitted subject to a declared User-Agent and a 10 requests/second ceiling. Data use unaddressed by the access policy and therefore not established: Urdais quotes passages with attribution and does not republish filings.')
on conflict (slug) do nothing;

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use,
   covers_internal_use, covers_index_calculation, covers_storage, covers_historical_retention,
   covers_post_termination_retention, covers_historical_reconstruction,
   covers_raw_redistribution, rights_layer, termination_obligation,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
values
  ('5e000000-0000-4000-8000-000000000201',
   '5e000000-0000-4000-8000-000000000101', 'provider_terms',
   'SEC, Accessing EDGAR Data, https://www.sec.gov/os/accessing-edgar-data, retrieved 17 September 2026',
   true, true,
   true, true, true, true, true, true,
   false, 'regulator', 'none',
   timestamptz '2026-09-17T00:00:00Z',
   'SEC EDGAR access policy, retrieved 17 September 2026. Collection conditions are published; redistribution is not addressed and is not claimed.',
   'Please declare your user agent in request headers ... Current max request rate: 10 requests/second. ... To ensure everyone has equitable access to SEC EDGAR content, please use efficient scripting.',
   'Urdais research', date '2026-09-17');

-- ---------------------------------------------------------------------------- OpenDART
--
-- An official Financial Supervisory Service API. Anyone may register; access is by an
-- authentication key issued per member, with a published daily call ceiling. The terms do not
-- address commercial use or restrict a member's retention of what it downloads, so those axes
-- are recorded as not established rather than as permission.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state, notes)
values
  ('5e000000-0000-4000-8000-000000000102', '5e000000-0000-4000-8000-000000000002',
   'kr-opendart-api', 'OpenDART disclosure information Open API', 'regulatory_filing_repository',
   'https://engopendart.fss.or.kr/intro/terms.do', true,
   'api_key', 'production_review_pending', 'under_review', 'under_review',
   'Official FSS Open API. Requires a per-member authentication key which may not be shared with a third party; a daily call ceiling is published on the site. Terms effective 21 January 2020 are silent on commercial use and on member retention. No key has been registered, so no retrieval has occurred.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------- HKEXnews
--
-- The decisive case, and the reason manual evidence capture exists in this phase. HKEX's terms
-- of use prohibit automated access in terms, and restrict use of the information to personal
-- purposes. Urdais does not scrape it. Eligibility evidence for Hong Kong filings is captured by
-- a human reading the document, which is slower and is the honest alternative to routing around
-- a restriction the operator wrote down.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, notes)
values
  ('5e000000-0000-4000-8000-000000000103', '5e000000-0000-4000-8000-000000000003',
   'hkexnews-filings', 'HKEXnews listed company filings', 'regulatory_filing_repository',
   'https://www2.hkexnews.hk/Global/Exchange/Terms-of-Use?sc_lang=en', false,
   'documentation', 'production_blocked', 'not_permitted', 'not_permitted', true,
   'Automated retrieval is expressly prohibited and use is restricted to personal purposes. HKEX publishes a written-consent route at info@hkex.com.hk, which Urdais has not pursued. Hong Kong evidence is captured manually until that changes.')
on conflict (slug) do nothing;

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use,
   covers_internal_use, covers_index_calculation, covers_storage,
   covers_raw_redistribution, rights_layer, termination_obligation,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
values
  ('5e000000-0000-4000-8000-000000000202',
   '5e000000-0000-4000-8000-000000000103', 'provider_terms',
   'HKEX Terms of Use, https://www2.hkexnews.hk/Global/Exchange/Terms-of-Use?sc_lang=en, retrieved 17 September 2026',
   false, false,
   false, false, false,
   false, 'exchange', 'unspecified',
   timestamptz '2026-09-17T00:00:00Z',
   'HKEX Terms of Use, retrieved 17 September 2026. Recorded as a refusal so the absence of automated collection is a fact in the registry rather than an omission.',
   'You are not permitted to conduct, facilitate, enable, authorise or permit any text or data mining or web scraping in relation to this Website',
   'Urdais research', date '2026-09-17');

-- --------------------------------------------------------------------------- TWSE MOPS
--
-- Taiwan's statutory disclosure system, jointly administered by TWSE and TPEx. Its access terms
-- were not located in this phase, and an unreviewed source is not an open one: recorded as
-- not_reviewed and blocked from production, with manual capture as the interim path.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state, notes)
values
  ('5e000000-0000-4000-8000-000000000104', '5e000000-0000-4000-8000-000000000004',
   'tw-mops-filings', 'Market Observation Post System (MOPS)', 'regulatory_filing_repository',
   'https://emops.twse.com.tw/server-java/t58query', false,
   'unknown', 'production_review_pending', 'not_reviewed', 'not_reviewed',
   'Taiwan''s statutory disclosure system. Access terms were not located in this phase, so neither axis is settled and the interface is review-pending rather than blocked: blocking is reserved for a prohibition someone has actually read. It cannot reach production either way, because approval requires permitted terms on both axes. Manual capture only in the meantime.')
on conflict (slug) do nothing;

-- --------------------------------------------------------------- dated terms evidence
--
-- Every reviewed interface records when its terms were read and which clauses the reading
-- turned on, so that a later reader can check the conclusion instead of inheriting it. Two of
-- the four rows below record that nothing was found, which is a review outcome and not a gap.

update reference.source_interfaces set terms_evidence = '{
  "reviewed_on": "2026-09-17",
  "documents": [{
    "title": "Accessing EDGAR Data",
    "url": "https://www.sec.gov/os/accessing-edgar-data",
    "retrieved_on": "2026-09-17",
    "clauses": [
      {"axis": "collection", "text": "Please declare your user agent in request headers"},
      {"axis": "collection", "text": "Current max request rate: 10 requests/second"},
      {"axis": "collection", "text": "To ensure everyone has equitable access to SEC EDGAR content, please use efficient scripting."},
      {"axis": "data_use", "text": "not addressed",
       "note": "The access policy addresses how to retrieve and says nothing about redistribution, retention or commercial use. Recorded as under review rather than permitted."}
    ]
  }]
}'::jsonb
where slug = 'sec-edgar-filings';

update reference.source_interfaces set terms_evidence = '{
  "reviewed_on": "2026-09-17",
  "documents": [{
    "title": "HKEX Terms of Use",
    "url": "https://www2.hkexnews.hk/Global/Exchange/Terms-of-Use?sc_lang=en",
    "retrieved_on": "2026-09-17",
    "clauses": [
      {"axis": "collection", "text": "You are not permitted to conduct, facilitate, enable, authorise or permit any text or data mining or web scraping in relation to this Website"},
      {"axis": "data_use", "text": "restricted to personal purposes",
       "note": "Use of the information is limited in terms, which forecloses the data-use axis independently of the collection prohibition."},
      {"axis": "both", "text": "written consent route published at info@hkex.com.hk",
       "note": "A consent path exists and Urdais has not pursued it. Until it does, manual reading is the only route."}
    ]
  }]
}'::jsonb
where slug = 'hkexnews-filings';

update reference.source_interfaces set terms_evidence = '{
  "reviewed_on": "2026-09-17",
  "documents": [{
    "title": "OpenDART terms of use",
    "url": "https://engopendart.fss.or.kr/intro/terms.do",
    "version_date": "2020-01-21",
    "retrieved_on": "2026-09-17",
    "clauses": [
      {"axis": "collection", "text": "access is by an authentication key issued to a member, which the member may not transfer or share",
       "note": "An official API with a published daily call ceiling. Collection through it is contemplated; Urdais has registered no key, so nothing has been retrieved."},
      {"axis": "data_use", "text": "not addressed",
       "note": "Commercial use and member retention are not addressed by the terms as read. Silence is recorded as under review."}
    ]
  }]
}'::jsonb
where slug = 'kr-opendart-api';

update reference.source_interfaces set terms_evidence = '{
  "reviewed_on": "2026-09-17",
  "documents": [{
    "title": "Market Observation Post System (MOPS)",
    "url": "https://emops.twse.com.tw/server-java/t58query",
    "retrieved_on": "2026-09-17",
    "clauses": [
      {"axis": "both", "text": "terms not located",
       "note": "A published terms-of-use document governing access to MOPS was not located in this phase. The review happened and found nothing, which is why the interface is not_reviewed and blocked rather than treated as open."}
    ]
  }]
}'::jsonb
where slug = 'tw-mops-filings';
