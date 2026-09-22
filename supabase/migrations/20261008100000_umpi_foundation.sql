-- UMPI Phase 3: the production foundation for the two monthly official-data DRAM series.
--
-- This migration ingests nothing. It creates canonical identity, source registration, rights
-- determinations, evidence storage, a run model, a derived-base store and a publication layer,
-- and it stops there. No observation, no base value, no publication row is written here.
--
-- WHAT IS REUSED, because reuse is the point of this phase:
--
--   * `reference.providers` / `reference.source_interfaces` -- the source registry.
--   * `reference.source_rights_classifications` / `source_use_purposes` / `source_use_permissions`
--     -- the generic reviewed-rights model built for planning forecasts. UMPI adds purposes to
--     the shared vocabulary rather than inventing a UMPI-only rights table.
--   * `reference.methodologies` / `reference.methodology_versions` -- the draft is registered,
--     with no effective date, exactly as the interconnection-queue analytics draft is.
--   * `pipeline.source_retrievals` -- every UMPI retrieval is one of these. No UMPI retrieval
--     table exists and none is needed.
--   * `pipeline.allow_only_supersession()` -- the existing append-only guard.
--
-- WHAT IS NEW, and why each one is:
--
--   * `reference.umpi_series`        -- the two canonical published series. No existing table
--                                      describes a monthly official index: `reference.instruments`
--                                      is a compute-hardware identity bound to UCPI spec versions.
--   * `reference.umpi_source_series` -- the source-side identity. Its reason to exist is the
--                                      Phase 2C finding that item code `30911201AA` means DRAM in
--                                      BOTH `404Y016` (producer prices) and `402Y016` (export
--                                      prices) while returning different numbers. A BOK series is
--                                      identified by (stat_code, item_code, cycle) plus group
--                                      dimensions, and this table makes that a constraint.
--   * `pipeline.umpi_ingestion_runs` -- `pipeline.calculation_runs` is bound to
--                                      `reference.instruments` and to a daily UTC window whose
--                                      arithmetic is checked in SQL. A monthly statistical
--                                      ingestion cannot satisfy that constraint, so it gets its
--                                      own run table rather than a loosened shared one.
--   * `pipeline.umpi_observations`   -- source evidence, append-only, vintaged. One table with a
--                                      discriminator rather than two, because the vintage and
--                                      supersession machinery is identical and the raw payload
--                                      differs; conditional constraints keep the two shapes from
--                                      contaminating each other.
--   * `pipeline.umpi_index_bases`    -- the Series B rebasing base is a derived quantity every
--                                      published point depends on. It needs its own lineage.
--   * `pipeline.umpi_publications`   -- the published point. Follows `pipeline.utvi_publications`
--                                      and `pipeline.ubwi_publications`; per-product publication
--                                      tables are the established convention.

-- --------------------------------------------------------------- shared registry vocabulary

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface', 'catalog_price_interface', 'availability_interface',
    'product_reference_documentation', 'hardware_reference_documentation',
    'provider_terms_documentation', 'price_surface', 'news_feed', 'statistical_dataset',
    'exchange_rate_series', 'chain_data_interface', 'spot_price_interface',
    'usage_dataset_interface', 'benchmark_dataset_interface', 'regulatory_filing_repository',
    'equity_eod_price_interface', 'issuer_fundamentals_interface',
    'power_system_operational_data', 'power_system_planning_forecast',
    'power_system_capacity_assessment', 'interconnection_queue',
    -- An official statistical agency's own index series, published on a fixed cadence.
    'official_statistical_series',
    -- Official customs or trade statistics: declared value and quantity by commodity code.
    'official_trade_statistics',
    -- An official commodity-classification reference file. Not a measurement.
    'official_classification_reference'
  ));

-- Two purposes the planning vocabulary does not cover, named for what they actually are. The
-- planning purposes are about forecast values; these are about a statistical agency's index
-- level and about an index Urdais derives from official inputs.
insert into reference.source_use_purposes (code, display_name, is_public, description) values
  ('public_official_series_display', 'Public display of an official statistical series', true,
   'An official agency''s own published series values may be shown publicly, attributed to the agency.'),
  ('public_derived_index_display', 'Public display of a derived index', true,
   'An index Urdais calculated from official inputs may be shown publicly, labelled as a Urdais derivation.')
on conflict (code) do nothing;

-- ------------------------------------------------------------------------------- providers

-- The Bank of Korea is already registered: UBWI reads its national balance sheet. UMPI reads a
-- different interface from the same institution, so the provider row is reused rather than
-- duplicated, and its existing `provider_kind` is left exactly as UBWI recorded it.
insert into reference.providers (slug, name, provider_kind, website) values
  ('bank-of-korea', 'Bank of Korea', 'statistical_compiler', 'https://ecos.bok.or.kr/'),
  ('korea-customs-service', 'Korea Customs Service', 'government_agency', 'https://www.data.go.kr/')
on conflict (slug) do nothing;

-- ------------------------------------------------------------------------ source interfaces
--
-- `production_access_state` stays `research_usable`: Phase 3 performs no retrieval, and a
-- source becomes production-approved when a collector has actually run against it under a
-- reviewed key, not when a migration says so.

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable, access_class,
   production_access_state, terms_review_state, data_use_terms_state, written_agreement_required, notes, terms_evidence, metadata)
values
  ('98000000-0000-4000-8000-000000000011',
   (select id from reference.providers where slug = 'bank-of-korea'),
   'bok-ecos-producer-price-commodity', 'Bank of Korea ECOS producer price index by commodity',
   'official_statistical_series', 'https://ecos.bok.or.kr/api/', true, 'api_key',
   'research_usable', 'permitted', 'permitted', false,
   'ECOS StatisticSearch over statistic table 404Y016. Verified live 2026-09-22: item 30911201AA is named DRAM, unit 2020=100, monthly, 199501 onward.',
   '{"reviewed_on": "2026-09-22", "documents": [{"url": "https://www.bok.or.kr/portal/main/contents.do?menuNo=200228", "title": "한국은행 저작권보호방침 (Bank of Korea copyright policy)", "version_date": "retrieved 2026-09-22", "clauses": [{"axis": "collection", "text": "제공대상 공공데이터는 별도의 절차 없이 자유롭게 이용할 수 있습니다", "note": "Designated public data is freely usable without a separate procedure."}, {"axis": "data_use", "text": "출처가 한국은행임을 반드시 밝혀야 하며", "note": "Attribution to the Bank of Korea is mandatory on every surface."}, {"axis": "data_use", "text": "수정, 변경, 가공할 경우에도 이를 분명히 밝혀야 합니다", "note": "Modification or processing must be disclosed. The Urdais MoM is labelled as a Urdais calculation."}]}, {"url": "https://ecos.bok.or.kr/api/", "title": "ECOS Open API", "retrieved_on": "2026-09-22", "note": "Metadata endpoints StatisticTableList/StatisticItemList/StatisticSearch confirmed 404Y016 / 30911201AA / M, unit 2020=100, 199501-202608. Production retrieval requires a registered API key."}]}'::jsonb,
   jsonb_build_object(
     'source_system', 'ECOS',
     'agency', 'Bank of Korea',
     'stat_code', '404Y016',
     'stat_name', '4.1.1.3. 생산자물가지수(품목별)',
     'release_pattern', 'monthly, approximately three weeks after month end, preliminary then revised',
     'cadence', 'monthly',
     'api_key_env', 'UMPI_ECOS_API_KEY',
     'metadata_endpoints', jsonb_build_array('StatisticTableList', 'StatisticItemList', 'StatisticSearch')
   )),
  ('98000000-0000-4000-8000-000000000012',
   (select id from reference.providers where slug = 'korea-customs-service'),
   'kcs-item-country-trade', 'Korea Customs item and country export/import statistics',
   'official_trade_statistics', 'https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList', true, 'api_key',
   'research_usable', 'permitted', 'permitted', false,
   'data.go.kr dataset 15100475. Export fields expDlr (declared USD, FOB) and expWgt (kg). No piece count is in the response specification.',
   '{"reviewed_on": "2026-09-22", "documents": [{"url": "https://www.data.go.kr/data/15100475/openapi.do", "title": "공공데이터포털 dataset 15100475 (Korea Customs Service)", "retrieved_on": "2026-09-22", "clauses": [{"axis": "both", "text": "이용허락범위 제한 없음", "note": "The portal''s unrestricted use-permission field: commercial use and derivative works permitted. Attribution is retained as Urdais policy and as accurate representation."}]}]}'::jsonb,
   jsonb_build_object(
     'source_system', 'data.go.kr',
     'agency', 'Korea Customs Service',
     'dataset_id', '15100475',
     'hs_code', '8542321010',
     'use_permission_field', '이용허락범위 제한 없음',
     'cadence', 'monthly',
     'release_pattern', 'monthly, approximately the 15th of the following month',
     'api_key_env', 'UMPI_DATA_GO_KR_SERVICE_KEY',
     'export_value_field', 'expDlr',
     'export_weight_field', 'expWgt'
   )),
  ('98000000-0000-4000-8000-000000000013',
   (select id from reference.providers where slug = 'korea-customs-service'),
   'kcs-item-trade-gw', 'Korea Customs export/import statistics by item',
   'official_trade_statistics', 'https://www.data.go.kr/data/15101609/openapi.do', true, 'api_key',
   'research_usable', 'permitted', 'permitted', false,
   'data.go.kr dataset 15101609. Item totals without the country dimension. Registered as the alternate route to the same monthly figures; not required by V1.',
   '{"reviewed_on": "2026-09-22", "documents": [{"url": "https://www.data.go.kr/data/15101609/openapi.do", "title": "공공데이터포털 dataset 15101609 (Korea Customs Service)", "retrieved_on": "2026-09-22", "clauses": [{"axis": "both", "text": "이용허락범위 제한 없음", "note": "The portal''s unrestricted use-permission field: commercial use and derivative works permitted. Attribution is retained as Urdais policy and as accurate representation."}]}]}'::jsonb,
   jsonb_build_object(
     'source_system', 'data.go.kr',
     'agency', 'Korea Customs Service',
     'dataset_id', '15101609',
     'use_permission_field', '이용허락범위 제한 없음',
     'cadence', 'monthly',
     'api_key_env', 'UMPI_DATA_GO_KR_SERVICE_KEY'
   )),
  ('98000000-0000-4000-8000-000000000014',
   (select id from reference.providers where slug = 'korea-customs-service'),
   'kcs-hs-code-reference', 'Korea Customs HS code classification file',
   'official_classification_reference', 'https://www.data.go.kr/data/15049722/fileData.do', false, 'public_unauthenticated',
   'research_usable', 'permitted', 'permitted', false,
   'data.go.kr dataset 15049722. Classification reference only: it carries no measurement and backs no observation. Licence differs from the trade APIs -- KOGL Type 1 attribution rather than the unrestricted-use field.',
   '{"reviewed_on": "2026-09-22", "documents": [{"url": "https://www.data.go.kr/data/15049722/fileData.do", "title": "관세청_HS부호 (Korea Customs HS code file)", "retrieved_on": "2026-09-22", "clauses": [{"axis": "both", "text": "공공저작물 : 출처표시 (제 1유형)", "note": "KOGL Type 1: commercial use and modification permitted with attribution. Narrower than the unrestricted field on the trade APIs, which is why this interface carries its own determination."}]}, {"url": "https://unipass.customs.go.kr/clip/", "title": "관세·통계통합품목분류표", "retrieved_on": "2026-09-22", "note": "8542.32 메모리; 8542321010 디램; 8542321020 에스램; 8542321030 플래시 메모리; 8542323000 복합구조칩 집적회로. Classification reference only; backs no observation."}]}'::jsonb,
   jsonb_build_object(
     'source_system', 'data.go.kr',
     'agency', 'Korea Customs Service',
     'dataset_id', '15049722',
     'licence', '공공저작물 출처표시 (제1유형)',
     'cadence', 'annual'
   ))
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- reviewed rights positions
--
-- One row per source per purpose, in the shared model. Phase 2C read each of these from the
-- agency's own published terms on 22 September 2026; the decisive wording is recorded verbatim
-- so that a later reviewer argues with the clause rather than with a summary of it.

insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, terms_document_url, decisive_clause,
   reviewed_by, reviewed_on, effective_from, notes)
select i.id, p.purpose_code, p.rights_classification, p.disposition,
       p.attribution_required, p.attribution_text, p.conditions, p.terms_document_url, p.decisive_clause,
       'UMPI Phase 2C source verification', date '2026-09-22', timestamptz '2026-09-22 00:00:00+00', p.notes
from (values
  -- Bank of Korea. Free use of designated public data, attribution mandatory, and -- the clause
  -- that matters for a product that computes a change on top -- modification must be disclosed.
  ('bok-ecos-producer-price-commodity', 'internal_retention', 'reusable_with_attribution_or_conditions', 'permitted',
   true, 'Source: Bank of Korea', null,
   'https://www.bok.or.kr/portal/main/contents.do?menuNo=200228',
   '제공대상 공공데이터는 별도의 절차 없이 자유롭게 이용할 수 있습니다',
   'Designated public data, freely usable without a separate procedure.'),
  ('bok-ecos-producer-price-commodity', 'internal_calculation', 'reusable_with_attribution_or_conditions', 'permitted',
   true, 'Source: Bank of Korea', 'Any modification, alteration or processing must be disclosed.',
   'https://www.bok.or.kr/portal/main/contents.do?menuNo=200228',
   '수정, 변경, 가공할 경우에도 이를 분명히 밝혀야 합니다',
   'The MoM change is a Urdais calculation and is disclosed as one.'),
  ('bok-ecos-producer-price-commodity', 'public_official_series_display', 'reusable_with_attribution_or_conditions', 'permitted',
   true, 'Source: Bank of Korea', 'Attribution on every surface that displays the series.',
   'https://www.bok.or.kr/portal/main/contents.do?menuNo=200228',
   '출처가 한국은행임을 반드시 밝혀야 하며',
   'Series A publishes the BOK level unchanged, as a cited BOK series.'),
  ('bok-ecos-producer-price-commodity', 'public_derived_index_display', 'reusable_with_attribution_or_conditions', 'permitted',
   true, 'Source: Bank of Korea', 'Derived values are labelled as Urdais calculations.',
   'https://www.bok.or.kr/portal/main/contents.do?menuNo=200228',
   '수정, 변경, 가공할 경우에도 이를 분명히 밝혀야 합니다',
   'Covers the Urdais MoM computed from two BOK levels.'),
  -- Korea Customs trade statistics. The portal's unrestricted-use field; attribution is still
  -- required as a matter of Urdais policy and of accurate representation.
  ('kcs-item-country-trade', 'internal_retention', 'clearly_reusable', 'permitted',
   true, 'Source: Korea Customs Service', null,
   'https://www.data.go.kr/data/15100475/openapi.do', '이용허락범위 제한 없음', null),
  ('kcs-item-country-trade', 'internal_calculation', 'clearly_reusable', 'permitted',
   true, 'Source: Korea Customs Service', null,
   'https://www.data.go.kr/data/15100475/openapi.do', '이용허락범위 제한 없음',
   'Covers the unit value and the rebased index.'),
  ('kcs-item-country-trade', 'public_official_series_display', 'clearly_reusable', 'permitted',
   true, 'Source: Korea Customs Service', null,
   'https://www.data.go.kr/data/15100475/openapi.do', '이용허락범위 제한 없음', null),
  ('kcs-item-country-trade', 'public_derived_index_display', 'clearly_reusable', 'permitted',
   true, 'Source: Korea Customs Service, HSK 8542321010',
   'The published value is a Urdais unit-value index, never presented as an official price.',
   'https://www.data.go.kr/data/15100475/openapi.do', '이용허락범위 제한 없음', null),
  ('kcs-item-trade-gw', 'internal_retention', 'clearly_reusable', 'permitted',
   true, 'Source: Korea Customs Service', null,
   'https://www.data.go.kr/data/15101609/openapi.do', '이용허락범위 제한 없음', null),
  ('kcs-item-trade-gw', 'internal_calculation', 'clearly_reusable', 'permitted',
   true, 'Source: Korea Customs Service', null,
   'https://www.data.go.kr/data/15101609/openapi.do', '이용허락범위 제한 없음', null),
  -- The classification file carries a different licence from the trade APIs, so it gets its
  -- own determination rather than inheriting one.
  ('kcs-hs-code-reference', 'internal_retention', 'reusable_with_attribution_or_conditions', 'permitted',
   true, 'Source: Korea Customs Service', 'KOGL Type 1: attribution required.',
   'https://www.data.go.kr/data/15049722/fileData.do', '공공저작물 출처표시 (제1유형)',
   'Classification reference only. It backs no observation.')
) as p(interface_slug, purpose_code, rights_classification, disposition,
       attribution_required, attribution_text, conditions, terms_document_url, decisive_clause, notes)
join reference.source_interfaces i on i.slug = p.interface_slug;

-- ------------------------------------------------------------------ methodology registration
--
-- A draft. It carries no effective date -- the schema refuses one -- and nothing may be
-- published under it. Registering it lets observations and publications bind to a version
-- structurally, which is what makes a published value explainable later.

insert into reference.methodologies (id, slug, name, document_path) values
  ('98000000-0000-4000-8000-000000000020', 'umpi-kr-dram', 'Urdais UMPI-KR DRAM',
   'docs/methodology/umpi-kr-dram.md')
on conflict (slug) do nothing;

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash)
values
  ('98000000-0000-4000-8000-000000000021', '98000000-0000-4000-8000-000000000020',
   '0.1.0-draft', 'draft', 'docs/methodology/umpi-kr-dram.md',
   '433ddc8eec72c0cd8c90ac5803e2618df8963f25b5754b45a8929dd4a8648dac')
on conflict (methodology_id, version) do nothing;

-- ------------------------------------------------------------------------ canonical series

create table reference.umpi_series (
  id                     uuid primary key default gen_random_uuid(),
  series_code            text not null unique
                           constraint umpi_series_code_format check (series_code ~ '^UMPI-[A-Z0-9]+(-[A-Z0-9]+)*$'),
  family_code            text not null default 'UMPI'
                           constraint umpi_series_family_allowed check (family_code = 'UMPI'),
  display_name           text not null
                           constraint umpi_series_name_nonempty check (btrim(display_name) <> ''),
  -- A price index is produced by a statistical agency under its own method. A unit-value index
  -- is value over quantity and moves on composition as well as on price. The methodology
  -- forbids averaging or blending them, and the kind is what a later reader checks.
  series_kind            text not null
                           constraint umpi_series_kind_allowed
                           check (series_kind in ('official_price_index', 'derived_unit_value_index')),
  published_unit         text not null default 'index_points'
                           constraint umpi_series_unit_allowed check (published_unit = 'index_points'),
  -- Series A carries the agency's own base. Series B carries the base Urdais froze.
  base_label             text not null
                           constraint umpi_series_base_nonempty check (btrim(base_label) <> ''),
  base_owner             text not null
                           constraint umpi_series_base_owner_allowed check (base_owner in ('source_agency', 'urdais')),
  observation_cadence    text not null default 'monthly'
                           constraint umpi_series_cadence_allowed check (observation_cadence = 'monthly'),
  change_label           text not null default 'MoM'
                           constraint umpi_series_change_allowed check (change_label = 'MoM'),
  -- Whether Urdais computes the published level, or republishes the agency's.
  level_is_urdais_derived boolean not null,
  -- Series B must carry its composition warning wherever it appears. Series A must not: it is a
  -- quality-adjusted price index and a mix warning on it would be false.
  mix_warning_required   boolean not null,
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,
  -- Phase 3 creates no live series. The state is a fact about the product, not a wish.
  publication_state      text not null default 'not_initialized'
                           constraint umpi_series_publication_state_allowed
                           check (publication_state in ('not_initialized', 'blocked', 'delayed', 'live')),
  attribution_text       text not null
                           constraint umpi_series_attribution_nonempty check (btrim(attribution_text) <> ''),
  notes                  text,
  created_at             timestamptz not null default now(),
  -- A derived level and an agency base are contradictory, and so are their opposites.
  constraint umpi_series_base_owner_matches_derivation
    check (level_is_urdais_derived = (base_owner = 'urdais')),
  -- Only a unit-value index carries the mix warning, and it always carries it.
  constraint umpi_series_mix_warning_matches_kind
    check (mix_warning_required = (series_kind = 'derived_unit_value_index'))
);

comment on table reference.umpi_series is
  'The canonical UMPI published series. Two rows in V1. A price index and a unit-value index are different kinds and are never averaged, blended or used to impute one another; the kind, the base owner and the mix-warning requirement are constrained together so a row cannot describe an incoherent product.';

-- --------------------------------------------------------------- source-series identity
--
-- The reason this table exists, stated once: item code `30911201AA` is the DRAM item in BOTH
-- `404Y016` (producer prices) and `402Y016` (export prices), and the two return different
-- numbers for the same month. `402Y016` additionally carries a currency-basis dimension with
-- three values. An implementation that keys a BOK series on the item code alone will publish
-- the wrong statistic and will look correct while doing it.

create table reference.umpi_source_series (
  id                     uuid primary key default gen_random_uuid(),
  series_id              uuid not null references reference.umpi_series (id) on delete restrict,
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,
  identity_kind          text not null
                           constraint umpi_source_series_identity_kind_allowed
                           check (identity_kind in ('bok_ecos_series', 'kcs_trade_commodity')),
  -- BOK identity: all three are required together, and none may be blank.
  bok_stat_code          text constraint umpi_source_series_stat_format
                           check (bok_stat_code is null or bok_stat_code ~ '^[0-9]{3}Y[0-9]{3}$'),
  bok_item_code          text constraint umpi_source_series_item_format
                           check (bok_item_code is null or bok_item_code ~ '^[0-9A-Z]{6,20}$'),
  bok_cycle              text constraint umpi_source_series_cycle_allowed
                           check (bok_cycle is null or bok_cycle in ('A', 'Q', 'M', 'D')),
  -- Group dimensions the table carries, as code/value pairs. Empty where the table has none.
  -- A table that carries a dimension and a row that does not name it are inconsistent, and the
  -- adapter contract requires the dimension set to be stated rather than defaulted.
  bok_group_dimensions   jsonb not null default '{}'::jsonb,
  -- Customs identity.
  hs_code                text constraint umpi_source_series_hs_format
                           check (hs_code is null or hs_code ~ '^[0-9]{10}$'),
  dataset_id             text constraint umpi_source_series_dataset_format
                           check (dataset_id is null or dataset_id ~ '^[0-9]{6,10}$'),
  source_native_unit     text not null
                           constraint umpi_source_series_native_unit_nonempty check (btrim(source_native_unit) <> ''),
  -- The comparability window. A classification or base change ends one identity and begins
  -- another rather than silently splicing unlike things into one series.
  effective_from_month   date not null
                           constraint umpi_source_series_from_is_month check (extract(day from effective_from_month) = 1),
  effective_to_month     date
                           constraint umpi_source_series_to_is_month
                           check (effective_to_month is null or extract(day from effective_to_month) = 1),
  is_active              boolean not null default true,
  notes                  text,
  created_at             timestamptz not null default now(),
  constraint umpi_source_series_interval_ordered
    check (effective_to_month is null or effective_to_month >= effective_from_month),
  -- The whole point of the table.
  constraint umpi_source_series_bok_identity_complete check (
    identity_kind <> 'bok_ecos_series'
    or (bok_stat_code is not null and bok_item_code is not null and bok_cycle is not null
        and hs_code is null and dataset_id is null)
  ),
  constraint umpi_source_series_customs_identity_complete check (
    identity_kind <> 'kcs_trade_commodity'
    or (hs_code is not null and dataset_id is not null
        and bok_stat_code is null and bok_item_code is null and bok_cycle is null)
  ),
  -- V1 Series A is the producer price table. The export price index on 402Y016 is deferred by
  -- the methodology and is refused here rather than left to an adapter's discretion.
  constraint umpi_source_series_no_export_price_index
    check (bok_stat_code is null or bok_stat_code <> '402Y016'),
  -- One active identity per source-side key at a time.
  unique (series_id, effective_from_month)
);

comment on table reference.umpi_source_series is
  'The source-side identity a UMPI series is read from, effective-dated by reference month. A BOK identity is (stat_code, item_code, cycle) plus any group dimensions, never the item code alone: 30911201AA is DRAM in both 404Y016 and 402Y016 and the two disagree. The deferred export price index 402Y016 is refused by constraint.';

create index umpi_source_series_series_idx on reference.umpi_source_series (series_id, effective_from_month desc);
create unique index umpi_source_series_bok_identity_idx
  on reference.umpi_source_series (bok_stat_code, bok_item_code, bok_cycle, effective_from_month)
  where identity_kind = 'bok_ecos_series';
create unique index umpi_source_series_customs_identity_idx
  on reference.umpi_source_series (hs_code, dataset_id, effective_from_month)
  where identity_kind = 'kcs_trade_commodity';

-- --------------------------------------------------------------------------- ingestion runs

create table pipeline.umpi_ingestion_runs (
  id                     uuid primary key default gen_random_uuid(),
  series_id              uuid not null references reference.umpi_series (id) on delete restrict,
  source_series_id       uuid not null references reference.umpi_source_series (id) on delete restrict,
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,
  -- Collector-supplied, so a retried run is the same run and not a second one.
  idempotency_key        text not null unique
                           constraint umpi_runs_idempotency_nonempty check (btrim(idempotency_key) <> ''),
  run_kind               text not null default 'production'
                           constraint umpi_runs_kind_allowed check (run_kind in ('production', 'backfill', 'dry_run', 'correction')),
  retrieval_mode         text not null
                           constraint umpi_runs_mode_allowed check (retrieval_mode in ('api', 'file_download', 'manual_read')),
  requested_from_month   date not null
                           constraint umpi_runs_from_is_month check (extract(day from requested_from_month) = 1),
  requested_to_month     date not null
                           constraint umpi_runs_to_is_month check (extract(day from requested_to_month) = 1),
  started_at             timestamptz not null,
  completed_at           timestamptz,
  payload_digest         text
                           constraint umpi_runs_digest_format check (payload_digest is null or payload_digest ~ '^[0-9a-f]{64}$'),
  rows_received          integer not null default 0 constraint umpi_runs_received_nonneg check (rows_received >= 0),
  rows_inserted          integer not null default 0 constraint umpi_runs_inserted_nonneg check (rows_inserted >= 0),
  rows_unchanged         integer not null default 0 constraint umpi_runs_unchanged_nonneg check (rows_unchanged >= 0),
  rows_revised           integer not null default 0 constraint umpi_runs_revised_nonneg check (rows_revised >= 0),
  rows_rejected          integer not null default 0 constraint umpi_runs_rejected_nonneg check (rows_rejected >= 0),
  error_count            integer not null default 0 constraint umpi_runs_errors_nonneg check (error_count >= 0),
  -- Whether this run changed anything. A second run over an unchanged payload is `no_change`,
  -- and that is the observable proof of idempotence rather than a claim about it.
  idempotence_state      text not null default 'pending'
                           constraint umpi_runs_idempotence_allowed
                           check (idempotence_state in ('pending', 'no_change', 'changed', 'failed')),
  source_version_label   text,
  notes                  text,
  created_at             timestamptz not null default now(),
  constraint umpi_runs_month_range_ordered check (requested_to_month >= requested_from_month),
  constraint umpi_runs_completed_after_started check (completed_at is null or completed_at >= started_at),
  -- Accounting has to add up: what was accepted cannot exceed what arrived.
  constraint umpi_runs_accounting_consistent
    check (rows_inserted + rows_unchanged + rows_revised + rows_rejected <= rows_received),
  -- A run that changed nothing cannot have written anything.
  constraint umpi_runs_no_change_wrote_nothing
    check (idempotence_state <> 'no_change' or (rows_inserted = 0 and rows_revised = 0)),
  -- A dry run never writes. Phase 3 ships no collector; this is the rule the collector inherits.
  constraint umpi_runs_dry_run_writes_nothing
    check (run_kind <> 'dry_run' or (rows_inserted = 0 and rows_revised = 0))
);

comment on table pipeline.umpi_ingestion_runs is
  'One execution of a UMPI source retrieval and store. `pipeline.calculation_runs` could not be reused: it binds to reference.instruments and checks a daily UTC window in SQL, and UMPI is monthly statistical data with no such calendar.';

create index umpi_ingestion_runs_series_idx on pipeline.umpi_ingestion_runs (series_id, started_at desc);

-- ---------------------------------------------------------------------- source observations
--
-- Append-only evidence, one row per (source series, reference month, vintage). The two shapes
-- share every field that makes a vintage explainable and differ only in what the source
-- actually published, which is why they share a table and are kept apart by constraint.

create table pipeline.umpi_observations (
  id                     uuid primary key default gen_random_uuid(),
  series_id              uuid not null references reference.umpi_series (id) on delete restrict,
  source_series_id       uuid not null references reference.umpi_source_series (id) on delete restrict,
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,
  source_retrieval_id    uuid references pipeline.source_retrievals (id) on delete restrict,
  ingestion_run_id       uuid not null references pipeline.umpi_ingestion_runs (id) on delete restrict,
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,
  observation_kind       text not null
                           constraint umpi_observations_kind_allowed
                           check (observation_kind in ('bok_index_level', 'kcs_trade_month')),
  -- The month the value describes, always the first of the month. Never the retrieval date.
  reference_month        date not null
                           constraint umpi_observations_reference_is_month check (extract(day from reference_month) = 1),
  -- When the agency published this value, where the agency exposes it.
  source_published_at    timestamptz,
  retrieved_at           timestamptz not null,
  -- Monotonic per (source series, reference month). Vintage 1 is the first print.
  vintage_ordinal        integer not null
                           constraint umpi_observations_vintage_positive check (vintage_ordinal >= 1),
  source_native_unit     text not null
                           constraint umpi_observations_native_unit_nonempty check (btrim(source_native_unit) <> ''),
  -- BOK shape.
  index_level            numeric(18, 6)
                           constraint umpi_observations_level_positive check (index_level is null or index_level > 0),
  index_base_label       text,
  -- Customs shape. Both are retained forever: the methodology requires the raw official inputs,
  -- not only the ratio computed from them.
  export_value_usd       numeric(20, 2)
                           constraint umpi_observations_export_value_nonneg check (export_value_usd is null or export_value_usd >= 0),
  export_weight_kg       numeric(20, 3)
                           constraint umpi_observations_export_weight_nonneg check (export_weight_kg is null or export_weight_kg >= 0),
  -- Deterministic provenance over the source payload for this month.
  provenance_hash        text not null
                           constraint umpi_observations_provenance_format check (provenance_hash ~ '^[0-9a-f]{64}$'),
  raw_payload            jsonb not null,
  quality_status         text not null default 'accepted'
                           constraint umpi_observations_quality_allowed
                           check (quality_status in ('accepted', 'provisional', 'suspect', 'rejected')),
  rejection_reason       text,
  superseded_by_id       uuid references pipeline.umpi_observations (id) on delete restrict
                           deferrable initially deferred,
  superseded_at          timestamptz,
  supersession_reason    text,
  created_at             timestamptz not null default now(),
  -- One vintage per month per source series, and the same vintage is never written twice.
  unique (source_series_id, reference_month, vintage_ordinal),
  -- An identical payload retrieved again is the same evidence: the write is refused rather
  -- than becoming a second vintage of an unchanged value.
  unique (source_series_id, reference_month, provenance_hash),
  constraint umpi_observations_bok_shape check (
    observation_kind <> 'bok_index_level'
    or (index_level is not null and index_base_label is not null
        and export_value_usd is null and export_weight_kg is null)
  ),
  constraint umpi_observations_customs_shape check (
    observation_kind <> 'kcs_trade_month'
    or (export_value_usd is not null and export_weight_kg is not null
        and index_level is null and index_base_label is null)
  ),
  constraint umpi_observations_rejection_states_reason
    check (quality_status <> 'rejected' or (rejection_reason is not null and btrim(rejection_reason) <> '')),
  constraint umpi_observations_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint umpi_observations_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id)
);

comment on table pipeline.umpi_observations is
  'Append-only source evidence, vintaged per reference month. A revision is a new vintage that supersedes the previous one; the previous row stays exactly as retrieved. Raw customs USD and kg are retained alongside any derived value because reproducibility requires the official inputs, not the ratio.';

create index umpi_observations_current_idx
  on pipeline.umpi_observations (source_series_id, reference_month, vintage_ordinal desc)
  where superseded_by_id is null and quality_status <> 'rejected';
create index umpi_observations_run_idx on pipeline.umpi_observations (ingestion_run_id);

-- The current vintage of every month, resolved deterministically rather than by whoever asks.
create view pipeline.umpi_current_observations as
select distinct on (o.source_series_id, o.reference_month)
       o.*
  from pipeline.umpi_observations o
 where o.superseded_by_id is null
   and o.quality_status <> 'rejected'
 order by o.source_series_id, o.reference_month, o.vintage_ordinal desc;

comment on view pipeline.umpi_current_observations is
  'The latest un-superseded, non-rejected vintage of each reference month. The publication layer reads this and never the raw table, so "latest" has exactly one definition.';

-- --------------------------------------------------------------------------- derived bases
--
-- Series B rebases to a fixed historical base. The base is itself derived from official
-- observations and therefore needs its own lineage: which months went into it, how many, and
-- the digest of the inputs that produced it.

create table pipeline.umpi_index_bases (
  id                     uuid primary key default gen_random_uuid(),
  series_id              uuid not null references reference.umpi_series (id) on delete restrict,
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,
  base_label             text not null
                           constraint umpi_index_bases_label_nonempty check (btrim(base_label) <> ''),
  base_from_month        date not null
                           constraint umpi_index_bases_from_is_month check (extract(day from base_from_month) = 1),
  base_to_month          date not null
                           constraint umpi_index_bases_to_is_month check (extract(day from base_to_month) = 1),
  -- Σ expDlr over the base window, Σ expWgt over the base window, and their quotient. Stored
  -- as three numbers because the quotient alone cannot be audited.
  base_value_usd         numeric(24, 2) not null
                           constraint umpi_index_bases_value_positive check (base_value_usd > 0),
  base_weight_kg         numeric(24, 3) not null
                           constraint umpi_index_bases_weight_positive check (base_weight_kg > 0),
  base_unit_value        numeric(24, 10) not null
                           constraint umpi_index_bases_uv_positive check (base_unit_value > 0),
  month_count            smallint not null
                           constraint umpi_index_bases_month_count_positive check (month_count > 0),
  inputs_digest          text not null
                           constraint umpi_index_bases_digest_format check (inputs_digest ~ '^[0-9a-f]{64}$'),
  computed_at            timestamptz not null,
  computed_by_run_id     uuid references pipeline.umpi_ingestion_runs (id) on delete restrict,
  superseded_by_id       uuid references pipeline.umpi_index_bases (id) on delete restrict
                           deferrable initially deferred,
  superseded_at          timestamptz,
  supersession_reason    text,
  created_at             timestamptz not null default now(),
  unique (series_id, base_label, inputs_digest),
  constraint umpi_index_bases_window_ordered check (base_to_month >= base_from_month),
  constraint umpi_index_bases_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint umpi_index_bases_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id)
);

comment on table pipeline.umpi_index_bases is
  'A frozen rebasing base for a derived series, with the aggregate value and weight it was computed from. Phase 3 writes none: the production base must come from ingested official observations, never from a constant in a migration.';

-- ------------------------------------------------------------------------ publication layer

create table pipeline.umpi_publications (
  id                     uuid primary key default gen_random_uuid(),
  series_id              uuid not null references reference.umpi_series (id) on delete restrict,
  methodology_version_id uuid not null references reference.methodology_versions (id) on delete restrict,
  -- The evidence this point was computed from. A published value that cannot name its
  -- observation is not explainable, so the link is required.
  observation_id         uuid not null references pipeline.umpi_observations (id) on delete restrict,
  -- Null for Series A, which is not rebased.
  index_base_id          uuid references pipeline.umpi_index_bases (id) on delete restrict,
  reference_month        date not null
                           constraint umpi_publications_reference_is_month check (extract(day from reference_month) = 1),
  published_level        numeric(18, 6) not null
                           constraint umpi_publications_level_positive check (published_level > 0),
  published_unit         text not null default 'index_points'
                           constraint umpi_publications_unit_allowed check (published_unit = 'index_points'),
  base_label             text not null
                           constraint umpi_publications_base_nonempty check (btrim(base_label) <> ''),
  -- The Urdais-calculated month-over-month change, as a fraction. Null is a withheld change and
  -- is never rendered as zero; the reason it was withheld is recorded beside it.
  mom_change             numeric(12, 8),
  mom_withheld_reason    text
                           constraint umpi_publications_withheld_reason_allowed
                           check (mom_withheld_reason is null or mom_withheld_reason in (
                             'no_prior_month', 'prior_month_missing', 'methodology_boundary',
                             'source_boundary', 'base_boundary'
                           )),
  -- The intermediate Series B quantity, retained so the index is auditable back to USD and kg.
  unit_value_usd_per_kg  numeric(24, 10)
                           constraint umpi_publications_uv_positive check (unit_value_usd_per_kg is null or unit_value_usd_per_kg > 0),
  source_vintage_ordinal integer not null
                           constraint umpi_publications_vintage_positive check (source_vintage_ordinal >= 1),
  vintage_published_at   timestamptz not null,
  settlement_state       text not null default 'provisional'
                           constraint umpi_publications_settlement_allowed
                           check (settlement_state in ('provisional', 'final')),
  publication_state      text not null default 'internal_only'
                           constraint umpi_publications_state_allowed
                           check (publication_state in ('internal_only', 'publication_candidate', 'published', 'withdrawn')),
  attribution_text       text not null
                           constraint umpi_publications_attribution_nonempty check (btrim(attribution_text) <> ''),
  mix_warning            text,
  superseded_by_id       uuid references pipeline.umpi_publications (id) on delete restrict
                           deferrable initially deferred,
  superseded_at          timestamptz,
  supersession_reason    text,
  created_at             timestamptz not null default now(),
  -- Exactly one live publication per series per month; corrections supersede rather than stack.
  unique (series_id, reference_month, source_vintage_ordinal),
  -- A change is either a number or a stated refusal, never both and never neither.
  constraint umpi_publications_change_or_reason
    check ((mom_change is null) <> (mom_withheld_reason is null)),
  constraint umpi_publications_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint umpi_publications_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id)
);

comment on table pipeline.umpi_publications is
  'One published monthly point per series and vintage. Follows the per-product publication convention of pipeline.utvi_publications and pipeline.ubwi_publications. A withheld MoM stores its reason rather than a zero.';

create index umpi_publications_series_month_idx
  on pipeline.umpi_publications (series_id, reference_month desc, source_vintage_ordinal desc);

-- A publication must agree with its series about what kind of thing it is: a rebased series
-- names its base, a non-rebased one has none; a unit-value series carries its mix warning.
create or replace function pipeline.check_umpi_publication_coherence()
returns trigger
language plpgsql
as $$
declare
  s reference.umpi_series%rowtype;
  o pipeline.umpi_observations%rowtype;
begin
  select * into s from reference.umpi_series where id = new.series_id;
  select * into o from pipeline.umpi_observations where id = new.observation_id;

  if o.series_id <> new.series_id then
    raise exception 'publication % cites an observation belonging to a different series', new.id
      using errcode = 'restrict_violation';
  end if;
  if o.reference_month <> new.reference_month then
    raise exception 'publication % is dated %, its observation is dated %',
      new.id, new.reference_month, o.reference_month using errcode = 'restrict_violation';
  end if;
  if s.level_is_urdais_derived and new.index_base_id is null then
    raise exception 'series % publishes a derived level and must name the base it was rebased to', s.series_code
      using errcode = 'restrict_violation';
  end if;
  if not s.level_is_urdais_derived and new.index_base_id is not null then
    raise exception 'series % republishes the agency level and must not name a Urdais base', s.series_code
      using errcode = 'restrict_violation';
  end if;
  if s.mix_warning_required and (new.mix_warning is null or btrim(new.mix_warning) = '') then
    raise exception 'series % is a unit-value index and every published point must carry its mix warning', s.series_code
      using errcode = 'restrict_violation';
  end if;
  if not s.mix_warning_required and new.mix_warning is not null then
    raise exception 'series % is a price index and must not carry a mix warning', s.series_code
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

comment on function pipeline.check_umpi_publication_coherence() is
  'Trigger: a published point must cite an observation of its own series and month, must name a base if and only if its level is Urdais-derived, and must carry the mix warning if and only if it is a unit-value index.';

create trigger umpi_publications_coherence_check
  before insert on pipeline.umpi_publications
  for each row execute function pipeline.check_umpi_publication_coherence();

-- --------------------------------------------------------------- append-only enforcement

create trigger umpi_observations_supersede_only
  before update or delete on pipeline.umpi_observations
  for each row execute function pipeline.allow_only_supersession();
create trigger umpi_index_bases_supersede_only
  before update or delete on pipeline.umpi_index_bases
  for each row execute function pipeline.allow_only_supersession();
create trigger umpi_publications_supersede_only
  before update or delete on pipeline.umpi_publications
  for each row execute function pipeline.allow_only_supersession();

-- ------------------------------------------------------------------------- the two series

insert into reference.umpi_series
  (id, series_code, display_name, series_kind, base_label, base_owner, level_is_urdais_derived,
   mix_warning_required, methodology_version_id, publication_state, attribution_text, notes)
values
  ('98000000-0000-4000-8000-000000000031', 'UMPI-KR-DRAM-PPI', 'UMPI-KR DRAM PPI',
   'official_price_index', '2020=100', 'source_agency', false, false,
   '98000000-0000-4000-8000-000000000021', 'not_initialized', 'Source: Bank of Korea',
   'The Bank of Korea producer price index for DRAM, republished unchanged in the agency''s own base. Urdais calculates only the MoM.'),
  ('98000000-0000-4000-8000-000000000032', 'UMPI-KR-DRAM-EXPORT-UV', 'UMPI-KR DRAM Export UV',
   'derived_unit_value_index', '2020 calendar-year aggregate = 100', 'urdais', true, true,
   '98000000-0000-4000-8000-000000000021', 'not_initialized', 'Source: Korea Customs Service, HSK 8542321010',
   'Declared export USD over declared export kg, rebased. A unit value is not a price: it moves on export composition as well as on price.');

insert into reference.umpi_source_series
  (series_id, source_interface_id, identity_kind, bok_stat_code, bok_item_code, bok_cycle,
   bok_group_dimensions, hs_code, dataset_id, source_native_unit, effective_from_month, notes)
values
  ('98000000-0000-4000-8000-000000000031', '98000000-0000-4000-8000-000000000011',
   'bok_ecos_series', '404Y016', '30911201AA', 'M', '{}'::jsonb, null, null,
   'index_2020_equals_100', date '1995-01-01',
   'Verified live 2026-09-22: item name DRAM, unit 2020=100, monthly, 199501-202608, basket weight 1.2. 404Y016 carries no group dimension beyond the item.'),
  ('98000000-0000-4000-8000-000000000032', '98000000-0000-4000-8000-000000000012',
   'kcs_trade_commodity', null, null, null, '{}'::jsonb, '8542321010', '15100475',
   'usd_and_kg', date '2020-01-01',
   'HSK 8542321010 is 디램 (DRAM chips). SRAM, flash and MCP are sibling codes. Export side only: expDlr is declared FOB USD, import value is CIF and is never used in the ratio.');

-- --------------------------------------------------------------------- privileges and RLS

revoke update, delete, truncate on
  pipeline.umpi_observations,
  pipeline.umpi_index_bases,
  pipeline.umpi_publications
from service_role;

revoke delete, truncate on pipeline.umpi_ingestion_runs from service_role;

alter table reference.umpi_series          enable row level security;
alter table reference.umpi_source_series   enable row level security;
alter table pipeline.umpi_ingestion_runs   enable row level security;
alter table pipeline.umpi_observations     enable row level security;
alter table pipeline.umpi_index_bases      enable row level security;
alter table pipeline.umpi_publications     enable row level security;

-- ------------------------------------------------------------------------------ assertions

do $$
declare n integer; s text;
begin
  select count(*) into n from reference.umpi_series;
  if n <> 2 then raise exception 'expected exactly two UMPI series, found %', n; end if;

  -- A draft, with no effective date. Nothing is publishable under it.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and (mv.status <> 'draft' or mv.effective_from is not null);
  if n <> 0 then raise exception 'the UMPI methodology was registered as something other than an undated draft'; end if;

  -- Phase 3 ingests nothing and publishes nothing.
  select count(*) into n from pipeline.umpi_observations;
  if n <> 0 then raise exception 'Phase 3 must create no observation, found %', n; end if;
  select count(*) into n from pipeline.umpi_publications;
  if n <> 0 then raise exception 'Phase 3 must create no publication, found %', n; end if;
  select count(*) into n from pipeline.umpi_index_bases;
  if n <> 0 then raise exception 'Phase 3 must create no index base, found %', n; end if;
  select count(*) into n from pipeline.umpi_ingestion_runs;
  if n <> 0 then raise exception 'Phase 3 must create no ingestion run, found %', n; end if;

  -- No series is live.
  select count(*) into n from reference.umpi_series where publication_state <> 'not_initialized';
  if n <> 0 then raise exception 'no UMPI series may be initialized in Phase 3'; end if;

  -- The deferred export price index is not registered anywhere.
  select count(*) into n from reference.umpi_source_series where bok_stat_code = '402Y016';
  if n <> 0 then raise exception 'the deferred BOK export price index must not be registered'; end if;

  -- Series A is bound to the producer price table specifically, not to the item code alone.
  select ss.bok_stat_code into s from reference.umpi_source_series ss
    join reference.umpi_series se on se.id = ss.series_id
   where se.series_code = 'UMPI-KR-DRAM-PPI';
  if s is distinct from '404Y016' then raise exception 'Series A is not bound to 404Y016, found %', s; end if;
end $$;
