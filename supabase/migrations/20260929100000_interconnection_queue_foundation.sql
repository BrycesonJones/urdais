-- IQ-2: the canonical interconnection queue, and the wall between it and capacity.
--
-- A queue row is a *request to connect*. It is not accredited capacity, not deliverable capacity,
-- not installed capacity, and not transmission headroom. IQ-1 proved this from the artifacts
-- rather than by assertion: PJM publishes four MW columns spanning 17.8x for the same projects,
-- SPP six spanning 3.9x, ERCOT one that is a *net change* and goes to -53.3 MW, and 726 of
-- ISO-NE's 1,751 rows are capacity-rights requests against plant that already exists.
--
-- Two design decisions follow from that and shape everything below.
--
-- First, there is no capacity_mw column anywhere in this schema, and there never will be. Every
-- native MW field becomes its own typed row in interconnection_request_quantities, carrying the
-- publisher's own field name. Choosing one and calling it "the" queue MW is the single most
-- likely way for this product to publish a wrong number, so the schema makes it impossible to do
-- by accident: there is no column to put it in.
--
-- Second, identity is (market, native queue id) and nothing else. Names, counties, substations,
-- developers and technologies all move between snapshots; IQ-1 found CAISO withdrawn projects
-- whose name is literally "Project Name - Confidential". Merging two native ids because they look
-- like the same physical project is a judgement this pipeline is not permitted to make.

-- ---------------------------------------------------------------- reference vocabularies

create table reference.interconnection_lifecycle_stages (
  code        text primary key
                constraint interconnection_lifecycle_stages_code_lower
                check (code = lower(btrim(code)) and code <> ''),
  label       text not null constraint interconnection_lifecycle_stages_label_nonempty check (btrim(label) <> ''),
  -- Terminal means the request has left the queue: it will not progress further under this id.
  -- The stock of an active queue is every request whose latest observation is non-terminal.
  is_terminal boolean not null,
  sort_order  integer not null,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (sort_order)
);

comment on table reference.interconnection_lifecycle_stages is
  'Normalized lifecycle stages for an interconnection request. Deliberately coarse: only stages that at least one of the ingested markets distinguishes in its own published status. Native status is always preserved alongside.';

insert into reference.interconnection_lifecycle_stages (code, label, is_terminal, sort_order, notes) values
  ('requested', 'Requested', false, 10,
   'An interconnection request exists and no study has started.'),
  ('study', 'Under study', false, 20,
   'Feasibility, system impact or facilities study in progress or complete, with no agreement yet.'),
  ('agreement_pending', 'Agreement pending', false, 30,
   'Studies complete and an interconnection agreement is being negotiated or tendered.'),
  ('agreement_executed', 'Agreement executed', false, 40,
   'An interconnection agreement is executed. Not operational: PJM and MISO both publish projects that hold an executed agreement for years.'),
  ('under_construction', 'Under construction', false, 50,
   'The publisher states construction has begun. PJM and MISO publish this distinctly and it is emphatically not operational.'),
  ('suspended', 'Suspended', false, 60,
   'The request is paused at the customer''s or the operator''s request and may resume. Not terminal: PJM suspension is routinely lifted.'),
  ('operational', 'Operational', true, 70,
   'The publisher states the project reached commercial operation or is in service. Only ever set from an explicit operational signal, never from a proposed date.'),
  ('withdrawn', 'Withdrawn', true, 80,
   'The request left the queue without connecting. Includes cancelled, retracted and annulled, whose native values are preserved; no market publicly defines the difference.'),
  ('unknown', 'Unknown', false, 90,
   'The native status did not map. Deliberately non-terminal so an unmapped value never silently removes a request from the active stock.');

create table reference.interconnection_request_classes (
  code       text primary key
               constraint interconnection_request_classes_code_lower
               check (code = lower(btrim(code)) and code <> ''),
  label      text not null constraint interconnection_request_classes_label_nonempty check (btrim(label) <> ''),
  notes      text,
  created_at timestamptz not null default now()
);

comment on table reference.interconnection_request_classes is
  'What kind of thing is asking to connect. Extensible because NYISO publishes a load interconnection queue with an end-use classification, which no market ingested in IQ-2 exposes.';

insert into reference.interconnection_request_classes (code, label, notes) values
  ('generation', 'Generation', 'A generating facility seeking to inject power.'),
  ('storage', 'Storage', 'A storage facility. Separated from generation because it both injects and withdraws.'),
  ('mixed', 'Mixed', 'More than one resource class under one request, such as a co-located solar and battery project.'),
  ('load', 'Load', 'A load seeking service. Not exercised by the IQ-2 markets; NYISO publishes these separately.'),
  ('transmission', 'Transmission', 'A merchant transmission or transmission-service request, not a generator.'),
  ('unknown', 'Unknown', 'The source did not state a class this pipeline could map.');

-- The quantity vocabulary is the load-bearing one. Each code names a *meaning*, and the native
-- field name is stored beside every value so the publisher's own term is never lost.
create table reference.interconnection_quantity_kinds (
  code            text primary key
                    constraint interconnection_quantity_kinds_code_lower
                    check (code = lower(btrim(code)) and code <> ''),
  label           text not null constraint interconnection_quantity_kinds_label_nonempty check (btrim(label) <> ''),
  -- True where the quantity describes the whole request; false where it describes one component
  -- of it. Component quantities are never additive into a project total.
  is_project_level boolean not null,
  notes           text,
  created_at      timestamptz not null default now()
);

comment on table reference.interconnection_quantity_kinds is
  'The distinct MW meanings the sources publish. There is no "the" queue MW: PJM alone publishes four of these for the same project, and they differ by up to 17.8x in aggregate.';

insert into reference.interconnection_quantity_kinds (code, label, is_project_level, notes) values
  ('maximum_facility_output', 'Maximum facility output', true,
   'The largest output the facility could produce. PJM MaximumFacilityOutput. Not a service level and not a capacity right.'),
  ('energy_service_mw', 'Energy interconnection service MW', true,
   'MW requested or granted under energy-only interconnection service (ERIS). PJM MWEnergy, MISO dp*ErisMw.'),
  ('capacity_service_mw', 'Capacity interconnection service MW', true,
   'MW requested or granted under network/capacity interconnection service (NRIS/CRIS). PJM MWCapacity, MISO dp*NrisMw. Still a service right, not accredited capacity.'),
  ('in_service_mw', 'In-service MW', true,
   'MW the publisher states are actually in service. PJM MWInService.'),
  ('net_mw_to_grid', 'Net MW to grid', true,
   'The project-level net injection the publisher states. CAISO Net MWs to Grid. Authoritative for CAISO project size; never derived from components.'),
  ('summer_mw', 'Summer MW', true, 'Summer-rated MW as published. MISO summerNetMW.'),
  ('winter_mw', 'Winter MW', true, 'Winter-rated MW as published. MISO winterNetMW.'),
  ('component_mw', 'Component MW', false,
   'MW published for one named component of a request. CAISO MW-1/2/3. Descriptive composition only: CAISO publishes Wind 38 and Battery 38 for a project whose net to grid is 38, not 76.'),
  ('other_mw', 'Other MW', true,
   'A published MW whose meaning this pipeline has not mapped. Recorded with its native field name and deferred rather than dropped.');

create table reference.interconnection_technologies (
  code        text primary key
                constraint interconnection_technologies_code_lower
                check (code = lower(btrim(code)) and code <> ''),
  label       text not null constraint interconnection_technologies_label_nonempty check (btrim(label) <> ''),
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table reference.interconnection_technologies is
  'Normalized technology families. Native labels are always preserved on the resource row; this is a grouping, not a replacement.';

insert into reference.interconnection_technologies (code, label, notes) values
  ('solar', 'Solar', null),
  ('wind', 'Wind', 'Includes offshore wind, which PJM and ISO-NE distinguish natively.'),
  ('battery_storage', 'Battery storage', null),
  ('natural_gas', 'Natural gas', null),
  ('nuclear', 'Nuclear', null),
  ('hydro', 'Hydro', 'Includes pumped storage where the source says so.'),
  ('geothermal', 'Geothermal', null),
  ('biomass', 'Biomass', null),
  ('coal', 'Coal', null),
  ('other_generation', 'Other generation', 'A generating technology the source names but this vocabulary does not yet split out.'),
  ('hybrid', 'Hybrid', 'Used only where the source itself encodes more than one resource. Never inferred from a compound fuel string: ISO-NE''s DFO NG is one dual-fuel machine, not a hybrid.'),
  ('transmission', 'Transmission', null),
  ('load', 'Load', null),
  ('unknown', 'Unknown', 'The source published no technology, or published one this pipeline has not mapped.');

-- ---------------------------------------------------------------- source snapshots

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
    'power_system_capacity_assessment',
    -- A published list of requests to interconnect. Distinct from a capacity assessment: it
    -- describes what has asked to connect, never what is available to serve load.
    'interconnection_queue'
  ));

create table pipeline.interconnection_queue_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  grid_area_id          uuid not null references reference.grid_areas (id) on delete restrict,
  retrieval_id          uuid not null references pipeline.source_retrievals (id) on delete restrict,

  -- Reproducible identity for one observed state of the source. PJM and MISO refresh
  -- continuously and publish no release key, so the content hash is the only honest identity;
  -- CAISO stamps a report run date. Both cases are covered by hashing the artifact and letting
  -- the source's own key, where it has one, sit beside it.
  native_snapshot_key   text not null
                          constraint interconnection_snapshots_key_nonempty check (btrim(native_snapshot_key) <> ''),
  artifact_sha256       text not null
                          constraint interconnection_snapshots_sha256_format
                          check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  -- What the publisher says about its own freshness, where it says anything at all.
  source_published_at   timestamptz,
  observed_at           timestamptz not null,

  currentness_status    text not null
                          constraint interconnection_snapshots_currentness_allowed
                          check (currentness_status in ('current', 'stale', 'unavailable')),
  is_latest             boolean not null default true,
  record_count          integer not null
                          constraint interconnection_snapshots_record_count_nonneg check (record_count >= 0),
  notes                 text,
  created_at            timestamptz not null default now(),

  unique (source_interface_id, artifact_sha256, native_snapshot_key)
);

comment on table pipeline.interconnection_queue_snapshots is
  'One observed state of one queue source. Re-fetching byte-identical content resolves to the snapshot already recorded; changed content is a new snapshot and, downstream, a new observed source state.';

create unique index interconnection_snapshots_latest_idx
  on pipeline.interconnection_queue_snapshots (source_interface_id)
  where is_latest;
create index interconnection_snapshots_observed_idx
  on pipeline.interconnection_queue_snapshots (source_interface_id, observed_at desc);

create trigger interconnection_queue_snapshots_append_only
  before delete on pipeline.interconnection_queue_snapshots
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- raw evidence

create table pipeline.raw_interconnection_queue_records (
  id                  uuid primary key default gen_random_uuid(),
  snapshot_id         uuid not null references pipeline.interconnection_queue_snapshots (id) on delete restrict,
  retrieval_id        uuid not null references pipeline.source_retrievals (id) on delete restrict,
  artifact_sha256     text not null
                        constraint raw_interconnection_sha256_format check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  -- Identity of this row's content within this artifact, so a rerun writes no second copy.
  record_hash         text not null
                        constraint raw_interconnection_record_hash_format check (record_hash ~ '^[0-9a-f]{64}$'),
  native_queue_id     text not null
                        constraint raw_interconnection_native_id_nonempty check (btrim(native_queue_id) <> ''),
  -- Where in the artifact this came from: XML element path and ordinal, JSON index, sheet and row.
  locator             jsonb not null
                        constraint raw_interconnection_locator_object check (jsonb_typeof(locator) = 'object'),
  payload             jsonb not null
                        constraint raw_interconnection_payload_object check (jsonb_typeof(payload) = 'object'),
  extraction_version  text not null
                        constraint raw_interconnection_extraction_nonempty check (btrim(extraction_version) <> ''),
  created_at          timestamptz not null default now(),

  unique (snapshot_id, record_hash)
);

comment on table pipeline.raw_interconnection_queue_records is
  'The publisher''s own row, verbatim, with the locator that finds it again in the artifact. No canonical observation may exist without one of these behind it.';

create index raw_interconnection_queue_idx
  on pipeline.raw_interconnection_queue_records (native_queue_id);
create index raw_interconnection_snapshot_idx
  on pipeline.raw_interconnection_queue_records (snapshot_id);

create trigger raw_interconnection_queue_records_immutable
  before update or delete on pipeline.raw_interconnection_queue_records
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- stable identity

create table pipeline.interconnection_requests (
  id                    uuid primary key default gen_random_uuid(),
  grid_area_id          uuid not null references reference.grid_areas (id) on delete restrict,
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  native_queue_id       text not null
                          constraint interconnection_requests_native_id_nonempty check (btrim(native_queue_id) <> ''),

  first_seen_snapshot_id uuid not null references pipeline.interconnection_queue_snapshots (id) on delete restrict,
  first_seen_at          timestamptz not null,
  created_at             timestamptz not null default now(),

  -- Identity is the market and the publisher's own queue id. Nothing else. Every other field a
  -- publisher prints about a project is mutable, and several are explicitly redacted.
  unique (grid_area_id, source_interface_id, native_queue_id)
);

comment on table pipeline.interconnection_requests is
  'Durable identity for one interconnection request, keyed on market and native queue id alone. Two native ids are never merged because the projects look alike; a relationship between them requires the source to state one.';

create index interconnection_requests_area_idx on pipeline.interconnection_requests (grid_area_id);

-- Identity never changes. A request may gain observations forever; the row itself is fixed.
create trigger interconnection_requests_immutable
  before update or delete on pipeline.interconnection_requests
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- observations

create table pipeline.interconnection_request_observations (
  id                    uuid primary key default gen_random_uuid(),
  request_id            uuid not null references pipeline.interconnection_requests (id) on delete restrict,

  -- The snapshot in which this state first appeared, and the one that most recently confirmed it.
  -- An unchanged daily retrieval advances last_seen rather than writing a second identical row:
  -- CAISO alone would otherwise add 2,285 duplicate observations every day.
  first_snapshot_id     uuid not null references pipeline.interconnection_queue_snapshots (id) on delete restrict,
  last_snapshot_id      uuid not null references pipeline.interconnection_queue_snapshots (id) on delete restrict,
  first_raw_record_id   uuid not null references pipeline.raw_interconnection_queue_records (id) on delete restrict,
  last_raw_record_id    uuid not null references pipeline.raw_interconnection_queue_records (id) on delete restrict,

  observation_ordinal   integer not null
                          constraint interconnection_observations_ordinal_positive check (observation_ordinal >= 1),
  -- Content identity over every material normalized field. Equal hash means the publisher is
  -- saying the same thing, so no new observation is created.
  observation_hash      text not null
                          constraint interconnection_observations_hash_format check (observation_hash ~ '^[0-9a-f]{64}$'),
  is_latest             boolean not null default true,

  native_project_name   text,
  native_customer       text,
  -- Preserved verbatim, always. MISO's status is three independent fields and flattening it to a
  -- single normalized stage would lose which of the three moved.
  native_status         jsonb not null
                          constraint interconnection_observations_native_status_object
                          check (jsonb_typeof(native_status) = 'object' and native_status <> '{}'::jsonb),
  native_status_display text,

  lifecycle_stage       text not null references reference.interconnection_lifecycle_stages (code) on delete restrict,
  request_class         text not null references reference.interconnection_request_classes (code) on delete restrict,

  -- Lifecycle dates, each from its own named source field, never inferred from one another.
  requested_on          date,
  proposed_in_service_on date,
  revised_in_service_on date,
  -- Only ever set from an explicit operational signal. A proposed date is not evidence.
  actual_in_service_on  date,
  agreement_executed_on date,
  withdrawn_on          date,

  native_state          text,
  native_county         text,
  native_zone           text,
  native_poi            text,
  native_substation     text,
  native_transmission_owner text,
  -- CAISO's sheet membership is itself lifecycle evidence and is kept rather than flattened away.
  source_partition      text,

  created_at            timestamptz not null default now(),

  unique (request_id, observation_ordinal),
  -- An operational observation must carry the evidence that made it operational.
  constraint interconnection_observations_operational_needs_evidence
    check (lifecycle_stage <> 'operational' or actual_in_service_on is not null
           or native_status_display is not null),
  -- A withdrawal date without a withdrawn stage is a contradiction; a withdrawn stage without a
  -- date is not, because ISO-NE and MISO both publish withdrawals whose date they never gave.
  constraint interconnection_observations_withdrawn_date_agrees
    check (withdrawn_on is null or lifecycle_stage = 'withdrawn')
);

comment on table pipeline.interconnection_request_observations is
  'What one publisher said about one request in one observed source state. Append-only and ordinal-ordered, so a request that oscillates between statuses keeps every step. Unchanged content advances last_snapshot_id instead of duplicating the row.';

create unique index interconnection_observations_latest_idx
  on pipeline.interconnection_request_observations (request_id)
  where is_latest;
create index interconnection_observations_stage_idx
  on pipeline.interconnection_request_observations (lifecycle_stage) where is_latest;
create index interconnection_observations_snapshot_idx
  on pipeline.interconnection_request_observations (first_snapshot_id);

-- Observations are evidence. The only permitted update is the bookkeeping that records this
-- state being seen again, or the latest flag moving to a newer state.
create or replace function pipeline.allow_only_interconnection_confirmation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'interconnection observations are append-only' using errcode = 'restrict_violation';
  end if;
  if new.request_id is distinct from old.request_id
     or new.observation_ordinal is distinct from old.observation_ordinal
     or new.observation_hash is distinct from old.observation_hash
     or new.first_snapshot_id is distinct from old.first_snapshot_id
     or new.first_raw_record_id is distinct from old.first_raw_record_id
     or new.lifecycle_stage is distinct from old.lifecycle_stage
     or new.native_status is distinct from old.native_status
     or new.requested_on is distinct from old.requested_on
     or new.actual_in_service_on is distinct from old.actual_in_service_on
     or new.withdrawn_on is distinct from old.withdrawn_on then
    raise exception 'an interconnection observation may not be edited; record a new observation'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger interconnection_observations_confirm_only
  before update or delete on pipeline.interconnection_request_observations
  for each row execute function pipeline.allow_only_interconnection_confirmation();

-- ---------------------------------------------------------------- quantities

create table pipeline.interconnection_request_quantities (
  id              uuid primary key default gen_random_uuid(),
  observation_id  uuid not null references pipeline.interconnection_request_observations (id) on delete restrict,
  -- The publisher's own field name, mandatory. A normalized kind groups; it never replaces.
  native_field    text not null
                    constraint interconnection_quantities_native_field_nonempty check (btrim(native_field) <> ''),
  quantity_kind   text not null references reference.interconnection_quantity_kinds (code) on delete restrict,
  value           numeric not null
                    constraint interconnection_quantities_finite check (value <> 'NaN'::numeric),
  -- Explicit, never assumed. A field whose unit the source did not state is deferred, not coerced.
  unit            text not null
                    constraint interconnection_quantities_unit_allowed check (unit in ('MW', 'MVA', 'MWh')),
  resource_ordinal integer
                    constraint interconnection_quantities_resource_ordinal_positive
                    check (resource_ordinal is null or resource_ordinal >= 1),
  direction       text
                    constraint interconnection_quantities_direction_allowed
                    check (direction is null or direction in ('injection', 'withdrawal', 'bidirectional')),
  locator         jsonb not null
                    constraint interconnection_quantities_locator_object check (jsonb_typeof(locator) = 'object'),
  created_at      timestamptz not null default now(),

  -- One value per named field per observation, per component where the field is componentised.
  -- NULLS NOT DISTINCT because a project-level quantity has no component, and without it two
  -- rows claiming the same field would both be accepted.
  unique nulls not distinct (observation_id, native_field, resource_ordinal),
  -- A project-level quantity belongs to no component, and a component quantity names one.
  constraint interconnection_quantities_component_kind_agrees
    check ((quantity_kind = 'component_mw') = (resource_ordinal is not null))
);

comment on table pipeline.interconnection_request_quantities is
  'Every materially distinct MW a publisher states about a request, each under its own native field name. There is deliberately no single capacity column: PJM publishes four of these per project and they aggregate to 1,628 GW and 638 GW respectively.';

create index interconnection_quantities_observation_idx
  on pipeline.interconnection_request_quantities (observation_id);
create index interconnection_quantities_kind_idx
  on pipeline.interconnection_request_quantities (quantity_kind);

create trigger interconnection_quantities_immutable
  before update or delete on pipeline.interconnection_request_quantities
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- resource components

create table pipeline.interconnection_request_resources (
  id                uuid primary key default gen_random_uuid(),
  observation_id    uuid not null references pipeline.interconnection_request_observations (id) on delete restrict,
  component_ordinal integer not null
                      constraint interconnection_resources_ordinal_positive check (component_ordinal >= 1),
  native_technology text,
  native_fuel       text,
  technology        text not null references reference.interconnection_technologies (code) on delete restrict,
  -- True only where the source encoded the component separately. CAISO does; PJM and MISO publish
  -- a compound label with no recoverable split, and a single component carries the whole label.
  is_source_separated boolean not null,
  locator           jsonb not null
                      constraint interconnection_resources_locator_object check (jsonb_typeof(locator) = 'object'),
  created_at        timestamptz not null default now(),

  unique (observation_id, component_ordinal),
  constraint interconnection_resources_names_something
    check (native_technology is not null or native_fuel is not null or technology = 'unknown')
);

comment on table pipeline.interconnection_request_resources is
  'The resources a request comprises, as the source published them. Component MW lives in the quantities table and is descriptive composition only: CAISO publishes Wind 38 and Battery 38 for a project whose net to grid is 38.';

create index interconnection_resources_observation_idx
  on pipeline.interconnection_request_resources (observation_id);

create trigger interconnection_resources_immutable
  before update or delete on pipeline.interconnection_request_resources
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- deferrals

create table pipeline.interconnection_queue_deferrals (
  id              uuid primary key default gen_random_uuid(),
  snapshot_id     uuid not null references pipeline.interconnection_queue_snapshots (id) on delete restrict,
  native_queue_id text,
  deferral_kind   text not null
                    constraint interconnection_deferrals_kind_allowed
                    check (deferral_kind in ('unmapped_status', 'unmapped_technology', 'unmapped_quantity',
                                             'unknown_unit', 'unparseable_value', 'unsupported_row')),
  native_value    text,
  detail          text not null
                    constraint interconnection_deferrals_detail_nonempty check (btrim(detail) <> ''),
  locator         jsonb not null
                    constraint interconnection_deferrals_locator_object check (jsonb_typeof(locator) = 'object'),
  created_at      timestamptz not null default now()
);

comment on table pipeline.interconnection_queue_deferrals is
  'Something the source published that this pipeline did not map, recorded rather than dropped. A deferral in the data is auditable; a value silently discarded is an absence someone later mistakes for an oversight.';

create index interconnection_deferrals_snapshot_idx
  on pipeline.interconnection_queue_deferrals (snapshot_id, deferral_kind);

-- A deferral is a fact about a snapshot, so re-observing the same snapshot must not restate it.
-- Without this a daily retrieval would accumulate a fresh copy of every unmapped label forever.
create unique index interconnection_deferrals_identity_idx
  on pipeline.interconnection_queue_deferrals
  (snapshot_id, deferral_kind, coalesce(native_queue_id, ''), coalesce(native_value, ''), md5(detail));

create trigger interconnection_queue_deferrals_immutable
  before update or delete on pipeline.interconnection_queue_deferrals
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- currentness monitoring

create table reference.interconnection_source_monitors (
  id                    uuid primary key default gen_random_uuid(),
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  -- Cadence is per source and deliberately not shared. CAISO regenerates daily; PJM and MISO
  -- refresh continuously and publish no release key; a single threshold across them would call
  -- one stale while it is fine and call another current while it is months old.
  expected_cadence      text not null
                          constraint interconnection_monitors_cadence_allowed
                          check (expected_cadence in ('continuous', 'daily', 'weekly', 'monthly', 'irregular')),
  stale_after_hours     integer not null
                          constraint interconnection_monitors_stale_positive check (stale_after_hours > 0),
  rationale             text not null
                          constraint interconnection_monitors_rationale_nonempty check (btrim(rationale) <> ''),
  created_at            timestamptz not null default now(),
  unique (source_interface_id)
);

create table pipeline.interconnection_source_checks (
  id                    uuid primary key default gen_random_uuid(),
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  checked_at            timestamptz not null,
  reachable             boolean not null,
  http_status           integer,
  artifact_sha256       text
                          constraint interconnection_checks_sha256_format
                          check (artifact_sha256 is null or artifact_sha256 ~ '^[0-9a-f]{64}$'),
  source_published_at   timestamptz,
  snapshot_id           uuid references pipeline.interconnection_queue_snapshots (id) on delete restrict,
  currentness_status    text not null
                          constraint interconnection_checks_currentness_allowed
                          check (currentness_status in ('current', 'stale', 'unavailable')),
  detail                text,
  created_at            timestamptz not null default now()
);

create index interconnection_checks_source_idx
  on pipeline.interconnection_source_checks (source_interface_id, checked_at desc);

create trigger interconnection_source_checks_immutable
  before update or delete on pipeline.interconnection_source_checks
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- the domain wall

-- Queue data may not reach the capacity domain. This is enforced structurally rather than by
-- convention: the function below is called by a test and by nothing else, and it fails if any
-- foreign key ever connects the queue tables to the Power Delivery capacity chain or to the GPU
-- compute capacity tables. A schema change that wires them together cannot pass review silently.
create or replace function pipeline.interconnection_domain_violations()
returns table (constraint_name text, from_table text, to_table text)
language sql stable as $$
  with queue_tables (name) as (values
    ('interconnection_queue_snapshots'), ('raw_interconnection_queue_records'),
    ('interconnection_requests'), ('interconnection_request_observations'),
    ('interconnection_request_quantities'), ('interconnection_request_resources'),
    ('interconnection_queue_deferrals'), ('interconnection_source_checks')),
  capacity_tables (name) as (values
    ('grid_capacity_components'), ('grid_capacity_vintages'), ('grid_capacity_scenarios'),
    ('grid_constraint_values'), ('raw_grid_capacity_records'),
    ('deliverable_capacity_results'), ('deliverable_capacity_result_inputs'),
    ('delivery_gap_results'), ('delivery_gap_result_inputs'),
    ('capacity_observations'), ('capacity_source_observations'), ('capacity_source_members'))
  select c.conname::text,
         src.relname::text,
         tgt.relname::text
    from pg_constraint c
    join pg_class src on src.oid = c.conrelid
    join pg_class tgt on tgt.oid = c.confrelid
   where c.contype = 'f'
     and ((src.relname in (select name from queue_tables) and tgt.relname in (select name from capacity_tables))
       or (src.relname in (select name from capacity_tables) and tgt.relname in (select name from queue_tables)));
$$;

comment on function pipeline.interconnection_domain_violations is
  'Any foreign key joining the interconnection queue domain to the capacity domain. Must always return zero rows: queue MW is a request to connect, not supply available to serve load.';

-- ---------------------------------------------------------------- rights purposes

insert into reference.source_use_purposes (code, display_name, is_public, description) values
  ('interconnection_queue_retention', 'Interconnection queue retention', false,
   'Holding retrieved interconnection queue artifacts and the canonical records derived from them.'),
  ('interconnection_queue_calculation', 'Interconnection queue calculation', false,
   'Using retained queue records in internal calculations, including future cohort and stock analytics.'),
  ('public_interconnection_queue_display', 'Public interconnection queue display', true,
   'Displaying a value taken directly from a publisher''s queue, such as a project count or a named MW field.'),
  ('public_interconnection_queue_derived_metric_display', 'Public interconnection queue derived metric display', true,
   'Displaying a metric Urdais derived from queue records, such as median queue age or a cohort completion rate.')
on conflict (code) do nothing;

-- ---------------------------------------------------------------- the three IQ-2 sources

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('99000000-0000-4000-8000-000000000002', 'miso', 'Midcontinent Independent System Operator, Inc.', 'grid_operator', 'https://www.misoenergy.org/')
on conflict (slug) do nothing;

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, terms_evidence, notes)
select v.id, p.id, v.slug, v.name, 'interconnection_queue', v.canonical_url, true,
       'public_unauthenticated', 'research_usable', 'under_review', 'under_review', false,
       jsonb_build_object('reviewed_on', '2026-09-21',
         'research', 'IQ-1 interconnection queue source reconnaissance',
         'documents', jsonb_build_array(jsonb_build_object('title', v.terms_title, 'url', v.terms_url, 'note', v.terms_note))),
       v.notes
from (values
  ('99000000-0000-4000-8300-000000000001'::uuid, 'pjm-interconnection', 'pjm-planning-queues',
   'PJM Planning Queues',
   'https://www.pjm.com/pub/planning/downloads/xml/PlanningQueues.xml',
   'PJM Terms of Use', 'https://www.pjm.com/about-pjm/terms-of-use',
   'Site terms assert PJM ownership of site content and do not grant redistribution of data values.',
   'The complete serial planning queue as XML: every request from A01 onward with its status, four distinct MW fields, submission and withdrawal dates, actual in-service date where reached, and withdrawal remarks. Withdrawn and in-service projects are retained in the feed, so lifecycle history is native to the source rather than accumulated by Urdais.'),
  ('99000000-0000-4000-8300-000000000002'::uuid, 'miso', 'miso-generator-interconnection-queue',
   'MISO Generator Interconnection Queue',
   'https://www.misoenergy.org/api/giqueue/getprojects',
   'MISO Terms of Use', 'https://www.misoenergy.org/terms-of-use/',
   'No affirmative reuse grant was found for the queue endpoint.',
   'A JSON endpoint returning the whole queue including withdrawn and completed requests. Status is three independent fields (application status, study phase, post-GIA status) and six MW fields split across ERIS and NRIS service in two definitive planning phases.'),
  ('99000000-0000-4000-8300-000000000003'::uuid, 'caiso', 'caiso-public-queue-report',
   'CAISO Public Queue Report',
   'https://www.caiso.com/documents/publicqueuereport.xlsx',
   'CAISO Privacy and Terms of Use', 'https://www.caiso.com/privacy-terms-of-use',
   'Website terms assert intellectual property in site content; no affirmative commercial reuse grant was found.',
   'A daily workbook in three lifecycle sheets: active, completed and withdrawn. Sheet membership is itself lifecycle evidence. Alone among the three it publishes component Type/Fuel/MW triplets, which are descriptive composition and are not additive into the project net MW.')
) as v(id, provider_slug, slug, name, canonical_url, terms_title, terms_url, terms_note, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- All three are ambiguous. Under the Urdais policy that permits publication under founder-accepted
-- risk while the question is open, retention and calculation are permitted and public display is
-- permitted with the classification and the unresolved issue left visible. None is relabelled.
with policy (interface_slug, attribution_text, unresolved_issue, terms_url, note) as (values
  ('pjm-planning-queues',
   'Source: PJM Interconnection, L.L.C., Planning Queues.',
   'PJM site terms assert ownership of site content and grant no redistribution of data values. Counsel to determine whether that reaches individual queue records republished in a commercial product.',
   'https://www.pjm.com/about-pjm/terms-of-use',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),
  ('miso-generator-interconnection-queue',
   'Source: Midcontinent Independent System Operator, Inc., Generator Interconnection Queue.',
   'No affirmative reuse grant was found for the MISO queue endpoint. Counsel to determine whether the site terms reach records served from the public API.',
   'https://www.misoenergy.org/terms-of-use/',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),
  ('caiso-public-queue-report',
   'Source: California Independent System Operator Corporation, Public Queue Report.',
   'The CAISO terms of use assert intellectual property in site content and are silent on republication of records from the public queue report.',
   'https://www.caiso.com/privacy-terms-of-use',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.')
)
insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, u.code, 'ambiguous_requires_legal_review', 'permitted',
       u.is_public, case when u.is_public then policy.attribution_text end,
       case when u.is_public then 'Attribute the operator wherever a queue value is displayed, and never present a queue MW as available capacity.' end,
       policy.unresolved_issue, policy.terms_url,
       'Urdais research', date '2026-09-21', timestamptz '2026-09-21T00:00:00Z', policy.note
from policy
join reference.source_interfaces s on s.slug = policy.interface_slug
cross join reference.source_use_purposes u
where u.code in ('internal_retention', 'interconnection_queue_retention',
                 'interconnection_queue_calculation',
                 'public_interconnection_queue_display',
                 'public_interconnection_queue_derived_metric_display');

-- A production retrieval must cite a permission basis. None of the three rests on a grant, and
-- each says so rather than claiming one.
insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
   covers_internal_use, covers_storage, covers_historical_retention, covers_historical_reconstruction,
   rights_layer, attribution_required, attribution_text, effective_from, evidence, reviewed_by, reviewed_on)
select v.id, s.id, 'provider_terms', v.reference, true, false, true, true, true, true,
       'publisher', true, sup.attribution_text, timestamptz '2026-09-21T00:00:00Z',
       v.evidence, 'Urdais research', date '2026-09-21'
from (values
  ('99000000-0000-4000-8400-000000000001'::uuid, 'pjm-planning-queues',
   'PJM Terms of Use, reviewed 2026-09-21; no reuse grant established.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.'),
  ('99000000-0000-4000-8400-000000000002'::uuid, 'miso-generator-interconnection-queue',
   'MISO Terms of Use, reviewed 2026-09-21; no reuse grant established.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.'),
  ('99000000-0000-4000-8400-000000000003'::uuid, 'caiso-public-queue-report',
   'CAISO terms of use, reviewed 2026-09-21; no reuse grant established.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.')
) as v(id, slug, reference, evidence)
join reference.source_interfaces s on s.slug = v.slug
join lateral (select attribution_text from reference.source_use_permissions
               where source_interface_id = s.id and purpose_code = 'public_interconnection_queue_display' limit 1) sup on true
on conflict (id) do nothing;

update reference.source_use_permissions sup
   set permission_grant_id = g.id
  from reference.permission_grants g
 where g.source_interface_id = sup.source_interface_id
   and sup.permission_grant_id is null
   and g.id in ('99000000-0000-4000-8400-000000000001',
                '99000000-0000-4000-8400-000000000002',
                '99000000-0000-4000-8400-000000000003');

-- Cadence per source, from what each publisher actually does.
insert into reference.interconnection_source_monitors
  (source_interface_id, expected_cadence, stale_after_hours, rationale)
select s.id, v.cadence, v.hours, v.rationale
from (values
  ('pjm-planning-queues', 'continuous', 168,
   'PJM refreshes the feed continuously and stamps each project with its own LastUpdated rather than releasing versions. A week without any observed content change is the point at which the feed itself is suspect.'),
  ('miso-generator-interconnection-queue', 'continuous', 168,
   'The MISO endpoint refreshes continuously and publishes no release key or payload timestamp, so only content change is observable.'),
  ('caiso-public-queue-report', 'daily', 72,
   'CAISO stamps the workbook with a report run date and regenerates it daily. Three days allows for a weekend without raising.')
) as v(slug, cadence, hours, rationale)
join reference.source_interfaces s on s.slug = v.slug
on conflict (source_interface_id) do nothing;

-- ---------------------------------------------------------------- assertions

do $$
declare n integer;
begin
  select count(*) into n from pipeline.interconnection_domain_violations();
  if n <> 0 then
    raise exception 'the interconnection queue domain is wired to the capacity domain in % place(s)', n;
  end if;

  select count(*) into n from reference.source_interfaces
   where slug in ('pjm-planning-queues', 'miso-generator-interconnection-queue', 'caiso-public-queue-report')
     and source_class = 'interconnection_queue';
  if n <> 3 then raise exception 'expected three interconnection queue interfaces, found %', n; end if;

  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'interconnection_queue'
     and sup.rights_classification <> 'ambiguous_requires_legal_review';
  if n <> 0 then raise exception 'a queue source was recorded as something other than ambiguous'; end if;

  select count(*) into n from reference.interconnection_lifecycle_stages where is_terminal;
  if n <> 2 then raise exception 'expected exactly two terminal lifecycle stages, found %', n; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline' and table_name like 'interconnection%' and column_name = 'capacity_mw';
  if n <> 0 then raise exception 'a capacity_mw column exists in the interconnection queue domain'; end if;
end $$;

alter table reference.interconnection_lifecycle_stages enable row level security;
alter table reference.interconnection_request_classes enable row level security;
alter table reference.interconnection_quantity_kinds enable row level security;
alter table reference.interconnection_technologies enable row level security;
alter table reference.interconnection_source_monitors enable row level security;
alter table pipeline.interconnection_queue_snapshots enable row level security;
alter table pipeline.raw_interconnection_queue_records enable row level security;
alter table pipeline.interconnection_requests enable row level security;
alter table pipeline.interconnection_request_observations enable row level security;
alter table pipeline.interconnection_request_quantities enable row level security;
alter table pipeline.interconnection_request_resources enable row level security;
alter table pipeline.interconnection_queue_deferrals enable row level security;
alter table pipeline.interconnection_source_checks enable row level security;
