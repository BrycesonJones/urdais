-- PD-3B: planning-demand foundation and the Urdais rights policy that governs it.
--
-- Planning demand is a separate domain from the PD-2 operational store, and this migration
-- keeps it separate on purpose. EIA-930 `D` and `DF` are hourly measurements of what a grid
-- did yesterday; an ISO long-term load forecast is a dated publication about what a grid is
-- expected to do in 2034, carrying a scenario, a weather basis, a gross/net convention and a
-- large-load screen. They share a geography and nothing else. So:
--
--   * `reference.power_metrics` is untouched. There is no `planning_demand_forecast` metric.
--   * `pipeline.raw_power_records` and `pipeline.power_observations` are untouched except for
--     one new constraint that pins them to the two EIA operational types, so that the
--     separation is enforced rather than merely intended.
--   * Planning evidence and planning values live in their own four tables.
--
-- What is reused, because reuse is correct here: `reference.grid_areas` (the seven physical
-- balancing-authority areas), the provider/source-interface registry, `pipeline.source_retrievals`,
-- `reference.permission_grants`, and the append-only / supersede-never-edit conventions.
--
-- This migration ingests nothing. It creates the schema, the rights vocabulary, and the
-- source-policy rows for the seven markets, and stops there.

-- ------------------------------------------------------------------ registry vocabulary

alter table reference.providers
  drop constraint providers_kind_allowed,
  add constraint providers_kind_allowed
    check (provider_kind in (
      'cloud_provider', 'marketplace', 'hardware_vendor', 'model_api_provider',
      'statistical_compiler', 'spot_venue', 'chain_data', 'oracle_network',
      'inference_marketplace', 'research_organization',
      -- A regional transmission organization or independent system operator publishing its
      -- own planning forecast, and the state agency that publishes California's.
      'grid_operator', 'government_agency',
      'other'
    ));

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface', 'catalog_price_interface', 'availability_interface',
    'product_reference_documentation', 'hardware_reference_documentation',
    'provider_terms_documentation', 'price_surface', 'news_feed', 'statistical_dataset',
    'exchange_rate_series', 'chain_data_interface', 'spot_price_interface',
    'usage_dataset_interface', 'benchmark_dataset_interface', 'regulatory_filing_repository',
    'equity_eod_price_interface', 'issuer_fundamentals_interface',
    'power_system_operational_data',
    -- A dated long-horizon demand forecast publication: report, workbook or both.
    'power_system_planning_forecast'
  ));

-- ------------------------------------------------------------------------- rights policy
--
-- The four classifications are the research vocabulary, kept verbatim. This table is
-- descriptive: it names the classes and says what each one means. It deliberately carries no
-- publish/do-not-publish flag, because the publication decision has exactly one implementation
-- (`mayPublishPlanningForecast` in `src/lib/power-delivery/planning/rights.ts`) and a second
-- copy of it in SQL would be a second thing to keep in agreement.

create table reference.source_rights_classifications (
  code              text primary key
                      constraint source_rights_classifications_code_format
                      check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  display_name      text not null,
  description       text not null,
  -- Ascending restrictiveness. Ordering only; it decides nothing on its own.
  severity_ordinal  smallint not null unique
                      constraint source_rights_classifications_ordinal_positive check (severity_ordinal > 0),
  created_at        timestamptz not null default now()
);

comment on table reference.source_rights_classifications is
  'The rights classes a source review may reach. A classification is preserved exactly as the review found it and is never rewritten because Urdais decided to publish under it.';

insert into reference.source_rights_classifications (code, display_name, description, severity_ordinal) values
  ('clearly_reusable', 'Clearly reusable',
   'The publisher states that the material may be used and redistributed. Public-domain government work is the usual case.', 1),
  ('reusable_with_attribution_or_conditions', 'Reusable with attribution or conditions',
   'Reuse is granted, subject to credit or other stated conditions that Urdais must honour.', 2),
  ('ambiguous_requires_legal_review', 'Ambiguous, requires legal review',
   'The terms neither grant nor clearly forbid the use. A reviewer recorded an unresolved issue and no permission was established.', 3),
  ('unsuitable_without_permission', 'Unsuitable without permission',
   'The terms positively forbid the use, or require express written authorization that has not been obtained.', 4);

-- The purposes a source may be used for. Split along the axis that actually matters for
-- planning data: holding it, calculating from it, showing the source''s own numbers, and
-- showing something Urdais derived from them.

create table reference.source_use_purposes (
  code         text primary key
                 constraint source_use_purposes_code_format
                 check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  display_name text not null,
  -- Whether exercising this purpose exposes the data outside Urdais.
  is_public    boolean not null,
  description  text not null,
  created_at   timestamptz not null default now()
);

comment on table reference.source_use_purposes is
  'Normalized use purposes for a source. Kept distinct from the index-specific booleans on permission_grants: an ISO planning workbook is not an index input and those axes do not describe it.';

insert into reference.source_use_purposes (code, display_name, is_public, description) values
  ('internal_retention', 'Internal retention', false,
   'The artifact and the values extracted from it may be stored by Urdais.'),
  ('internal_calculation', 'Internal calculation', false,
   'Retained values may be normalized, analysed and calculated from, without leaving Urdais.'),
  ('public_raw_planning_value_display', 'Public display of source planning values', true,
   'The publisher''s own forecast numbers may be shown publicly, attributed to the publisher.'),
  ('public_derived_planning_value_display', 'Public display of derived planning values', true,
   'Values Urdais derived from the publisher''s forecast may be shown publicly.');

-- One reviewed determination: this source, this purpose, this window. Effective-dated rather
-- than mutable, so a later written permission is a new row and the historical determination
-- that governed earlier evidence stays exactly as it was.

create table reference.source_use_permissions (
  id                      uuid primary key default gen_random_uuid(),
  source_interface_id     uuid not null references reference.source_interfaces (id) on delete restrict,
  purpose_code            text not null references reference.source_use_purposes (code) on delete restrict,
  -- The grant this determination rests on, where one exists. Null means the determination was
  -- reached from the publisher''s own terms without a grant record.
  permission_grant_id     uuid references reference.permission_grants (id) on delete restrict,
  rights_classification   text not null references reference.source_rights_classifications (code) on delete restrict,
  disposition             text not null
                            constraint source_use_permissions_disposition_allowed
                            check (disposition in ('permitted', 'prohibited', 'revoked', 'not_established')),
  attribution_required    boolean not null default false,
  attribution_text        text,
  conditions              text,
  -- What the reviewer could not resolve. Queryable, because publication under an ambiguous
  -- classification is only defensible while the open question is still visible.
  unresolved_issue        text,
  terms_document_url      text,
  terms_document_hash     text
                            constraint source_use_permissions_terms_hash_format
                            check (terms_document_hash is null or terms_document_hash ~ '^[0-9a-f]{64}$'),
  decisive_clause         text,
  terms_retrieval_id      uuid references pipeline.source_retrievals (id) on delete restrict,
  reviewed_by             text not null,
  reviewed_on             date not null,
  effective_from          timestamptz not null,
  effective_to            timestamptz,
  notes                   text,
  created_at              timestamptz not null default now(),
  constraint source_use_permissions_interval_ordered
    check (effective_to is null or effective_to > effective_from),
  -- Required attribution without the text to show is not a usable determination.
  constraint source_use_permissions_attribution_text_present
    check (not attribution_required or (attribution_text is not null and btrim(attribution_text) <> '')),
  -- An ambiguous classification is a recorded open question, not a shrug.
  constraint source_use_permissions_ambiguity_states_its_issue
    check (rights_classification <> 'ambiguous_requires_legal_review'
           or (unresolved_issue is not null and btrim(unresolved_issue) <> '')),
  -- Saying a use is permitted is an assertion about a document; name the document.
  constraint source_use_permissions_permission_cites_evidence
    check (disposition <> 'permitted'
           or permission_grant_id is not null or terms_document_url is not null or decisive_clause is not null)
);

comment on table reference.source_use_permissions is
  'One reviewed determination of what a source may be used for, effective-dated. The rights classification is the reviewer''s finding and is never rewritten; disposition records whether a permission was positively established, positively refused, revoked, or simply never established.';
comment on column reference.source_use_permissions.disposition is
  'permitted: a document grants this use. prohibited: a document forbids it. revoked: a previously granted use has been withdrawn. not_established: review reached no permission either way, which is the ordinary state of an ambiguous source.';
comment on column reference.source_use_permissions.rights_classification is
  'The class the review reached, preserved verbatim. Urdais publishing under ambiguous_requires_legal_review does not make the source cleared, and this column must never be edited to say so.';

create index source_use_permissions_lookup_idx
  on reference.source_use_permissions (source_interface_id, purpose_code, effective_from desc);

-- At most one open-ended determination per source and purpose: a superseding review closes the
-- interval of the one it replaces rather than competing with it.
create unique index source_use_permissions_one_open_idx
  on reference.source_use_permissions (source_interface_id, purpose_code)
  where effective_to is null;

-- A retrieval freezes the determination in force when the artifact was collected, so that a
-- later review cannot silently change what a stored artifact was collected under.
create table pipeline.retrieval_rights_snapshots (
  id                       uuid primary key default gen_random_uuid(),
  retrieval_id             uuid not null references pipeline.source_retrievals (id) on delete restrict,
  purpose_code             text not null references reference.source_use_purposes (code) on delete restrict,
  source_use_permission_id uuid references reference.source_use_permissions (id) on delete restrict,
  rights_classification    text not null references reference.source_rights_classifications (code) on delete restrict,
  disposition              text not null
                             constraint retrieval_rights_snapshots_disposition_allowed
                             check (disposition in ('permitted', 'prohibited', 'revoked', 'not_established')),
  attribution_required     boolean not null,
  attribution_text         text,
  conditions               text,
  unresolved_issue         text,
  captured_at              timestamptz not null,
  created_at               timestamptz not null default now(),
  unique (retrieval_id, purpose_code)
);

comment on table pipeline.retrieval_rights_snapshots is
  'The rights determination in force for one purpose at the moment a retrieval was made, frozen. Append-only: a later review writes a new source_use_permissions row and new retrievals capture it, while this record of what the old retrieval was collected under stays.';

create trigger retrieval_rights_snapshots_append_only
  before update or delete on pipeline.retrieval_rights_snapshots
  for each row execute function pipeline.forbid_mutation();

-- ------------------------------------------------------------------- planning forecast model
--
-- A vintage is one immutable publisher release. The unit of truth is the vintage, not the
-- target year: the 2026 Gold Book and the 2025 Gold Book both say something about 2031 and
-- neither supersedes the other. Supersession is reserved for a corrected or reissued artifact
-- carrying the same native vintage key.

create table pipeline.planning_forecast_vintages (
  id                       uuid primary key default gen_random_uuid(),
  grid_area_id             uuid not null references reference.grid_areas (id) on delete restrict,
  source_interface_id      uuid not null references reference.source_interfaces (id) on delete restrict,
  source_retrieval_id      uuid not null references pipeline.source_retrievals (id) on delete restrict,
  -- The publisher''s own identifier for the release, and the key that decides what a correction
  -- is allowed to supersede.
  native_vintage_key       text not null
                             constraint planning_forecast_vintages_key_nonempty check (btrim(native_vintage_key) <> ''),
  native_report_id         text,
  report_title             text not null
                             constraint planning_forecast_vintages_title_nonempty check (btrim(report_title) <> ''),
  published_at             timestamptz not null,
  -- Publishers date releases to the month or the year as often as to the day. Recording the
  -- precision stops a February-2026 report being read as midnight on 1 February.
  published_at_precision   text not null default 'day'
                             constraint planning_forecast_vintages_precision_allowed
                             check (published_at_precision in ('year', 'month', 'day', 'minute')),
  retrieved_at             timestamptz not null,
  source_methodology_name  text,
  source_methodology_version text,
  rights_classification    text not null references reference.source_rights_classifications (code) on delete restrict,
  -- Urdais''s own editorial state for this vintage, independent of the rights finding. Both
  -- gates must open for a public read to return it.
  publication_state        text not null default 'internal_only'
                             constraint planning_forecast_vintages_publication_state_allowed
                             check (publication_state in ('internal_only', 'publication_candidate', 'published', 'withdrawn')),
  quality_status           text not null default 'provisional'
                             constraint planning_forecast_vintages_quality_allowed
                             check (quality_status in ('accepted', 'provisional', 'suspect')),
  review_notes             text,
  superseded_by_id         uuid references pipeline.planning_forecast_vintages (id) on delete restrict
                             deferrable initially deferred,
  superseded_at            timestamptz,
  supersession_reason      text,
  supersession_kind        text
                             constraint planning_forecast_vintages_supersession_kind_allowed
                             check (supersession_kind in ('correction', 'reissue')),
  created_at               timestamptz not null default now(),
  constraint planning_forecast_vintages_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null and supersession_kind is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null and supersession_kind is not null)
  ),
  constraint planning_forecast_vintages_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id),
  constraint planning_forecast_vintages_retrieved_after_published
    check (retrieved_at >= published_at)
);

comment on table pipeline.planning_forecast_vintages is
  'One immutable publisher release of a long-horizon planning forecast. A new annual forecast is a new vintage and supersedes nothing; overlapping target years across vintages are normal and are the point of keeping vintages.';
comment on column pipeline.planning_forecast_vintages.native_vintage_key is
  'The publisher''s key for the release, for example "2026-gold-book" or "ltlf-2025-04-adjusted". Two rows sharing it are the same release, which is the only case where supersession is permitted.';
comment on column pipeline.planning_forecast_vintages.publication_state is
  'Urdais''s editorial intent. internal_only and withdrawn are refused by public reads regardless of how permissive the rights finding is.';

-- One live artifact per source release. Many vintages per market remain the normal case.
create unique index planning_forecast_vintages_current_idx
  on pipeline.planning_forecast_vintages (source_interface_id, grid_area_id, native_vintage_key)
  where superseded_by_id is null;
create index planning_forecast_vintages_market_idx
  on pipeline.planning_forecast_vintages (grid_area_id, published_at desc);

-- A correction replaces the same release. A later annual forecast is a different release and
-- the database refuses to let it pose as a correction of its predecessor.
--
-- This needs its own supersession guard rather than the shared `allow_only_supersession`,
-- because a planning correction also records what kind of correction it was, and the shared
-- helper treats any fourth changed column as tampering.
create or replace function pipeline.allow_only_planning_vintage_supersession()
returns trigger language plpgsql as $$
declare successor record; old_json jsonb; new_json jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'planning vintages are never deleted: supersede them instead'
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.superseded_by_id is not null then
      raise exception 'a planning vintage is inserted live; supersession is a later act'
        using errcode = 'restrict_violation';
    end if;
    -- A correction is written by marking the predecessor superseded and then inserting the
    -- replacement, so that one live row per release holds at every moment. The predecessor's
    -- forward reference is therefore already present here, and this is where it is checked.
    if exists (
      select 1 from pipeline.planning_forecast_vintages v
       where v.superseded_by_id = new.id
         and (v.native_vintage_key <> new.native_vintage_key
              or v.grid_area_id <> new.grid_area_id
              or v.source_interface_id <> new.source_interface_id)
    ) then
      raise exception 'planning vintage % was offered as a correction of a different source release', new.native_vintage_key
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.superseded_by_id is not null then
    raise exception 'planning vintage % is already superseded and is immutable', old.id
      using errcode = 'restrict_violation';
  end if;
  if new.superseded_by_id is null or new.superseded_at is null
     or new.supersession_reason is null or new.supersession_kind is null then
    raise exception 'superseding a planning vintage sets superseded_by_id, superseded_at, supersession_reason and supersession_kind together'
      using errcode = 'restrict_violation';
  end if;
  old_json := to_jsonb(old) - 'superseded_by_id' - 'superseded_at' - 'supersession_reason' - 'supersession_kind';
  new_json := to_jsonb(new) - 'superseded_by_id' - 'superseded_at' - 'supersession_reason' - 'supersession_kind';
  if old_json <> new_json then
    raise exception 'update on pipeline.planning_forecast_vintages changed columns other than the supersession columns'
      using errcode = 'restrict_violation';
  end if;

  -- The replacement may not exist yet; the deferred foreign key settles that at commit and
  -- the replacement's own insert repeats this comparison from the other side.
  select grid_area_id, source_interface_id, native_vintage_key into successor
    from pipeline.planning_forecast_vintages where id = new.superseded_by_id;
  if not found then return new; end if;
  if successor.native_vintage_key <> new.native_vintage_key
     or successor.grid_area_id <> new.grid_area_id
     or successor.source_interface_id <> new.source_interface_id then
    raise exception
      'a planning vintage may only be superseded by a correction or reissue of the same source release (%), not by %',
      new.native_vintage_key, successor.native_vintage_key
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

comment on function pipeline.allow_only_planning_vintage_supersession() is
  'Trigger: supersession is confined to corrections and reissues of the same publisher release, records its kind, and changes nothing else. A new annual forecast cannot supersede last year''s.';

create trigger planning_forecast_vintages_supersede_only
  before insert or update or delete on pipeline.planning_forecast_vintages
  for each row execute function pipeline.allow_only_planning_vintage_supersession();

-- Scenario identity is vintage-scoped and native. There is no cross-market base case, because
-- ERCOT''s "Adjusted Forecast", PJM''s single staff forecast and the CEC''s "Planning" case are
-- not the same object and pretending otherwise is how a forecast series becomes fiction.

create table pipeline.planning_forecast_scenarios (
  id                    uuid primary key default gen_random_uuid(),
  vintage_id            uuid not null references pipeline.planning_forecast_vintages (id) on delete restrict,
  native_scenario_key   text not null
                          constraint planning_forecast_scenarios_key_nonempty check (btrim(native_scenario_key) <> ''),
  native_scenario_label text not null
                          constraint planning_forecast_scenarios_label_nonempty check (btrim(native_scenario_label) <> ''),
  -- Optional cross-market reading. Null is a legitimate answer and the default.
  canonical_class       text
                          constraint planning_forecast_scenarios_class_allowed
                          check (canonical_class in ('reference', 'high', 'low', 'other')),
  is_reference          boolean not null default false,
  weather_basis         text not null default 'unspecified'
                          constraint planning_forecast_scenarios_weather_allowed
                          check (weather_basis in ('normal', 'p50', 'p90', 'p10', 'p99', 'one_in_two', 'one_in_five',
                                                   'one_in_ten', 'one_in_twenty', 'weather_year', 'extreme', 'unspecified')),
  load_basis            text not null default 'unspecified'
                          constraint planning_forecast_scenarios_load_basis_allowed
                          check (load_basis in ('gross', 'net', 'unspecified')),
  large_load_policy     text not null default 'unspecified'
                          constraint planning_forecast_scenarios_large_load_allowed
                          check (large_load_policy in ('included_all', 'included_screened', 'included_probability_weighted',
                                                       'excluded', 'unspecified')),
  assumptions           jsonb not null default '{}'::jsonb
                          constraint planning_forecast_scenarios_assumptions_object
                          check (jsonb_typeof(assumptions) = 'object'),
  assumptions_text      text,
  created_at            timestamptz not null default now(),
  unique (vintage_id, native_scenario_key),
  constraint planning_forecast_scenarios_reference_is_classed
    check (not is_reference or canonical_class is null or canonical_class = 'reference')
);

comment on table pipeline.planning_forecast_scenarios is
  'A scenario as the publisher named it, scoped to one vintage. canonical_class is an optional reading for cross-market presentation and never replaces the native key and label.';

create unique index planning_forecast_scenarios_one_reference_idx
  on pipeline.planning_forecast_scenarios (vintage_id) where is_reference;

-- Append-only extracted evidence. One row is one cell, table entry or record as it was read
-- out of the artifact, with the locator needed to find it again.

create table pipeline.raw_planning_forecast_records (
  id                 uuid primary key default gen_random_uuid(),
  retrieval_id       uuid not null references pipeline.source_retrievals (id) on delete restrict,
  row_ordinal        integer not null
                       constraint raw_planning_records_ordinal_nonnegative check (row_ordinal >= 0),
  record_hash        text not null
                       constraint raw_planning_records_hash_format check (record_hash ~ '^[0-9a-f]{64}$'),
  artifact_ref       text,
  native_geography   text not null,
  native_period      text not null,
  native_scenario    text,
  native_value       text,
  native_unit        text not null,
  raw_payload        jsonb not null,
  extraction_method  text not null
                       constraint raw_planning_records_method_allowed
                       check (extraction_method in ('workbook_cell', 'pdf_table', 'csv_row', 'html_table', 'manual_transcription')),
  extraction_version text not null
                       constraint raw_planning_records_version_nonempty check (btrim(extraction_version) <> ''),
  workbook_sheet     text,
  workbook_range     text,
  workbook_cell      text,
  pdf_page           integer constraint raw_planning_records_pdf_page_positive check (pdf_page is null or pdf_page > 0),
  pdf_table          text,
  csv_row_number     integer constraint raw_planning_records_csv_row_nonnegative check (csv_row_number is null or csv_row_number >= 0),
  html_selector      text,
  created_at         timestamptz not null default now(),
  unique (retrieval_id, row_ordinal),
  -- Re-extracting the same artifact writes the same hashes; the second attempt is a no-op
  -- rather than a duplicate value.
  unique (retrieval_id, record_hash),
  -- An extraction that cannot say where the number came from is not evidence.
  constraint raw_planning_records_locator_present check (
    case extraction_method
      when 'workbook_cell' then workbook_sheet is not null and (workbook_cell is not null or workbook_range is not null)
      when 'pdf_table'     then pdf_page is not null
      when 'csv_row'       then csv_row_number is not null
      when 'html_table'    then html_selector is not null
      when 'manual_transcription' then artifact_ref is not null
      else false
    end
  )
);

comment on table pipeline.raw_planning_forecast_records is
  'One value as it was extracted from a planning artifact, with its locator. Append-only, and deliberately not part of the EIA hourly raw-power schema: these rows have no period_start, no one-hour interval and no balancing-authority type code.';

create index raw_planning_records_retrieval_idx on pipeline.raw_planning_forecast_records (retrieval_id, row_ordinal);
create index raw_planning_records_hash_idx on pipeline.raw_planning_forecast_records (record_hash);

create trigger raw_planning_forecast_records_append_only
  before update or delete on pipeline.raw_planning_forecast_records
  for each row execute function pipeline.forbid_mutation();

-- Canonical normalized planning points. Annual and seasonal are the common grains; a
-- source-native hourly planning profile is supported without making every planning row hourly.

create table pipeline.planning_forecast_points (
  id                        uuid primary key default gen_random_uuid(),
  vintage_id                uuid not null references pipeline.planning_forecast_vintages (id) on delete restrict,
  scenario_id               uuid not null references pipeline.planning_forecast_scenarios (id) on delete restrict,
  grid_area_id              uuid not null references reference.grid_areas (id) on delete restrict,
  raw_record_id             uuid not null references pipeline.raw_planning_forecast_records (id) on delete restrict,
  geographic_grain          text not null
                              constraint planning_points_grain_allowed
                              check (geographic_grain in ('balancing_authority', 'zone', 'load_area', 'weather_zone',
                                                          'utility', 'sub_region', 'other')),
  -- The publisher''s label for the sub-area, required whenever the point is not the whole area.
  native_geography_label    text,
  target_period_kind        text not null
                              constraint planning_points_period_kind_allowed
                              check (target_period_kind in ('annual', 'seasonal', 'hourly_profile')),
  target_year               integer not null
                              constraint planning_points_target_year_range check (target_year between 1990 and 2200),
  target_season             text
                              constraint planning_points_season_allowed
                              check (target_season in ('winter', 'spring', 'summer', 'fall')),
  target_timestamp          timestamptz,
  value                     numeric not null
                              constraint planning_points_value_finite check (value <> 'NaN'::numeric),
  unit                      text not null
                              constraint planning_points_unit_allowed check (unit in ('MW', 'GW', 'MWh', 'GWh')),
  peak_type                 text not null
                              constraint planning_points_peak_type_allowed
                              check (peak_type in ('coincident_peak', 'non_coincident_peak', 'hourly_load',
                                                   'annual_energy', 'average_load', 'unspecified')),
  weather_basis             text not null
                              constraint planning_points_weather_allowed
                              check (weather_basis in ('normal', 'p50', 'p90', 'p10', 'p99', 'one_in_two', 'one_in_five',
                                                       'one_in_ten', 'one_in_twenty', 'weather_year', 'extreme', 'unspecified')),
  load_basis                text not null
                              constraint planning_points_load_basis_allowed
                              check (load_basis in ('gross', 'net', 'unspecified')),
  large_load_policy         text not null
                              constraint planning_points_large_load_allowed
                              check (large_load_policy in ('included_all', 'included_screened', 'included_probability_weighted',
                                                           'excluded', 'unspecified')),
  source_methodology_name   text,
  source_methodology_version text,
  quality_status            text not null default 'provisional'
                              constraint planning_points_quality_allowed
                              check (quality_status in ('accepted', 'provisional', 'suspect')),
  superseded_by_id          uuid references pipeline.planning_forecast_points (id) on delete restrict
                              deferrable initially deferred,
  superseded_at             timestamptz,
  supersession_reason       text,
  created_at                timestamptz not null default now(),
  constraint planning_points_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint planning_points_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id),
  -- The three grains, each with the fields it needs and none of the fields it does not.
  constraint planning_points_grain_fields check (
    case target_period_kind
      when 'annual'         then target_season is null and target_timestamp is null
      when 'seasonal'       then target_season is not null and target_timestamp is null
      when 'hourly_profile' then target_timestamp is not null
      else false
    end
  ),
  constraint planning_points_hourly_matches_target_year
    check (target_timestamp is null or extract(year from target_timestamp at time zone 'UTC') between target_year - 1 and target_year + 1),
  constraint planning_points_sub_area_is_labelled
    check (geographic_grain = 'balancing_authority' or (native_geography_label is not null and btrim(native_geography_label) <> '')),
  constraint planning_points_energy_unit_matches_peak_type check (
    (peak_type = 'annual_energy') = (unit in ('MWh', 'GWh'))
  )
);

comment on table pipeline.planning_forecast_points is
  'Canonical planning values. Annual and seasonal peaks carry no timestamp; an hourly profile carries one because the source published one. Nothing here is an hourly operational measurement and none of it may enter pipeline.power_observations.';
comment on column pipeline.planning_forecast_points.target_timestamp is
  'Set only where the source itself published an hourly planning profile. Its presence is a property of that one point, never a requirement on planning data as a whole.';

create unique index planning_forecast_points_current_idx
  on pipeline.planning_forecast_points
  (scenario_id, geographic_grain, native_geography_label, target_period_kind, target_year,
   target_season, target_timestamp, peak_type)
  nulls not distinct
  where superseded_by_id is null;
create index planning_forecast_points_vintage_idx
  on pipeline.planning_forecast_points (vintage_id, target_year);
create index planning_forecast_points_market_year_idx
  on pipeline.planning_forecast_points (grid_area_id, target_year, target_period_kind);

-- A point belongs to its scenario''s vintage and to that vintage''s market. The lineage is
-- checked rather than assumed, because the whole model rests on a value never drifting away
-- from the release that published it.
create or replace function pipeline.check_planning_point_lineage()
returns trigger language plpgsql as $$
declare scenario record; vintage record;
begin
  select vintage_id into scenario from pipeline.planning_forecast_scenarios where id = new.scenario_id;
  if scenario.vintage_id <> new.vintage_id then
    raise exception 'planning point scenario % belongs to vintage %, not %',
      new.scenario_id, scenario.vintage_id, new.vintage_id using errcode = 'check_violation';
  end if;
  select grid_area_id into vintage from pipeline.planning_forecast_vintages where id = new.vintage_id;
  if vintage.grid_area_id <> new.grid_area_id then
    raise exception 'planning point grid area % disagrees with its vintage %',
      new.grid_area_id, new.vintage_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

comment on function pipeline.check_planning_point_lineage() is
  'Trigger: a planning point''s scenario must belong to its vintage, and its market must be the vintage''s market.';

create trigger planning_forecast_points_lineage_check
  before insert on pipeline.planning_forecast_points
  for each row execute function pipeline.check_planning_point_lineage();
create trigger planning_forecast_points_supersede_only
  before update or delete on pipeline.planning_forecast_points
  for each row execute function pipeline.allow_only_supersession();

-- ------------------------------------------------- operational / planning separation, enforced
--
-- PD-2''s raw store was written for two EIA type codes and nothing else, but said so only in a
-- comment. Make it a constraint, so an attempt to file a planning type code in the hourly
-- operational evidence table fails at the database rather than later.

alter table pipeline.raw_power_records
  add constraint raw_power_records_native_type_operational
    check (native_type in ('D', 'DF'));

comment on constraint raw_power_records_native_type_operational on pipeline.raw_power_records is
  'EIA-930 observed demand and day-ahead operational forecast only. Planning forecasts are a different domain with their own evidence table; they may not be filed here under any type code.';

revoke update, delete, truncate on
  pipeline.retrieval_rights_snapshots,
  pipeline.planning_forecast_vintages,
  pipeline.planning_forecast_scenarios,
  pipeline.raw_planning_forecast_records,
  pipeline.planning_forecast_points
from service_role;

alter table reference.source_rights_classifications enable row level security;
alter table reference.source_use_purposes           enable row level security;
alter table reference.source_use_permissions        enable row level security;
alter table pipeline.retrieval_rights_snapshots     enable row level security;
alter table pipeline.planning_forecast_vintages     enable row level security;
alter table pipeline.planning_forecast_scenarios    enable row level security;
alter table pipeline.raw_planning_forecast_records  enable row level security;
alter table pipeline.planning_forecast_points       enable row level security;
