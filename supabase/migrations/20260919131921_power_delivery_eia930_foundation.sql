-- PD-2: EIA-930 hourly operational load foundation.
--
-- This migration deliberately does not touch the Power Analytics demo. It establishes an
-- independent physical-grid universe, immutable EIA evidence, revision-aware canonical hourly
-- observations, and an operational run ledger. Planning forecasts, deliverable capacity and
-- delivery gap do not exist in this schema.

-- -------------------------------------------------------------- physical grid reference data

create table reference.grid_operators (
  id              uuid primary key,
  slug            text not null unique
                    constraint grid_operators_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name    text not null,
  timezone_name   text not null,
  effective_from timestamptz not null,
  effective_to   timestamptz,
  created_at      timestamptz not null default now(),
  constraint grid_operators_interval_ordered check (effective_to is null or effective_to > effective_from)
);

create table reference.grid_areas (
  id              uuid primary key,
  operator_id     uuid not null references reference.grid_operators (id) on delete restrict,
  slug            text not null unique
                    constraint grid_areas_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name    text not null,
  eia_ba_code     text not null unique
                    constraint grid_areas_eia_code_format check (eia_ba_code ~ '^[A-Z0-9]{2,8}$'),
  timezone_name   text not null,
  effective_from timestamptz not null,
  effective_to   timestamptz,
  created_at      timestamptz not null default now(),
  constraint grid_areas_interval_ordered check (effective_to is null or effective_to > effective_from)
);

create table reference.grid_universes (
  id           uuid primary key,
  slug         text not null unique
                 constraint grid_universes_slug_format check (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  display_name text not null,
  description  text not null,
  created_at   timestamptz not null default now()
);

create table reference.grid_universe_versions (
  id             uuid primary key,
  universe_id    uuid not null references reference.grid_universes (id) on delete restrict,
  version        integer not null constraint grid_universe_versions_version_positive check (version > 0),
  effective_from timestamptz not null,
  effective_to   timestamptz,
  created_at     timestamptz not null default now(),
  unique (universe_id, version),
  constraint grid_universe_versions_interval_ordered check (effective_to is null or effective_to > effective_from)
);

create unique index grid_universe_versions_one_current_idx
  on reference.grid_universe_versions (universe_id) where effective_to is null;

create table reference.grid_area_memberships (
  universe_version_id uuid not null references reference.grid_universe_versions (id) on delete restrict,
  grid_area_id        uuid not null references reference.grid_areas (id) on delete restrict,
  ordinal             smallint not null constraint grid_area_memberships_ordinal_positive check (ordinal > 0),
  created_at          timestamptz not null default now(),
  primary key (universe_version_id, grid_area_id),
  unique (universe_version_id, ordinal)
);

comment on table reference.grid_areas is
  'Physical balancing-authority areas used by Power Delivery. Identity is independent of UEPI and every market-price instrument.';
comment on table reference.grid_universe_versions is
  'A dated membership definition for a named physical-grid aggregate. Historical aggregates resolve the version effective for their interval and are never restated by later membership changes.';

-- EIA already exists as a news publisher. Promote its provider classification rather than
-- creating a second EIA identity, then register the operational API as its own interface.
update reference.providers set provider_kind = 'statistical_compiler' where slug = 'us-eia';

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface', 'catalog_price_interface', 'availability_interface',
    'product_reference_documentation', 'hardware_reference_documentation',
    'provider_terms_documentation', 'price_surface', 'news_feed', 'statistical_dataset',
    'exchange_rate_series', 'chain_data_interface', 'spot_price_interface',
    'usage_dataset_interface', 'benchmark_dataset_interface', 'regulatory_filing_repository',
    'equity_eod_price_interface', 'issuer_fundamentals_interface',
    -- Hourly measured or forecast grid operations, distinct from economic statistics.
    'power_system_operational_data'
  ));

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   notes, terms_evidence, terms_artifact_url, terms_artifact_hash,
   terms_artifact_bytes, terms_artifact_status, terms_retrieved_at,
   automated_retrieval_available)
select
  '93000000-0000-4000-8000-000000000001', p.id,
  'eia-930-region-data', 'EIA Form 930 hourly balancing-authority operations',
  'power_system_operational_data', 'https://api.eia.gov/v2/electricity/rto/region-data/data/', true,
  'api_key', 'production_approved', 'permitted', 'permitted',
  'Canonical PD-2 source. Only hourly D (observed demand) and DF (day-ahead operational demand forecast) for the seven versioned grid areas are admitted.',
  jsonb_build_object(
    'reviewed_on', '2026-09-19',
    'documents', jsonb_build_array(
      jsonb_build_object(
        'title', 'EIA Copyrights and Reuse',
        'url', 'https://www.eia.gov/about/copyrights_reuse.php',
        'clauses', jsonb_build_array(jsonb_build_object(
          'axis', 'data_use',
          'text', 'U.S. government publications are in the public domain. EIA permits use and distribution of its data, files, databases, reports, graphs, charts, and other information products.',
          'note', 'EIA requests acknowledgement including the publication date.'))),
      jsonb_build_object(
        'title', 'EIA Open Data API Terms of Service',
        'url', 'https://www.eia.gov/opendata/terms-of-service.php',
        'note', 'Permits services that search, display, analyze, retrieve and view EIA data; attribution must not imply EIA endorsement.'))),
  'https://www.eia.gov/about/copyrights_reuse.php',
  '4758216ebe7e50dc7a62b97234b4d208c3d48ffc92f1a0b81f1c78d26508b8d6',
  52317, 200, '2026-09-19T13:31:00Z', true
from reference.providers p where p.slug = 'us-eia'
on conflict (slug) do nothing;

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use, covers_internal_use, covers_index_calculation,
   covers_storage, covers_historical_retention, covers_post_termination_retention,
   covers_historical_reconstruction, covers_index_level_publication,
   covers_constituent_publication, covers_weight_publication,
   covers_membership_change_publication, covers_raw_redistribution,
   rights_layer, termination_obligation, attribution_required, attribution_text,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
select
  '93000000-0000-4000-8000-000000000002', s.id, 'provider_terms',
  'EIA Copyrights and Reuse plus EIA Open Data API Terms of Service, reviewed 2026-09-19.',
  true, true, true, true, true, true, true, true, true, true, true, true, true,
  'regulator', 'none', true,
  'Source: U.S. Energy Information Administration, Form EIA-930, Hourly Electric Grid Monitor. Retrieved via the EIA Open Data API. EIA does not endorse Urdais or its analysis.',
  timestamptz '2026-09-19T00:00:00Z',
  'EIA states that U.S. government publications are public domain and expressly permits use and distribution of its data products. The Open Data terms permit retrieval, display and analysis.',
  'You may use and/or distribute any of our data, files, databases, reports, graphs, charts, and other information products.',
  'Urdais research', date '2026-09-19'
from reference.source_interfaces s where s.slug = 'eia-930-region-data'
on conflict (id) do nothing;

-- Stable IDs. Their order is presentation metadata only; membership is the versioned relation.
insert into reference.grid_operators (id, slug, display_name, timezone_name, effective_from) values
  ('93000000-0000-4000-8100-000000000001', 'ercot',  'Electric Reliability Council of Texas', 'America/Chicago',  '2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8100-000000000002', 'pjm',    'PJM Interconnection',                   'America/New_York', '2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8100-000000000003', 'miso',   'Midcontinent Independent System Operator','America/Chicago', '2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8100-000000000004', 'spp',    'Southwest Power Pool',                  'America/Chicago',  '2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8100-000000000005', 'caiso',  'California Independent System Operator','America/Los_Angeles','2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8100-000000000006', 'nyiso',  'New York Independent System Operator',  'America/New_York', '2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8100-000000000007', 'iso-ne', 'ISO New England',                       'America/New_York', '2019-01-01T00:00:00Z');

insert into reference.grid_areas
  (id, operator_id, slug, display_name, eia_ba_code, timezone_name, effective_from) values
  ('93000000-0000-4000-8200-000000000001','93000000-0000-4000-8100-000000000001','ercot','ERCOT','ERCO','America/Chicago','2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8200-000000000002','93000000-0000-4000-8100-000000000002','pjm','PJM','PJM','America/New_York','2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8200-000000000003','93000000-0000-4000-8100-000000000003','miso','MISO','MISO','America/Chicago','2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8200-000000000004','93000000-0000-4000-8100-000000000004','spp','SPP','SWPP','America/Chicago','2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8200-000000000005','93000000-0000-4000-8100-000000000005','caiso','CAISO','CISO','America/Los_Angeles','2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8200-000000000006','93000000-0000-4000-8100-000000000006','nyiso','NYISO','NYIS','America/New_York','2019-01-01T00:00:00Z'),
  ('93000000-0000-4000-8200-000000000007','93000000-0000-4000-8100-000000000007','iso-ne','ISO-NE','ISNE','America/New_York','2019-01-01T00:00:00Z');

insert into reference.grid_universes (id, slug, display_name, description) values
  ('93000000-0000-4000-8300-000000000001', 'seven_organized_us_wholesale_markets',
   'Seven organized U.S. wholesale markets',
   'ERCOT, PJM, MISO, SPP, CAISO, NYISO and ISO-NE as physical EIA balancing-authority areas; not national U.S. load.');
insert into reference.grid_universe_versions (id, universe_id, version, effective_from) values
  ('93000000-0000-4000-8300-000000000002','93000000-0000-4000-8300-000000000001',1,'2019-01-01T00:00:00Z');
insert into reference.grid_area_memberships (universe_version_id, grid_area_id, ordinal) values
  ('93000000-0000-4000-8300-000000000002','93000000-0000-4000-8200-000000000001',1),
  ('93000000-0000-4000-8300-000000000002','93000000-0000-4000-8200-000000000002',2),
  ('93000000-0000-4000-8300-000000000002','93000000-0000-4000-8200-000000000003',3),
  ('93000000-0000-4000-8300-000000000002','93000000-0000-4000-8200-000000000004',4),
  ('93000000-0000-4000-8300-000000000002','93000000-0000-4000-8200-000000000005',5),
  ('93000000-0000-4000-8300-000000000002','93000000-0000-4000-8200-000000000006',6),
  ('93000000-0000-4000-8300-000000000002','93000000-0000-4000-8200-000000000007',7);

create table reference.power_metrics (
  id                 uuid primary key,
  code               text not null unique,
  display_name       text not null,
  eia_type_code      text not null unique,
  canonical_unit     text not null constraint power_metrics_unit_mw check (canonical_unit = 'MW'),
  temporal_resolution text not null constraint power_metrics_resolution_hourly check (temporal_resolution = 'hourly'),
  value_status       text not null constraint power_metrics_value_status_allowed check (value_status in ('observed','forecast')),
  description        text not null,
  created_at         timestamptz not null default now()
);

insert into reference.power_metrics values
  ('93000000-0000-4000-8400-000000000001','actual_load','Actual load','D','MW','hourly','observed','EIA-930 hourly observed demand (D).',now()),
  ('93000000-0000-4000-8400-000000000002','operational_demand_forecast','Operational demand forecast','DF','MW','hourly','forecast','EIA-930 hourly day-ahead operational demand forecast (DF), not a planning forecast.',now());

-- ---------------------------------------------------------------- evidence and observations

create table pipeline.raw_power_records (
  id                    uuid primary key default gen_random_uuid(),
  retrieval_id          uuid not null references pipeline.source_retrievals (id) on delete restrict,
  row_ordinal           integer not null constraint raw_power_records_ordinal_nonnegative check (row_ordinal >= 0),
  record_hash           text not null constraint raw_power_records_hash_format check (record_hash ~ '^[0-9a-f]{64}$'),
  grid_area_id          uuid not null references reference.grid_areas (id) on delete restrict,
  power_metric_id       uuid not null references reference.power_metrics (id) on delete restrict,
  native_respondent     text not null,
  native_type           text not null,
  native_period         text not null,
  period_start          timestamptz not null,
  period_end            timestamptz not null,
  native_value          text,
  native_unit           text not null,
  normalized_value_mw   numeric,
  normalization_status  text not null constraint raw_power_records_status_allowed check (normalization_status in ('available','source_unavailable')),
  raw_payload           jsonb not null,
  created_at            timestamptz not null default now(),
  unique (retrieval_id, row_ordinal),
  unique (retrieval_id, record_hash),
  constraint raw_power_records_one_hour check (period_end = period_start + interval '1 hour'),
  constraint raw_power_records_value_status_consistent check (
    (normalization_status = 'available' and normalized_value_mw is not null) or
    (normalization_status = 'source_unavailable' and normalized_value_mw is null)
  )
);

create table pipeline.power_observations (
  id                    uuid primary key,
  raw_power_record_id   uuid not null unique references pipeline.raw_power_records (id) on delete restrict,
  grid_area_id          uuid not null references reference.grid_areas (id) on delete restrict,
  power_metric_id       uuid not null references reference.power_metrics (id) on delete restrict,
  period_start          timestamptz not null,
  period_end            timestamptz not null,
  temporal_resolution   text not null constraint power_observations_resolution_hourly check (temporal_resolution = 'hourly'),
  value_mw              numeric not null constraint power_observations_value_nonnegative check (value_mw >= 0 and value_mw <> 'NaN'::numeric),
  unit                  text not null constraint power_observations_unit_mw check (unit = 'MW'),
  value_status          text not null constraint power_observations_value_status_allowed check (value_status in ('observed','forecast')),
  source_effective_at   timestamptz not null,
  source_published_at   timestamptz,
  retrieved_at          timestamptz not null,
  quality_status        text not null constraint power_observations_quality_allowed check (quality_status in ('accepted','provisional','suspect')),
  superseded_by_id      uuid references pipeline.power_observations (id) on delete restrict deferrable initially deferred,
  superseded_at         timestamptz,
  supersession_reason   text,
  created_at            timestamptz not null default now(),
  constraint power_observations_one_hour check (period_end = period_start + interval '1 hour'),
  constraint power_observations_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  )
);

create unique index power_observations_current_idx
  on pipeline.power_observations (grid_area_id, power_metric_id, period_start)
  where superseded_by_id is null;
create index power_observations_history_idx
  on pipeline.power_observations (grid_area_id, power_metric_id, period_start desc, retrieved_at desc);

create or replace function pipeline.check_power_observation()
returns trigger language plpgsql as $$
declare raw record; metric record;
begin
  select * into raw from pipeline.raw_power_records where id = new.raw_power_record_id;
  select * into metric from reference.power_metrics where id = new.power_metric_id;
  if raw.grid_area_id <> new.grid_area_id or raw.power_metric_id <> new.power_metric_id
     or raw.period_start <> new.period_start or raw.period_end <> new.period_end
     or raw.normalized_value_mw is distinct from new.value_mw then
    raise exception 'power observation does not reproduce raw record %', new.raw_power_record_id
      using errcode = 'check_violation';
  end if;
  if metric.value_status <> new.value_status then
    raise exception 'power observation status % disagrees with metric %', new.value_status, metric.code
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger power_observations_check before insert on pipeline.power_observations
  for each row execute function pipeline.check_power_observation();
create trigger raw_power_records_append_only before update or delete on pipeline.raw_power_records
  for each row execute function pipeline.forbid_mutation();
create trigger power_observations_supersede_only before update or delete on pipeline.power_observations
  for each row execute function pipeline.allow_only_supersession();

create table pipeline.power_ingestion_runs (
  id                    uuid primary key default gen_random_uuid(),
  trigger_kind          text not null constraint power_ingestion_runs_trigger_allowed check (trigger_kind in ('scheduled','operator','backfill')),
  requested_start       timestamptz not null,
  requested_end         timestamptz not null,
  started_at            timestamptz not null,
  completed_at          timestamptz not null,
  outcome               text not null constraint power_ingestion_runs_outcome_allowed check (outcome in ('succeeded','partial','failed')),
  retrieval_count       integer not null default 0,
  raw_record_count      integer not null default 0,
  observation_inserts   integer not null default 0,
  observation_revisions integer not null default 0,
  unchanged_count       integer not null default 0,
  unavailable_count     integer not null default 0,
  detail                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  constraint power_ingestion_runs_range_ordered check (requested_end > requested_start),
  constraint power_ingestion_runs_time_ordered check (completed_at >= started_at)
);
create index power_ingestion_runs_completed_idx on pipeline.power_ingestion_runs (completed_at desc);
create trigger power_ingestion_runs_append_only before update or delete on pipeline.power_ingestion_runs
  for each row execute function pipeline.forbid_mutation();

revoke update, delete, truncate on pipeline.raw_power_records, pipeline.power_observations, pipeline.power_ingestion_runs from service_role;

alter table reference.grid_operators         enable row level security;
alter table reference.grid_areas             enable row level security;
alter table reference.grid_universes         enable row level security;
alter table reference.grid_universe_versions enable row level security;
alter table reference.grid_area_memberships  enable row level security;
alter table reference.power_metrics          enable row level security;
alter table pipeline.raw_power_records       enable row level security;
alter table pipeline.power_observations      enable row level security;
alter table pipeline.power_ingestion_runs    enable row level security;

-- Bootstrap assertions: no accidental eighth member and no demo-only canonical metric.
do $$
declare n integer;
begin
  select count(*) into n from reference.grid_area_memberships
   where universe_version_id = '93000000-0000-4000-8300-000000000002';
  if n <> 7 then raise exception 'PD-2 V1 universe must contain exactly seven areas, found %', n; end if;
  if exists (select 1 from reference.power_metrics where code in ('planning_demand_forecast','deliverable_capacity','delivery_gap')) then
    raise exception 'PD-2 seeded an excluded metric';
  end if;
end $$;
