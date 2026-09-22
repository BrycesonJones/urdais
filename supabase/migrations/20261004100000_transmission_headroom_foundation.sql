-- Transmission Headroom TH-2: canonical foundation and the NYISO/ERCOT evidence model.
--
-- TH-1 established that "headroom" is a different object in each market, and TH-1A closed the two
-- source contracts. This migration builds the evidence model those contracts imply, and it is
-- deliberately not one generalized table.
--
-- Four decisions are structural rather than conventional, because each has a plausible-looking
-- wrong answer:
--
--   1. Interfaces and elements stay separate. NYISO publishes named transfer interfaces with a
--      stable numeric Point ID and a directional limit pair. ERCOT publishes monitored constraints
--      identified by (name, contingency) with a single oriented limit. Collapsing them would force
--      a lowest-common-denominator row that loses direction on one side and contingency on the
--      other.
--
--   2. A margin cannot be assembled from mismatched parts. The foreign keys are composite over
--      (observation, entity, instant, source interface, contingency kind), so a margin that
--      referenced another market, another entity, another instant or another contingency is not a
--      bug to be caught in review -- it fails to insert.
--
--   3. An absent limit is never a number. NYISO's +/-9999 is a sentinel meaning the direction is
--      not monitored, and the largest genuine limit observed anywhere in the archive is 9899, a
--      hundred megawatts below it. The rule is exact equality and the check constraint says so.
--
--   4. Raw evidence is immutable and normalization never overwrites it. Every canonical observation
--      carries the artifact, the row ordinal and the publisher's own text.
--
-- No public surface reads any of this. TH-2 is ingestion only.

-- ---------------------------------------------------------------- vocabularies

create table reference.transmission_entity_kinds (
  code        text primary key,
  label       text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table reference.transmission_entity_kinds is
  'The kinds of thing a transmission source publishes. Kept as a vocabulary because a future market may publish a flowgate, which is neither an interface nor a single element.';

insert into reference.transmission_entity_kinds (code, label, notes) values
  ('interface', 'Transfer interface',
   'A named transfer path the operator monitors and publishes a limit for. NYISO Point IDs.'),
  ('element', 'Monitored element',
   'A monitored physical element or constraint, limited against a specific contingency. ERCOT SCED constraints.');

create table reference.transmission_contingency_kinds (
  code        text primary key,
  label       text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

insert into reference.transmission_contingency_kinds (code, label, notes) values
  ('base_case', 'Base case',
   'The margin with the system intact. ERCOT ContingencyName = BASE CASE.'),
  ('post_contingency', 'Post-contingency',
   'The margin under one named outage. ERCOT names the contingency; the name is half the constraint identity.'),
  ('not_applicable', 'Not applicable',
   'The source publishes an all-in operating limit that already embeds contingency analysis and cannot be decomposed. NYISO interface limits.');

create table reference.transmission_limit_states (
  code        text primary key,
  label       text not null,
  eligible    boolean not null,
  notes       text,
  created_at  timestamptz not null default now()
);

comment on column reference.transmission_limit_states.eligible is
  'Whether a limit in this state may produce a margin. Only a real limit may.';

insert into reference.transmission_limit_states (code, label, eligible, notes) values
  ('real', 'Real limit', true, 'An enforced limit published as a number.'),
  ('zero', 'Zero limit', true,
   'A real limit of zero: no flow permitted that way. NYISO SCH - HQ_CEDARS publishes a negative limit of 0. Distinct from absent.'),
  ('sentinel', 'Sentinel', false,
   'The publisher''s code for "not monitored in this direction". NYISO uses exactly +/-9999. Never a quantity.'),
  ('implausible', 'Implausible', false,
   'A published number too large to be a thermal limit, left monitored with its limit effectively disabled. ERCOT EASTEX at 85999.1. Retained as evidence, never used.');

create table reference.transmission_margin_states (
  code        text primary key,
  label       text not null,
  has_value   boolean not null,
  notes       text,
  created_at  timestamptz not null default now()
);

comment on column reference.transmission_margin_states.has_value is
  'Whether this state carries a number. Exactly one state does, which is how an absence is prevented from rendering as a zero.';

insert into reference.transmission_margin_states (code, label, has_value, notes) values
  ('ok', 'Computed', true,
   'A real limit and a flow in the same direction, instant and contingency. The only state carrying a value.'),
  ('unmonitored_direction', 'Direction not monitored', false,
   'Flow ran in a direction whose limit is a sentinel. There is no margin, and there is not a zero either.'),
  ('zero_flow_direction_undetermined', 'Zero flow', false,
   'Flow is exactly zero, so no direction applies and neither limit may be chosen. Choosing one would invent a direction.'),
  ('implausible_limit', 'Limit implausible', false,
   'The applicable limit failed the plausibility bound. ERCOT EASTEX would otherwise report 83449 MW of margin.');

create table reference.transmission_deferral_reasons (
  code        text primary key,
  label       text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

insert into reference.transmission_deferral_reasons (code, label, notes) values
  ('sentinel_limit', 'Sentinel limit', 'NYISO published +/-9999 for the direction in question.'),
  ('zero_flow_direction_undetermined', 'Zero flow', 'Flow was exactly zero and no direction could be established.'),
  ('unmonitored_direction', 'Unmonitored direction', 'The direction the flow ran in carries no published limit.'),
  ('implausible_limit', 'Implausible limit', 'The published limit exceeded the plausibility bound for the market.'),
  ('malformed_numeric', 'Malformed numeric', 'A required numeric field could not be parsed.'),
  ('missing_required_field', 'Missing required field', 'A required column was absent or blank.'),
  ('identity_collision', 'Identity collision', 'Two rows in one artifact claimed the same canonical identity.');

-- ---------------------------------------------------------------- calculation version
--
-- Internal only. The public Transmission Headroom methodology belongs to TH-3; this exists so a
-- derived margin records which deterministic rule produced it, and so a rule change is visible.

create table reference.transmission_calculation_versions (
  id            uuid primary key default gen_random_uuid(),
  version       text not null unique
                  constraint transmission_calc_version_format check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  is_internal   boolean not null default true,
  description   text not null,
  effective_from timestamptz not null,
  created_at    timestamptz not null default now()
);

comment on table reference.transmission_calculation_versions is
  'Internal derivation rules for margins. Not a methodology and never published: TH-2 canonicalises evidence, TH-3 approves a methodology.';

insert into reference.transmission_calculation_versions (version, is_internal, description, effective_from) values
  ('0.1.0', true,
   'TH-2 internal derivation. NYISO: select the limit by flow sign before any absolute value, sentinel is exact +/-9999, zero flow yields no direction. ERCOT: margin = Limit - Value with no direction selection, limits beyond the plausibility bound are ineligible. No cross-market quantity exists.',
   timestamptz '2026-09-21T00:00:00Z');

-- ---------------------------------------------------------------- source monitors

create table reference.transmission_source_monitors (
  source_interface_id uuid primary key references reference.source_interfaces (id) on delete restrict,
  expected_cadence    text not null
                        constraint transmission_monitor_cadence_allowed
                        check (expected_cadence in ('continuous', 'five_minute', 'hourly', 'daily', 'weekly', 'monthly')),
  stale_after_hours   integer not null
                        constraint transmission_monitor_stale_positive check (stale_after_hours > 0),
  -- The window after which unretrieved history is gone for good, where the publisher has one.
  retention_hours     integer
                        constraint transmission_monitor_retention_positive check (retention_hours is null or retention_hours > 0),
  notes               text,
  created_at          timestamptz not null default now()
);

comment on column reference.transmission_source_monitors.retention_hours is
  'How long the publisher keeps an artifact retrievable. ERCOT displays seven days and offers no archive, so a missed sweep is permanently lost and staleness must fire well inside that window.';

-- ---------------------------------------------------------------- snapshots

create table pipeline.transmission_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  grid_area_id          uuid not null references reference.grid_areas (id) on delete restrict,
  retrieval_id          uuid not null references pipeline.source_retrievals (id) on delete restrict,

  -- NYISO has a natural key (the calendar day of the file); ERCOT has the artifact timestamp in
  -- its filename. Both are paired with the content hash so a byte-identical re-fetch is a no-op.
  native_snapshot_key   text not null
                          constraint transmission_snapshots_key_nonempty check (btrim(native_snapshot_key) <> ''),
  artifact_sha256       text not null
                          constraint transmission_snapshots_sha256_format check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  -- For NYISO this is the calendar day covered; for ERCOT the artifact's publication instant.
  coverage_start        timestamptz,
  coverage_end          timestamptz,
  source_published_at   timestamptz,
  observed_at           timestamptz not null,

  currentness_status    text not null
                          constraint transmission_snapshots_currentness_allowed
                          check (currentness_status in ('current', 'stale', 'unavailable')),
  record_count          integer not null
                          constraint transmission_snapshots_record_count_nonneg check (record_count >= 0),
  notes                 text,
  created_at            timestamptz not null default now(),

  unique (source_interface_id, artifact_sha256, native_snapshot_key)
);

comment on table pipeline.transmission_snapshots is
  'One retrieved artifact. NYISO publishes a file per day and a zip per month; ERCOT publishes an hourly artifact behind an opaque doclookupId. Identity is the source interface, the content hash and the publisher''s own key, so re-fetching identical bytes resolves to the snapshot already held.';

create index transmission_snapshots_observed_idx
  on pipeline.transmission_snapshots (source_interface_id, observed_at desc);
create index transmission_snapshots_coverage_idx
  on pipeline.transmission_snapshots (source_interface_id, coverage_start);

create trigger transmission_snapshots_append_only
  before delete on pipeline.transmission_snapshots
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- raw evidence

create table pipeline.raw_transmission_records (
  id                  uuid primary key default gen_random_uuid(),
  snapshot_id         uuid not null references pipeline.transmission_snapshots (id) on delete restrict,
  retrieval_id        uuid not null references pipeline.source_retrievals (id) on delete restrict,
  artifact_sha256     text not null
                        constraint raw_transmission_sha256_format check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  record_hash         text not null
                        constraint raw_transmission_record_hash_format check (record_hash ~ '^[0-9a-f]{64}$'),
  -- The publisher's own identifier for the thing this row describes, before any normalization.
  native_entity_key   text not null
                        constraint raw_transmission_entity_key_nonempty check (btrim(native_entity_key) <> ''),
  -- The publisher's timestamp exactly as printed. Parsing happens downstream and may be ambiguous.
  native_timestamp    text not null
                        constraint raw_transmission_native_ts_nonempty check (btrim(native_timestamp) <> ''),
  row_ordinal         integer not null
                        constraint raw_transmission_ordinal_positive check (row_ordinal >= 1),
  locator             jsonb not null
                        constraint raw_transmission_locator_object check (jsonb_typeof(locator) = 'object'),
  payload             jsonb not null
                        constraint raw_transmission_payload_object check (jsonb_typeof(payload) = 'object'),
  extraction_version  text not null
                        constraint raw_transmission_extraction_nonempty check (btrim(extraction_version) <> ''),
  created_at          timestamptz not null default now(),

  unique (snapshot_id, record_hash)
);

comment on table pipeline.raw_transmission_records is
  'The publisher''s row verbatim, with the ordinal that finds it again in the artifact. No canonical observation exists without one of these behind it, and normalization never writes back into it.';

create index raw_transmission_snapshot_idx on pipeline.raw_transmission_records (snapshot_id);
create index raw_transmission_entity_idx on pipeline.raw_transmission_records (native_entity_key);

create trigger raw_transmission_records_immutable
  before update or delete on pipeline.raw_transmission_records
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- canonical entities
--
-- Two tables, not one. See the header.

create table pipeline.transmission_interfaces (
  id                  uuid primary key default gen_random_uuid(),
  source_interface_id uuid not null references reference.source_interfaces (id) on delete restrict,
  grid_area_id        uuid not null references reference.grid_areas (id) on delete restrict,
  entity_kind         text not null default 'interface'
                        references reference.transmission_entity_kinds (code) on delete restrict
                        constraint transmission_interfaces_kind_fixed check (entity_kind = 'interface'),
  -- NYISO Point ID. Stable across renames, which is the whole reason it is the identity: eight of
  -- twenty-five Point IDs were renamed over the archive, some twice, and CENTRAL-EAST (23313) was
  -- replaced by a DIFFERENT id (23330) that a name matcher would have merged.
  native_id           text not null
                        constraint transmission_interfaces_native_id_nonempty check (btrim(native_id) <> ''),
  -- Display only. Never participates in matching.
  native_name         text not null
                        constraint transmission_interfaces_native_name_nonempty check (btrim(native_name) <> ''),
  -- Deliberately null. TH-1A found no structured discriminator between internal transfer
  -- interfaces and external scheduled ties, and the "SCH - " prefix is a name heuristic over names
  -- that demonstrably change. Left unresolved rather than guessed.
  subtype             text
                        constraint transmission_interfaces_subtype_unset check (subtype is null),
  first_seen_at       timestamptz not null,
  last_seen_at        timestamptz not null,
  created_at          timestamptz not null default now(),

  unique (source_interface_id, native_id),
  constraint transmission_interfaces_seen_ordered check (last_seen_at >= first_seen_at)
);

comment on column pipeline.transmission_interfaces.subtype is
  'Always null in TH-2. The source publishes no structured subtype and the name prefix is not a reliable discriminator; the check constraint keeps a later guess from slipping in without a methodology decision.';

create table pipeline.transmission_elements (
  id                      uuid primary key default gen_random_uuid(),
  source_interface_id     uuid not null references reference.source_interfaces (id) on delete restrict,
  grid_area_id            uuid not null references reference.grid_areas (id) on delete restrict,
  entity_kind             text not null default 'element'
                            references reference.transmission_entity_kinds (code) on delete restrict
                            constraint transmission_elements_kind_fixed check (entity_kind = 'element'),
  -- ERCOT identity is the pair. ConstraintID is NOT an identifier: across nine artifacts, 28 ids
  -- mapped to several names and 71 names mapped to several ids. The same element under a different
  -- contingency is a different constraint with a different limit, so the contingency is half the key.
  native_constraint_name  text not null
                            constraint transmission_elements_name_nonempty check (btrim(native_constraint_name) <> ''),
  native_contingency_name text not null
                            constraint transmission_elements_cont_nonempty check (btrim(native_contingency_name) <> ''),
  contingency_kind        text not null
                            references reference.transmission_contingency_kinds (code) on delete restrict,
  from_station            text,
  to_station              text,
  from_station_kv         numeric(10, 2)
                            constraint transmission_elements_from_kv_nonneg check (from_station_kv is null or from_station_kv >= 0),
  to_station_kv           numeric(10, 2)
                            constraint transmission_elements_to_kv_nonneg check (to_station_kv is null or to_station_kv >= 0),
  first_seen_at           timestamptz not null,
  last_seen_at            timestamptz not null,
  created_at              timestamptz not null default now(),

  unique (source_interface_id, native_constraint_name, native_contingency_name),
  constraint transmission_elements_seen_ordered check (last_seen_at >= first_seen_at)
);

comment on table pipeline.transmission_elements is
  'One ERCOT monitored constraint, identified by (constraint name, contingency name). ConstraintID is per-run metadata on the observation, never identity.';

create index transmission_elements_name_idx
  on pipeline.transmission_elements (source_interface_id, native_constraint_name);

-- ---------------------------------------------------------------- observations
--
-- Flow and limit are separate rows because they are separate published facts, and because NYISO
-- publishes two limits (one per direction) against a single flow.

create table pipeline.transmission_flow_observations (
  id                    uuid primary key default gen_random_uuid(),
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  snapshot_id           uuid not null references pipeline.transmission_snapshots (id) on delete restrict,
  raw_record_id         uuid not null references pipeline.raw_transmission_records (id) on delete restrict,
  entity_kind           text not null references reference.transmission_entity_kinds (code) on delete restrict,
  -- Exactly one of these is set, matching entity_kind.
  interface_id          uuid references pipeline.transmission_interfaces (id) on delete restrict,
  element_id            uuid references pipeline.transmission_elements (id) on delete restrict,
  -- The single entity key the composite foreign keys travel on.
  entity_id             uuid not null,
  contingency_kind      text not null references reference.transmission_contingency_kinds (code) on delete restrict,
  observed_at           timestamptz not null,
  -- The publisher's string, kept because the parse may be ambiguous and the string never is.
  native_timestamp      text not null,
  timestamp_zone_status text not null
                          constraint transmission_flow_zone_status_allowed
                          check (timestamp_zone_status in ('source_stated', 'assumed_market_local', 'ambiguous')),
  -- Signed, exactly as published. Never absolute-valued in storage.
  flow_mw               numeric(14, 4) not null,
  flow_direction        text not null
                          constraint transmission_flow_direction_allowed
                          check (flow_direction in ('positive', 'negative', 'zero', 'unspecified')),
  native_field          text not null
                          constraint transmission_flow_native_field_nonempty check (btrim(native_field) <> ''),
  unit_as_published     text not null
                          constraint transmission_flow_unit_nonempty check (btrim(unit_as_published) <> ''),
  row_ordinal           integer not null
                          constraint transmission_flow_ordinal_positive check (row_ordinal >= 1),
  created_at            timestamptz not null default now(),

  constraint transmission_flow_entity_matches_kind check (
    (entity_kind = 'interface' and interface_id is not null and element_id is null and entity_id = interface_id)
    or (entity_kind = 'element' and element_id is not null and interface_id is null and entity_id = element_id)),
  -- Sign and label must agree, so a downstream reader may trust either one.
  constraint transmission_flow_direction_matches_sign check (
    (flow_direction = 'positive' and flow_mw > 0)
    or (flow_direction = 'negative' and flow_mw < 0)
    or (flow_direction = 'zero' and flow_mw = 0)
    or flow_direction = 'unspecified'),
  -- One flow per entity, instant and contingency grain.
  unique (source_interface_id, entity_id, observed_at, contingency_kind),
  -- The target of the margin table's composite foreign key. Its whole purpose is to make a
  -- cross-entity, cross-instant or cross-market margin impossible to insert.
  unique (id, entity_id, observed_at, source_interface_id, contingency_kind)
);

create index transmission_flow_entity_idx
  on pipeline.transmission_flow_observations (entity_id, observed_at desc);
create index transmission_flow_snapshot_idx
  on pipeline.transmission_flow_observations (snapshot_id);

create trigger transmission_flow_observations_immutable
  before update or delete on pipeline.transmission_flow_observations
  for each row execute function pipeline.forbid_mutation();

create table pipeline.transmission_limit_observations (
  id                    uuid primary key default gen_random_uuid(),
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,
  snapshot_id           uuid not null references pipeline.transmission_snapshots (id) on delete restrict,
  raw_record_id         uuid not null references pipeline.raw_transmission_records (id) on delete restrict,
  entity_kind           text not null references reference.transmission_entity_kinds (code) on delete restrict,
  interface_id          uuid references pipeline.transmission_interfaces (id) on delete restrict,
  element_id            uuid references pipeline.transmission_elements (id) on delete restrict,
  entity_id             uuid not null,
  contingency_kind      text not null references reference.transmission_contingency_kinds (code) on delete restrict,
  observed_at           timestamptz not null,
  native_timestamp      text not null,
  -- Which published column this came from. NYISO publishes two per row; ERCOT one. Recorded
  -- because a margin must always be able to say which limit it measured against.
  native_field          text not null
                          constraint transmission_limit_native_field_nonempty check (btrim(native_field) <> ''),
  -- The direction this limit governs. NYISO's pair is directional; ERCOT's single limit is not.
  direction             text not null
                          constraint transmission_limit_direction_allowed
                          check (direction in ('positive', 'negative', 'undirected')),
  -- Signed, exactly as published, including the sentinel.
  limit_mw              numeric(14, 4) not null,
  limit_state           text not null references reference.transmission_limit_states (code) on delete restrict,
  unit_as_published     text not null
                          constraint transmission_limit_unit_nonempty check (btrim(unit_as_published) <> ''),
  row_ordinal           integer not null
                          constraint transmission_limit_ordinal_positive check (row_ordinal >= 1),
  created_at            timestamptz not null default now(),

  constraint transmission_limit_entity_matches_kind check (
    (entity_kind = 'interface' and interface_id is not null and element_id is null and entity_id = interface_id)
    or (entity_kind = 'element' and element_id is not null and interface_id is null and entity_id = element_id)),
  -- The sentinel rule, enforced rather than trusted to a parser. Exact magnitude only: the largest
  -- genuine limit in the NYISO archive is 9899, so a threshold rule would discard real data.
  constraint transmission_limit_sentinel_is_exact check (
    (limit_state = 'sentinel') = (abs(limit_mw) = 9999)),
  constraint transmission_limit_zero_state check (
    (limit_state = 'zero') = (limit_mw = 0)),
  unique (source_interface_id, entity_id, observed_at, contingency_kind, direction),
  unique (id, entity_id, observed_at, source_interface_id, contingency_kind)
);

comment on constraint transmission_limit_sentinel_is_exact on pipeline.transmission_limit_observations is
  'NYISO publishes +/-9999 to mean the direction is not monitored. The largest genuine limit observed across the archive is 9899 on SCH - HQ_IMPORT_EXPORT, 4074 times, so exact magnitude is the only safe test and a >= 9000 threshold would erase real observations.';

create index transmission_limit_entity_idx
  on pipeline.transmission_limit_observations (entity_id, observed_at desc);
create index transmission_limit_snapshot_idx
  on pipeline.transmission_limit_observations (snapshot_id);

create trigger transmission_limit_observations_immutable
  before update or delete on pipeline.transmission_limit_observations
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- derived margins

create table pipeline.transmission_margins (
  id                      uuid primary key default gen_random_uuid(),
  source_interface_id     uuid not null references reference.source_interfaces (id) on delete restrict,
  calculation_version_id  uuid not null references reference.transmission_calculation_versions (id) on delete restrict,
  entity_kind             text not null references reference.transmission_entity_kinds (code) on delete restrict,
  entity_id               uuid not null,
  contingency_kind        text not null references reference.transmission_contingency_kinds (code) on delete restrict,
  observed_at             timestamptz not null,

  flow_observation_id     uuid not null,
  -- Null exactly when no limit could be selected: zero flow chooses no direction.
  limit_observation_id    uuid,

  -- The direction the flow actually ran in, chosen before any absolute value was taken.
  selected_direction      text not null
                            constraint transmission_margin_direction_allowed
                            check (selected_direction in ('positive', 'negative', 'undirected', 'undetermined')),
  limit_field_used        text,
  state                   text not null references reference.transmission_margin_states (code) on delete restrict,
  -- Signed and unfloored. A flow over its limit is negative headroom and that is the point.
  headroom_mw             numeric(14, 4),
  utilization_pct         numeric(10, 6),
  created_at              timestamptz not null default now(),

  -- Composite foreign keys, not plain ones. These are what make an orphan calculation structurally
  -- impossible: a margin may only reference a flow and a limit that already agree with it about the
  -- entity, the instant, the source interface and the contingency grain.
  constraint transmission_margin_flow_fk foreign key
    (flow_observation_id, entity_id, observed_at, source_interface_id, contingency_kind)
    references pipeline.transmission_flow_observations
    (id, entity_id, observed_at, source_interface_id, contingency_kind) on delete restrict,
  constraint transmission_margin_limit_fk foreign key
    (limit_observation_id, entity_id, observed_at, source_interface_id, contingency_kind)
    references pipeline.transmission_limit_observations
    (id, entity_id, observed_at, source_interface_id, contingency_kind) on delete restrict,

  -- Exactly one state carries a number.
  constraint transmission_margin_value_matches_state check (
    (state = 'ok') = (headroom_mw is not null)),
  -- A value requires the limit it was measured against, named.
  constraint transmission_margin_ok_has_limit check (
    state <> 'ok' or (limit_observation_id is not null and limit_field_used is not null)),
  -- Zero flow determines no direction, so it may hold no limit at all.
  constraint transmission_margin_zero_flow_has_no_limit check (
    state <> 'zero_flow_direction_undetermined'
    or (limit_observation_id is null and selected_direction = 'undetermined')),
  constraint transmission_margin_utilization_range check (
    utilization_pct is null or utilization_pct >= 0),
  constraint transmission_margin_utilization_needs_value check (
    utilization_pct is null or headroom_mw is not null),

  unique (calculation_version_id, entity_id, observed_at, contingency_kind, selected_direction)
);

comment on table pipeline.transmission_margins is
  'A derived margin, and only where the source grain supports one. The composite foreign keys mean a margin cannot be assembled from another market, another entity, another instant or another contingency -- such a row fails to insert rather than failing review.';

comment on constraint transmission_margin_value_matches_state on pipeline.transmission_margins is
  'An absence is never a zero. Only the ok state carries a number; unmonitored_direction, zero_flow_direction_undetermined and implausible_limit carry null and say why.';

create index transmission_margin_entity_idx
  on pipeline.transmission_margins (entity_id, observed_at desc);
create index transmission_margin_state_idx
  on pipeline.transmission_margins (source_interface_id, state);

create trigger transmission_margins_immutable
  before update or delete on pipeline.transmission_margins
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- deferrals

create table pipeline.transmission_deferrals (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references pipeline.transmission_snapshots (id) on delete restrict,
  reason        text not null references reference.transmission_deferral_reasons (code) on delete restrict,
  native_entity_key text,
  native_value  text,
  detail        text not null
                  constraint transmission_deferrals_detail_nonempty check (btrim(detail) <> ''),
  row_ordinal   integer
                  constraint transmission_deferrals_ordinal_positive check (row_ordinal is null or row_ordinal >= 1),
  created_at    timestamptz not null default now()
);

comment on table pipeline.transmission_deferrals is
  'What the pipeline saw and did not canonicalise, with the publisher''s own value. A malformed row is recorded here rather than dropped.';

-- A rerun records no second copy of the same deferral. Nulls are distinct in a unique index, so
-- the coalesces are doing real work.
create unique index transmission_deferrals_unique_idx
  on pipeline.transmission_deferrals
  (snapshot_id, reason, coalesce(native_entity_key, ''), coalesce(native_value, ''),
   coalesce(row_ordinal, 0), md5(detail));

create index transmission_deferrals_snapshot_idx on pipeline.transmission_deferrals (snapshot_id);

create trigger transmission_deferrals_immutable
  before update or delete on pipeline.transmission_deferrals
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- domain invariants

create or replace function pipeline.transmission_domain_violations()
returns table (violation text, detail text, occurrences bigint)
language sql
stable
security invoker
set search_path = pg_catalog, pipeline, reference
as $$
  select 'margin_from_sentinel_limit',
         'a margin carries a value measured against a sentinel limit',
         count(*)
    from pipeline.transmission_margins m
    join pipeline.transmission_limit_observations l on l.id = m.limit_observation_id
   where m.state = 'ok' and l.limit_state <> 'real' and l.limit_state <> 'zero'
  having count(*) > 0
  union all
  select 'margin_value_without_ok_state',
         'a margin holds a number in a state that must not carry one',
         count(*)
    from pipeline.transmission_margins
   where (state = 'ok') <> (headroom_mw is not null)
  having count(*) > 0
  union all
  select 'flow_without_raw_record',
         'a flow observation has no raw evidence behind it',
         count(*)
    from pipeline.transmission_flow_observations f
    left join pipeline.raw_transmission_records r on r.id = f.raw_record_id
   where r.id is null
  having count(*) > 0
  union all
  select 'limit_without_raw_record',
         'a limit observation has no raw evidence behind it',
         count(*)
    from pipeline.transmission_limit_observations l
    left join pipeline.raw_transmission_records r on r.id = l.raw_record_id
   where r.id is null
  having count(*) > 0
  union all
  select 'raw_without_snapshot',
         'a raw record has no snapshot behind it',
         count(*)
    from pipeline.raw_transmission_records r
    left join pipeline.transmission_snapshots s on s.id = r.snapshot_id
   where s.id is null
  having count(*) > 0
  union all
  -- A margin whose selected direction disagrees with the limit it used would be a silently wrong
  -- number rather than a missing one, which is worse.
  select 'margin_direction_mismatch',
         'a margin selected a direction the limit it used does not govern',
         count(*)
    from pipeline.transmission_margins m
    join pipeline.transmission_limit_observations l on l.id = m.limit_observation_id
   where m.state = 'ok' and m.selected_direction <> l.direction
  having count(*) > 0;
$$;

comment on function pipeline.transmission_domain_violations() is
  'Invariants that no single constraint can express. Expected to return zero rows; anything it returns is a defect, not a data quality note.';

-- ---------------------------------------------------------------- security

alter table reference.transmission_entity_kinds enable row level security;
alter table reference.transmission_contingency_kinds enable row level security;
alter table reference.transmission_limit_states enable row level security;
alter table reference.transmission_margin_states enable row level security;
alter table reference.transmission_deferral_reasons enable row level security;
alter table reference.transmission_calculation_versions enable row level security;
alter table reference.transmission_source_monitors enable row level security;
alter table pipeline.transmission_snapshots enable row level security;
alter table pipeline.raw_transmission_records enable row level security;
alter table pipeline.transmission_interfaces enable row level security;
alter table pipeline.transmission_elements enable row level security;
alter table pipeline.transmission_flow_observations enable row level security;
alter table pipeline.transmission_limit_observations enable row level security;
alter table pipeline.transmission_margins enable row level security;
alter table pipeline.transmission_deferrals enable row level security;
