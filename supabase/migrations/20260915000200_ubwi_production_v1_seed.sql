-- UBWI Production V1, part 3: reference data.
--
-- Registers the methodology and its version, the instrument, the statistical compilers
-- and venues behind the index, the residual model rule, the measured feasible frontier
-- and the publication gate thresholds.
--
-- What this migration deliberately does NOT do:
--
--   * It does not mark the instrument `live`. The publication gate refuses the current
--     denominator on the imputed-share ceiling, so the instrument is `launch_blocked`.
--   * It does not set any source to `production_approved`. That is an operational review
--     decision, not something a migration performs.
--   * It seeds no vintage, no calculation and no publication.
--
-- The numerator venue interfaces are registered with `not_reviewed` terms and no
-- artifact, because none has been retrieved and reviewed. Recording the absence is the
-- point: a source with no retained artifact can never read `cleared`.

-- ---------------------------------------------------------------- methodology

insert into reference.methodologies (id, slug, name, document_path) values
  ('b0b0b0b0-0000-4000-8000-000000000001', 'ubwi', 'Urdais Bitcoin Wealth Index',
   'docs/methodology/ubwi.md');

-- The content hash is the SHA-256 of docs/methodology/ubwi.md at the commit this version
-- was recorded from. src/lib/ubwi/ubwi.test.ts re-computes it from the file, so the two
-- cannot drift apart silently.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('b0b0b0b0-0000-4000-8000-000000000002', 'b0b0b0b0-0000-4000-8000-000000000001',
   '1.0.0', 'approved', 'docs/methodology/ubwi.md',
   '612613bc0e93bdbde4b897d52db354b9696b0aaf193a585d673e6e696532dda8', '2026-09-15');

insert into reference.instruments
  (id, symbol, name, category, methodology_id, output_unit, output_currency, lifecycle_status) values
  ('b0b0b0b0-0000-4000-8000-000000000003', 'UBWI', 'Urdais Bitcoin Wealth Index', 'index',
   'b0b0b0b0-0000-4000-8000-000000000001',
   -- The output unit is a percentage of Total Global Wealth. UBWI has no base date, no
   -- base value, and is never expressed in points.
   'percent_of_total_global_wealth', 'USD', 'launch_blocked');

-- UBWI has one instrument and no children, so the spec version is the methodology
-- document itself. Its hash is the same file's, salted with the spec identity so that the
-- cross-spec uniqueness check remains meaningful.
insert into reference.instrument_spec_versions
  (id, instrument_id, methodology_version_id, version, status, document_path, content_hash, effective_from) values
  ('b0b0b0b0-0000-4000-8000-000000000004', 'b0b0b0b0-0000-4000-8000-000000000003',
   'b0b0b0b0-0000-4000-8000-000000000002', '1.0.0', 'approved', 'docs/methodology/ubwi.md',
   'db75e9be0810712e990d33e541d350f3aac5320ac7ee3cc39c1cf4992dddb70b', '2026-09-15');

-- ---------------------------------------------------------------- residual model

insert into reference.wealth_estimation_rules
  (id, slug, version, description, ratio_basis, calibration_factor, calibration_source, effective_from)
values (
  'b0b0b0b0-0000-4000-8000-000000000005',
  'observed-set-ratio-cwon-tail', '1.0.0',
  'The unobserved world is valued at the observed set''s own wealth-to-GDP ratio, scaled by the ratio of ' ||
  'wealth-to-GDP between unobserved and observed economies measured in the CWON 2020 cross section. ' ||
  'Deliberately simple: Phase 2A backtested regional and income-group refinements and found they do not ' ||
  'reliably beat a single world ratio, so the rule does not invite elaborations that add opacity without accuracy.',
  'observed_set_wealth_to_gdp',
  0.762953831118869,
  'World Bank Changing Wealth of Nations 2024, non-human wealth by economy, 2020',
  '2026-09-15'
);

-- ---------------------------------------------------------------- frontier and gate

insert into reference.wealth_feasible_frontiers
  (id, measured_on, near_term_coverage, counterfactual_coverage, source_document, note)
values (
  'b0b0b0b0-0000-4000-8000-000000000006', '2026-09-14', 0.5572, 0.6293,
  'docs/research/ubwi-phase2c-denominator-hardening.md, Part 6',
  'Near-term: rights-cleared coverage reachable from national balance sheets published today. ' ||
  'Counterfactual: reachable only if nineteen further statistical offices began valuing land. ' ||
  'Quoting the counterfactual as "the frontier" would credit Urdais with statistical programmes that do not exist.'
);

insert into reference.ubwi_publication_gates
  (id, version, frontier_id, max_imputed_share, min_rights_cleared_coverage,
   max_vintage_age_years, max_vintage_dispersion_years, major_economy_disclosure_share, effective_from)
values (
  'b0b0b0b0-0000-4000-8000-000000000007', '1.0.0', 'b0b0b0b0-0000-4000-8000-000000000006',
  -- The binding bound. <= 25 % requires 68.44 % coverage and <= 35 % requires 57.31 %;
  -- both exceed the 55.72 % frontier. 40 % is the tightest satisfiable bound.
  0.40,
  -- The same constraint stated in the other unit; derived, not chosen as a round number.
  0.52,
  4, 4, 0.03, '2026-09-15'
);

-- ---------------------------------------------------------------- sources

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('b1b1b1b1-0000-4000-8000-000000000001', 'federal-reserve-board', 'Board of Governors of the Federal Reserve System', 'statistical_compiler', 'https://www.federalreserve.gov'),
  ('b1b1b1b1-0000-4000-8000-000000000002', 'eurostat',              'Eurostat',                                        'statistical_compiler', 'https://ec.europa.eu/eurostat'),
  ('b1b1b1b1-0000-4000-8000-000000000003', 'oecd',                  'OECD',                                            'statistical_compiler', 'https://www.oecd.org'),
  ('b1b1b1b1-0000-4000-8000-000000000004', 'ons-uk',                'Office for National Statistics',                  'statistical_compiler', 'https://www.ons.gov.uk'),
  ('b1b1b1b1-0000-4000-8000-000000000005', 'statistics-canada',     'Statistics Canada',                               'statistical_compiler', 'https://www.statcan.gc.ca'),
  ('b1b1b1b1-0000-4000-8000-000000000006', 'cao-esri-japan',        'Cabinet Office ESRI (Japan)',                     'statistical_compiler', 'https://www.esri.cao.go.jp'),
  ('b1b1b1b1-0000-4000-8000-000000000007', 'abs-australia',         'Australian Bureau of Statistics',                 'statistical_compiler', 'https://www.abs.gov.au'),
  ('b1b1b1b1-0000-4000-8000-000000000008', 'istat',                 'Istat',                                           'statistical_compiler', 'https://www.istat.it'),
  ('b1b1b1b1-0000-4000-8000-000000000009', 'cbs-netherlands',       'Centraal Bureau voor de Statistiek',              'statistical_compiler', 'https://www.cbs.nl'),
  ('b1b1b1b1-0000-4000-8000-000000000010', 'bank-of-korea',         'Bank of Korea',                                   'statistical_compiler', 'https://www.bok.or.kr'),
  ('b1b1b1b1-0000-4000-8000-000000000011', 'european-central-bank', 'European Central Bank',                           'statistical_compiler', 'https://www.ecb.europa.eu'),
  ('b1b1b1b1-0000-4000-8000-000000000012', 'blockchain-com',        'Blockchain.com',                                  'chain_data',           'https://www.blockchain.com'),
  ('b1b1b1b1-0000-4000-8000-000000000013', 'coinbase',              'Coinbase',                                        'spot_venue',           'https://www.coinbase.com'),
  ('b1b1b1b1-0000-4000-8000-000000000014', 'bitstamp',              'Bitstamp',                                        'spot_venue',           'https://www.bitstamp.net'),
  ('b1b1b1b1-0000-4000-8000-000000000015', 'kraken',                'Kraken',                                          'spot_venue',           'https://www.kraken.com');

-- Denominator and FX interfaces: permitted on both axes, each anchored to a retained,
-- hashed terms artifact. `production_access_state` stays at its default: approval is an
-- operational decision, and no migration makes it.
insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class,
  terms_review_state, data_use_terms_state, automated_retrieval_available,
  terms_artifact_url, terms_artifact_hash, terms_artifact_bytes, terms_artifact_status, terms_retrieved_at,
  notes
) values
(
  'b2b2b2b2-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001',
  'federal-reserve-z1', 'Federal Reserve Z.1 Financial Accounts', 'statistical_dataset',
  'https://www.federalreserve.gov/releases/z1/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.federalreserve.gov/disclaimer.htm',
  'e3ef8ecfbaa9773198786745ce2ccf6eb4ee6a60d3b532ffe9d6c3350d0f6e00', 85130, 200, '2026-09-14T23:13:08Z',
  'Public domain with attribution: "information on Board''s website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source of the information."'
),
(
  'b2b2b2b2-0000-4000-8000-000000000002', 'b1b1b1b1-0000-4000-8000-000000000002',
  'eurostat-nasa-nama', 'Eurostat nama_10_nfa_bs and nasa_10_f_bs', 'statistical_dataset',
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://ec.europa.eu/eurostat/web/main/help/copyright-notice',
  '795e8cc7e17d848a846f1e33f373727627c159d9d7c22344684b07b5225bdf61', 178111, 200, '2026-09-14T23:11:01Z',
  'Commercial reuse authorised with attribution, but excluding "data for countries other than" EU, EFTA and EU acceding and candidate countries. Every economy drawn from this interface is an EU Member State, so the exclusion does not bind; it is recorded so a later addition cannot silently inherit a grant that does not cover it.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000003',
  'oecd-sdmx-national-accounts', 'OECD SDMX national accounts', 'statistical_dataset',
  'https://sdmx.oecd.org/public/rest/data/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.oecd.org/en/about/terms-conditions.html',
  '686091572a8179613f1c3328d7d6291a6d73ae8db91b4ddba3523290c6924285', 1482983, 200, '2026-09-14T23:07:49Z',
  'The terms host returns HTTP 403 intermittently to the same URL that grants access. The grant is anchored to the retained artifact and corroborated by a Wayback capture. A failed re-fetch means not re-confirmed today, never no longer permitted. The NonProductionDataflow annotation appears on all 1,548 public dataflows and is not a discriminating production-status signal.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000004', 'b1b1b1b1-0000-4000-8000-000000000004',
  'ons-national-balance-sheet', 'ONS UK national balance sheet', 'statistical_dataset',
  'https://www.ons.gov.uk/economy/nationalaccounts/uksectoraccounts/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  'f5b2b9f2af63647cde889fa6c3508f5705925295b74912c68caa28dd37e64aa5', 10450, 200, '2026-09-14T23:46:43Z',
  'Open Government Licence v3.0: free to copy, publish, distribute, adapt and exploit commercially with attribution.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000005', 'b1b1b1b1-0000-4000-8000-000000000005',
  'statcan-nbsa', 'Statistics Canada National Balance Sheet Accounts', 'statistical_dataset',
  'https://www150.statcan.gc.ca/t1/wds/rest/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.statcan.gc.ca/en/reference/licence',
  '7a6a28dabb0c568dc4f7a711eb36024583f9a2983a0c9328ea3f3c35205a83c6', 26879, 200, '2026-09-14T23:44:16Z',
  'Statistics Canada Open Licence. The licence may be modified at any time effective on posting, and use is governed by the licence in force as of the access time, so the retrieval timestamp is load-bearing.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000006', 'b1b1b1b1-0000-4000-8000-000000000006',
  'esri-sna-stock', 'Cabinet Office ESRI annual national accounts, stock edition', 'statistical_dataset',
  'https://www.esri.cao.go.jp/jp/sna/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.cao.go.jp/rule.html',
  '1b544b04c32a7c58494715c21841efd909a2dd9f386d1a10900f9d6d36c49b85', 8849, 200, '2026-09-14T23:51:44Z',
  'Cabinet Office content is released under the Digital Agency Public Data Terms of Use v1.0, permitting commercial reuse with attribution. Resolution of www.esri.cao.go.jp fails on some local resolvers; that is an environment fact and never a source state.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000007', 'b1b1b1b1-0000-4000-8000-000000000007',
  'abs-asna-5204', 'ABS Australian System of National Accounts table 10', 'statistical_dataset',
  'https://www.abs.gov.au/statistics/economy/national-accounts/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.abs.gov.au/website-privacy-copyright-and-disclaimer',
  '30b612a546eac733b8d6130def4b0a040a114bb0281bd57cdf8de64a59651cc6', 98905, 200, '2026-09-14T23:10:27Z',
  'CC BY 4.0, excluding the Coat of Arms, the ABS logo, trade marks, microdata and third-party content. The published balance sheet is none of those.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000008', 'b1b1b1b1-0000-4000-8000-000000000008',
  'istat-conti-patrimoniali', 'Istat institutional sector balance sheets', 'statistical_dataset',
  'https://esploradati.istat.it/databrowser/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.istat.it/en/legal-notice/',
  'a1728dbd7f672b28a47890c88e54700bf3c1683ecd9c6ba22aeb9a2d4fce79e1', 98378, 200, '2026-09-14T23:10:29Z',
  'CC BY 4.0: share and adapt for any purpose, even commercially, with attribution.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000009', 'b1b1b1b1-0000-4000-8000-000000000009',
  'cbs-statline-85953ned', 'CBS StatLine 85953NED non-financial assets', 'statistical_dataset',
  'https://opendata.cbs.nl/ODataApi/odata/85953NED', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.cbs.nl/en-gb/about-us/website/copyright',
  'c629752ae6b8d9ca4ea4bb32072bdad663d0c3495eddc82df2c583c9de3675cb', 38956, 200, '2026-09-14T23:10:28Z',
  'CC BY 4.0 with mandatory naming of CBS as the source.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000010', 'b1b1b1b1-0000-4000-8000-000000000010',
  'bok-ecos-national-balance-sheet', 'Bank of Korea ECOS 291Y505 national balance sheet', 'statistical_dataset',
  'https://ecos.bok.or.kr/api/', true, 'api_key',
  'permitted', 'permitted', false,
  'https://www.bok.or.kr/portal/main/contents.do?menuNo=200315',
  '64e98769fbfe53bba80bfa38e21b282df5f6b2e1da9ea487798b51cdece8edfb', 391976, 200, '2026-09-14T23:57:39Z',
  'Publication rights are cleared under the Korean Public Data Act and the value is manually verified against the first-party ECOS table. An operational ECOS API key for production retrieval volumes is pending: the Bank of Korea reviews key applications rather than auto-issuing them. Whether Urdais may publish a verified reading and whether it may run a scheduled collector are two different questions, and only the second is open.'
),
(
  'b2b2b2b2-0000-4000-8000-000000000011', 'b1b1b1b1-0000-4000-8000-000000000011',
  'ecb-euro-reference-rates', 'ECB euro foreign exchange reference rates (EXR)', 'exchange_rate_series',
  'https://data-api.ecb.europa.eu/service/data/EXR/', true, 'public_unauthenticated',
  'permitted', 'permitted', true,
  'https://www.ecb.europa.eu/services/disclaimer/html/index.en.html',
  '8ec1ff8edb5d458c3b790e380ee95374665385044c33a497eb0bda9f16d433b4', 107588, 200, '2026-09-15T00:45:15Z',
  'Free use with accurate reproduction and citation of the ECB as the source; modification must be stated explicitly. Converting a national-currency stock to USD is such a modification and is disclosed on every component''s FX lineage.'
);

-- Numerator interfaces. No terms artifact has been retrieved for any of these, so both
-- axes read not_reviewed and the readiness check reports it as its own finding. The
-- research conclusion that reading public venue tickers directly removes the licensing
-- dependency of a vendor aggregate is a conclusion, not a recorded grant.
insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class,
  terms_review_state, data_use_terms_state, automated_retrieval_available, notes
) values
('b2b2b2b2-0000-4000-8000-000000000012', 'b1b1b1b1-0000-4000-8000-000000000012',
 'blockchain-info-supply', 'Blockchain.com total issued supply', 'chain_data_interface',
 'https://blockchain.info/q/totalbc', true, 'public_unauthenticated',
 'not_reviewed', 'not_reviewed', true,
 'Issued supply is a deterministic property of the chain, cross-checked against the nominal issuance schedule at the same height and against an independent tip height from mempool.space. Terms have not been retrieved or reviewed.'),
('b2b2b2b2-0000-4000-8000-000000000013', 'b1b1b1b1-0000-4000-8000-000000000013',
 'coinbase-spot', 'Coinbase BTC-USD spot price', 'spot_price_interface',
 'https://api.coinbase.com/v2/prices/BTC-USD/spot', true, 'public_unauthenticated',
 'not_reviewed', 'not_reviewed', true, 'Terms have not been retrieved or reviewed.'),
('b2b2b2b2-0000-4000-8000-000000000014', 'b1b1b1b1-0000-4000-8000-000000000014',
 'bitstamp-ticker', 'Bitstamp BTC/USD ticker', 'spot_price_interface',
 'https://www.bitstamp.net/api/v2/ticker/btcusd/', true, 'public_unauthenticated',
 'not_reviewed', 'not_reviewed', true, 'Terms have not been retrieved or reviewed.'),
('b2b2b2b2-0000-4000-8000-000000000015', 'b1b1b1b1-0000-4000-8000-000000000015',
 'kraken-ticker', 'Kraken XBT/USD ticker', 'spot_price_interface',
 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD', true, 'public_unauthenticated',
 'not_reviewed', 'not_reviewed', true, 'Terms have not been retrieved or reviewed.');

-- Nothing is approved, nothing is live, nothing is published.
do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved'
     and source_class in ('statistical_dataset', 'exchange_rate_series',
                          'chain_data_interface', 'spot_price_interface');
  if n <> 0 then raise exception 'a UBWI source became production-approved, which this migration must never do (found %)', n; end if;
  select count(*) into n from reference.instruments where symbol = 'UBWI' and lifecycle_status = 'launch_blocked';
  if n <> 1 then raise exception 'UBWI must be launch_blocked until the publication gate passes'; end if;
  select count(*) into n from pipeline.ubwi_publications;
  if n <> 0 then raise exception 'a UBWI publication exists'; end if;
end
$$;
