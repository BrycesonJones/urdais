-- Grid Buildout Velocity GBV-2: the canonical ingestion foundation.
--
-- GBV-1 settled the semantics this schema has to hold, and two of them shape it more than the
-- rest.
--
-- Lifecycle and date quality are separate axes. ERCOT partitions its tracker into Future, Planned,
-- Completed and Cancelled sheets, and that membership is the authority: the workbook's own
-- Transmission Status column disagrees with it on 44.7% of completed rows and is Optional in
-- ERCOT's field dictionary. Nine completed rows carry an actual in-service date of year 9999, which
-- means ERCOT asserts the project is complete and has not said when. Those rows are in_service with
-- an unknown date, never lifecycle-unknown, so this schema records the state and the date quality
-- independently and constrains them against each other rather than folding one into the other.
--
-- Blank is not zero. Both ERCOT mileage columns are Optional, and 169 of 262 completed rows report
-- no mileage at all. A quantity therefore carries whether the publisher reported anything, so GBV-3
-- can separate "zero miles" from "said nothing" instead of inferring substation work from silence.
--
-- Everything here is evidence. The tables are append-only through pipeline.forbid_mutation(), and a
-- canonical row without a raw row behind it is a domain violation, not a shortcut.

-- ---------------------------------------------------------------- vocabulary

create table reference.buildout_lifecycle_states (
  code          text primary key
                  constraint buildout_lifecycle_states_code_format check (code ~ '^[a-z][a-z_]*$'),
  display_name  text not null,
  is_terminal   boolean not null default false,
  description   text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.buildout_lifecycle_states is
  'Canonical lifecycle classes. Publisher-native text is stored beside the class on every observation and is never replaced by it.';

insert into reference.buildout_lifecycle_states (code, display_name, is_terminal, description) values
  ('proposed', 'Proposed', false, 'Identified or conceptual; the publisher has not committed to it.'),
  ('planned', 'Planned', false, 'Committed in the publisher''s plan but not yet under construction.'),
  ('approved', 'Approved', false, 'An approval body has authorised the project. Not available in every market.'),
  ('in_development', 'In development', false, 'Permitting, engineering or design, where a publisher names that stage.'),
  ('under_construction', 'Under construction', false, 'Physical construction reported as under way.'),
  ('in_service', 'In service', true, 'Energised. For ERCOT this is Completed-sheet membership, independent of whether a date was supplied.'),
  ('cancelled', 'Cancelled', true, 'Withdrawn by the publisher.'),
  ('suspended', 'Suspended', false, 'On hold; not cancelled.'),
  ('unknown', 'Unknown', false, 'No defensible mapping. The native text is retained and a deferral is recorded.');

create table reference.buildout_lifecycle_bases (
  code          text primary key
                  constraint buildout_lifecycle_bases_code_format check (code ~ '^[a-z][a-z_]*$'),
  display_name  text not null,
  is_authoritative boolean not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.buildout_lifecycle_bases is
  'How a lifecycle class was derived. Sheet membership outranks a status string, and the row records which was used.';

insert into reference.buildout_lifecycle_bases (code, display_name, is_authoritative, description) values
  ('source_list_membership', 'Source list membership', true,
   'The publisher placed the row in a named list whose meaning is the state, e.g. an ERCOT Completed or Cancelled sheet.'),
  ('native_status_text', 'Native status text', false,
   'Derived from an optional status field. Lower confidence; ERCOT''s contradicts list membership on 44.7% of completed rows.'),
  ('unmapped', 'Unmapped', false,
   'No defensible basis. The class is unknown and the native value is retained.');

create table reference.buildout_milestone_kinds (
  code          text primary key
                  constraint buildout_milestone_kinds_code_format check (code ~ '^[a-z][a-z_]*$'),
  display_name  text not null,
  is_actual     boolean not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.buildout_milestone_kinds is
  'Typed dates. An expected date and an actual date are different kinds and are never compared as if they were the same measurement.';

insert into reference.buildout_milestone_kinds (code, display_name, is_actual, description) values
  ('approved', 'Approved', true,
   'The date an approval body acted. ERCOT: RPG or BOD review completed, required only for Tier 1-3. CAISO: Transmission Plan Approved.'),
  ('target_in_service_at_approval', 'Target in-service at approval', false,
   'The in-service date recorded when the project was approved. Frozen; never overwritten by a revision.'),
  ('target_in_service_prior_vintage', 'Target in-service, prior vintage', false,
   'An expected in-service date as it stood at an earlier publication. CAISO ships roughly fifteen of these in the workbook itself.'),
  ('target_in_service_current', 'Target in-service, current', false,
   'The expected in-service date in the vintage being ingested.'),
  ('permit_filing_expected', 'Permit filing expected', false,
   'Expected regulatory permit application filing. CAISO only.'),
  ('construction_start_expected', 'Construction start expected', false,
   'Expected construction start. No market in V1 publishes an actual construction start, so no actual kind exists for it.'),
  ('actual_in_service', 'Actual in-service', true,
   'The date the project was energised, as the publisher reports it.');

create table reference.buildout_date_qualities (
  code          text primary key
                  constraint buildout_date_qualities_code_format check (code ~ '^[a-z][a-z_]*$'),
  display_name  text not null,
  is_usable     boolean not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.buildout_date_qualities is
  'Whether a milestone carries a date that may be used in arithmetic. A defect here never changes the lifecycle state.';

insert into reference.buildout_date_qualities (code, display_name, is_usable, description) values
  ('reported', 'Reported', true, 'The publisher supplied a date and it parsed.'),
  ('sentinel_unknown', 'Sentinel, unknown', false,
   'The publisher used a placeholder rather than a date. ERCOT writes year 9999 for a completed project whose date it has not supplied.'),
  ('unparseable', 'Unparseable', false, 'A value was present and could not be read as a date. Retained verbatim.'),
  ('not_reported', 'Not reported', false, 'The field was empty.');

create table reference.buildout_date_precisions (
  code          text primary key,
  display_name  text not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

insert into reference.buildout_date_precisions (code, display_name, description) values
  ('day', 'Day', 'A day-precision date as published.'),
  ('month', 'Month', 'Month and year. ERCOT instructs Month/Yr even though cells are typed as dates.'),
  ('year', 'Year', 'Year only.'),
  ('none', 'None', 'No usable date; precision is not asserted.');

create table reference.buildout_quantity_kinds (
  code          text primary key
                  constraint buildout_quantity_kinds_code_format check (code ~ '^[a-z][a-z_]*$'),
  display_name  text not null,
  unit          text not null,
  is_optional_at_source boolean not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.buildout_quantity_kinds is
  'Native quantities, stored separately and never summed into a common unit. is_optional_at_source records whether a blank may be read as zero: for ERCOT mileage it may not.';

insert into reference.buildout_quantity_kinds (code, display_name, unit, is_optional_at_source, description) values
  ('service_level_kv', 'Service level', 'kV', false, 'ERCOT Service Level kV. Required of TSPs and fully populated.'),
  ('circuit_miles_new', 'Circuit miles, new', 'miles', true,
   'ERCOT Trans Circuit Miles New. Optional; a blank is not evidence of zero.'),
  ('circuit_miles_rebuilt', 'Circuit miles, rebuilt or reconductored', 'miles', true,
   'ERCOT Trans Circuit Miles Rebuilt, Reconductored or Upgraded. Optional; a blank is not evidence of zero.'),
  ('autotransformer_capacity_mva', 'Autotransformer capacity', 'MVA', true, 'ERCOT. Optional.'),
  ('reactive_capability_mvar', 'Reactive capability added', 'Mvar', true,
   'ERCOT. Optional, signed: negative is a reactor, positive a capacitor.');

create table reference.buildout_driver_classes (
  code          text primary key
                  constraint buildout_driver_classes_code_format check (code ~ '^[a-z][a-z_]*$'),
  display_name  text not null,
  is_headline   boolean not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.buildout_driver_classes is
  'What caused the project. Only is_headline classes may reach a published buildout metric; generator interconnection belongs to the Interconnection Queue.';

insert into reference.buildout_driver_classes (code, display_name, is_headline, description) values
  ('regional_reliability', 'Regional reliability', true, 'Driven by a reliability need.'),
  ('economic', 'Economic', true, 'Driven by congestion or production cost.'),
  ('public_policy', 'Public policy', true, 'Driven by a policy requirement.'),
  ('local_other', 'Local or other', true, 'Local transmission work with no other stated driver.'),
  ('generator_interconnection', 'Generator interconnection', false,
   'Triggered by a generation or storage interconnection. Excluded from buildout metrics.'),
  ('load_interconnection', 'Load interconnection', false,
   'A point of delivery serving load. Real investment, but demand connection rather than network buildout.'),
  ('asset_condition', 'Asset condition', false, 'Age or condition driven replacement.'),
  ('unknown', 'Unknown', false,
   'Insufficient evidence. A keyword or interconnection-request number is a signal, not a classification.');

create table reference.buildout_driver_bases (
  code          text primary key,
  display_name  text not null,
  is_sufficient boolean not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.buildout_driver_bases is
  'How a driver class was decided. Only a sufficient basis may produce a class other than unknown.';

insert into reference.buildout_driver_bases (code, display_name, is_sufficient, description) values
  ('publisher_field', 'Publisher field', true, 'The publisher names the driver in a dedicated field or list.'),
  ('publisher_identifier', 'Publisher identifier', true,
   'An explicit publisher identifier ties the row to another process, e.g. an ERCOT interconnection request number.'),
  ('text_signal_only', 'Text signal only', false,
   'Wording suggests a driver and nothing states it. Yields unknown and is recorded as a coverage gap.'),
  ('none', 'None', false, 'No evidence either way.');

create table reference.buildout_relationship_kinds (
  code          text primary key,
  display_name  text not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

insert into reference.buildout_relationship_kinds (code, display_name, description) values
  ('associated_with', 'Associated with', 'The publisher listed the other project as associated. ERCOT Associated Projects.'),
  ('phase_of', 'Phase of', 'A phase or component of a larger project, where the publisher numbers phases.'),
  ('references_plan_item', 'References plan item', 'Points at an identifier in another of the publisher''s registers, e.g. ERCOT RTP or MOD.');

create table reference.buildout_deferral_reasons (
  code          text primary key
                  constraint buildout_deferral_reasons_code_format check (code ~ '^[a-z][a-z_]*$'),
  display_name  text not null,
  description   text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.buildout_deferral_reasons is
  'Why something retrieved was not canonicalised. Nothing is dropped silently.';

insert into reference.buildout_deferral_reasons (code, display_name, description) values
  ('missing_native_id', 'Missing native identifier', 'The row carried no usable publisher identifier.'),
  ('duplicate_native_id', 'Duplicate native identifier', 'The same identifier appeared more than once within one list in one snapshot.'),
  ('unmapped_lifecycle', 'Unmapped lifecycle', 'The native status has no defensible canonical class.'),
  ('status_contradicts_list', 'Status contradicts list', 'An optional status string disagrees with authoritative list membership.'),
  ('unparseable_date', 'Unparseable date', 'A date field held a value that could not be read.'),
  ('sentinel_date', 'Sentinel date', 'A placeholder stood where a date was expected, e.g. ERCOT year 9999.'),
  ('unparseable_quantity', 'Unparseable quantity', 'A quantity field held a value that could not be read as a number.'),
  ('unknown_vintage_column', 'Unknown vintage column', 'A dated column did not match the expected vintage pattern.'),
  ('driver_signal_only', 'Driver signal only', 'Wording suggested a driver with no explicit publisher evidence.'),
  ('unresolved_relationship', 'Unresolved relationship', 'A referenced project identifier was not present in the snapshot.');

-- ---------------------------------------------------------------- snapshots and raw evidence

create table pipeline.buildout_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  source_interface_id uuid not null references reference.source_interfaces (id) on delete restrict,
  grid_area_id        uuid not null references reference.grid_areas (id) on delete restrict,
  retrieval_id        uuid references pipeline.source_retrievals (id) on delete restrict,
  native_snapshot_key text not null
                        constraint buildout_snapshots_key_nonempty check (btrim(native_snapshot_key) <> ''),
  artifact_sha256     text not null
                        constraint buildout_snapshots_sha_format check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_url        text not null,
  artifact_bytes      bigint not null
                        constraint buildout_snapshots_bytes_positive check (artifact_bytes > 0),
  source_published_at timestamptz,
  observed_at         timestamptz not null,
  record_count        integer not null
                        constraint buildout_snapshots_records_nonnegative check (record_count >= 0),
  notes               text,
  created_at          timestamptz not null default now()
);

-- Snapshot identity is the interface, the bytes and the publisher's key. Re-running over an
-- unchanged artifact therefore finds the snapshot and does nothing, rather than re-deriving rows
-- and relying on conflict clauses further down.
create unique index buildout_snapshots_identity_idx
  on pipeline.buildout_snapshots (source_interface_id, artifact_sha256, native_snapshot_key);

comment on table pipeline.buildout_snapshots is
  'One retrieved transmission-project artifact. Both publishers republish in place at a stable URL, so the content hash rather than the filename is the change signal.';

create trigger buildout_snapshots_append_only
  before update or delete on pipeline.buildout_snapshots
  for each row execute function pipeline.forbid_mutation();

create table pipeline.raw_buildout_records (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  native_list   text not null
                  constraint raw_buildout_records_list_nonempty check (btrim(native_list) <> ''),
  row_ordinal   integer not null
                  constraint raw_buildout_records_ordinal_positive check (row_ordinal >= 1),
  native_id     text,
  payload       jsonb not null
                  constraint raw_buildout_records_payload_object check (jsonb_typeof(payload) = 'object'),
  created_at    timestamptz not null default now()
);

create unique index raw_buildout_records_identity_idx
  on pipeline.raw_buildout_records (snapshot_id, native_list, row_ordinal);

create index raw_buildout_records_native_id_idx
  on pipeline.raw_buildout_records (snapshot_id, native_id)
  where native_id is not null;

comment on table pipeline.raw_buildout_records is
  'One source row, verbatim, keyed by publisher field name. Fields are kept whether or not V1 analytics read them; personal-contact sheets are never ingested at all.';

create trigger raw_buildout_records_append_only
  before update or delete on pipeline.raw_buildout_records
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- durable identity

create table pipeline.buildout_projects (
  id                  uuid primary key default gen_random_uuid(),
  source_interface_id uuid not null references reference.source_interfaces (id) on delete restrict,
  grid_area_id        uuid not null references reference.grid_areas (id) on delete restrict,
  native_id           text not null
                        constraint buildout_projects_native_id_nonempty check (btrim(native_id) <> ''),
  occurrence          integer not null default 1
                        constraint buildout_projects_occurrence_positive check (occurrence >= 1),
  first_snapshot_id   uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  created_at          timestamptz not null default now()
);

-- ERCOT's Future sheet holds 1,429 rows against 1,424 distinct project numbers, so the identifier
-- alone is not row-unique within a snapshot. Occurrence disambiguates repeats without normalising
-- the publisher's suffixes away and without inventing a merge.
create unique index buildout_projects_identity_idx
  on pipeline.buildout_projects (source_interface_id, native_id, occurrence);

comment on table pipeline.buildout_projects is
  'Durable project identity, scoped to the source interface. Native suffixes such as 72876A are part of the identifier. No fuzzy matching and no cross-market identity.';

create trigger buildout_projects_append_only
  before update or delete on pipeline.buildout_projects
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- observations

create table pipeline.buildout_project_observations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references pipeline.buildout_projects (id) on delete restrict,
  snapshot_id     uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  raw_record_id   uuid not null references pipeline.raw_buildout_records (id) on delete restrict,
  native_list     text not null,
  title           text,
  description     text,
  sponsor         text,
  native_status   text,
  tier            text,
  driver_class    text not null default 'unknown'
                    references reference.buildout_driver_classes (code) on delete restrict,
  driver_basis    text not null default 'none'
                    references reference.buildout_driver_bases (code) on delete restrict,
  driver_evidence text,
  created_at      timestamptz not null default now(),
  -- A class other than unknown needs a basis the vocabulary calls sufficient. This is the rule that
  -- stops a regex from becoming a classification.
  constraint buildout_project_observations_driver_evidenced check (
    driver_class = 'unknown' or driver_basis in ('publisher_field', 'publisher_identifier'))
);

create unique index buildout_project_observations_identity_idx
  on pipeline.buildout_project_observations (project_id, snapshot_id);

create index buildout_project_observations_snapshot_idx
  on pipeline.buildout_project_observations (snapshot_id);

comment on table pipeline.buildout_project_observations is
  'What one snapshot said about one project. A later vintage adds a row; it never edits this one.';

create trigger buildout_project_observations_append_only
  before update or delete on pipeline.buildout_project_observations
  for each row execute function pipeline.forbid_mutation();

create table pipeline.buildout_lifecycle_observations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references pipeline.buildout_projects (id) on delete restrict,
  snapshot_id     uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  raw_record_id   uuid not null references pipeline.raw_buildout_records (id) on delete restrict,
  lifecycle_state text not null references reference.buildout_lifecycle_states (code) on delete restrict,
  basis           text not null references reference.buildout_lifecycle_bases (code) on delete restrict,
  native_status   text,
  native_list     text not null,
  created_at      timestamptz not null default now(),
  -- An unmapped basis can only produce unknown, and unknown can only come from an unmapped basis.
  constraint buildout_lifecycle_observations_unmapped_is_unknown check (
    (basis = 'unmapped') = (lifecycle_state = 'unknown'))
);

create unique index buildout_lifecycle_observations_identity_idx
  on pipeline.buildout_lifecycle_observations (project_id, snapshot_id);

comment on table pipeline.buildout_lifecycle_observations is
  'The canonical state and how it was decided. Basis records whether authoritative list membership or a merely optional status string produced it.';

create trigger buildout_lifecycle_observations_append_only
  before update or delete on pipeline.buildout_lifecycle_observations
  for each row execute function pipeline.forbid_mutation();

create table pipeline.buildout_milestones (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references pipeline.buildout_projects (id) on delete restrict,
  snapshot_id     uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  raw_record_id   uuid not null references pipeline.raw_buildout_records (id) on delete restrict,
  kind            text not null references reference.buildout_milestone_kinds (code) on delete restrict,
  vintage_label   text,
  observed_date   date,
  date_precision  text not null references reference.buildout_date_precisions (code) on delete restrict,
  date_quality    text not null references reference.buildout_date_qualities (code) on delete restrict,
  native_value    text,
  source_field    text not null
                    constraint buildout_milestones_field_nonempty check (btrim(source_field) <> ''),
  created_at      timestamptz not null default now(),
  -- A usable date exists exactly when the quality says it does. This is what keeps ERCOT's 9999
  -- from ever being read as a date, and what keeps a real date from hiding behind an unknown.
  constraint buildout_milestones_date_matches_quality check (
    (date_quality = 'reported') = (observed_date is not null)),
  constraint buildout_milestones_precision_matches_quality check (
    date_quality = 'reported' or date_precision = 'none')
);

-- A kind may repeat per snapshot only across vintage labels, which is what CAISO's roughly fifteen
-- prior in-service columns are.
create unique index buildout_milestones_identity_idx
  on pipeline.buildout_milestones
  (project_id, snapshot_id, kind, coalesce(vintage_label, ''));

create index buildout_milestones_kind_idx on pipeline.buildout_milestones (kind, observed_date)
  where observed_date is not null;

comment on table pipeline.buildout_milestones is
  'Typed, append-only dates. An original target is never overwritten by a revision: each is its own row, distinguished by vintage label.';

create trigger buildout_milestones_append_only
  before update or delete on pipeline.buildout_milestones
  for each row execute function pipeline.forbid_mutation();

create table pipeline.buildout_quantities (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references pipeline.buildout_projects (id) on delete restrict,
  snapshot_id     uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  raw_record_id   uuid not null references pipeline.raw_buildout_records (id) on delete restrict,
  kind            text not null references reference.buildout_quantity_kinds (code) on delete restrict,
  value_numeric   numeric,
  native_value    text,
  -- False when the publisher left the field empty. Kept distinct from a numeric zero because
  -- ERCOT's mileage columns are Optional: 169 of 262 completed rows report nothing, and reading
  -- that as zero would classify the majority of the series by inference.
  is_reported     boolean not null,
  created_at      timestamptz not null default now(),
  constraint buildout_quantities_unreported_has_no_value check (is_reported or value_numeric is null)
);

create unique index buildout_quantities_identity_idx
  on pipeline.buildout_quantities (project_id, snapshot_id, kind);

comment on table pipeline.buildout_quantities is
  'Native quantities with their unit vocabulary. Never summed across kinds or markets, and never converted into a common physical unit.';

create trigger buildout_quantities_append_only
  before update or delete on pipeline.buildout_quantities
  for each row execute function pipeline.forbid_mutation();

create table pipeline.buildout_relationships (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references pipeline.buildout_projects (id) on delete restrict,
  snapshot_id       uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  kind              text not null references reference.buildout_relationship_kinds (code) on delete restrict,
  related_native_id text not null
                      constraint buildout_relationships_related_nonempty check (btrim(related_native_id) <> ''),
  related_project_id uuid references pipeline.buildout_projects (id) on delete restrict,
  created_at        timestamptz not null default now(),
  constraint buildout_relationships_not_self check (related_project_id is null or related_project_id <> project_id)
);

create unique index buildout_relationships_identity_idx
  on pipeline.buildout_relationships (project_id, snapshot_id, kind, related_native_id);

comment on table pipeline.buildout_relationships is
  'Relationships the publisher states. Never inferred from similar names or shared endpoints; a suffixed identifier stays a distinct project.';

create trigger buildout_relationships_append_only
  before update or delete on pipeline.buildout_relationships
  for each row execute function pipeline.forbid_mutation();

create table pipeline.buildout_deferrals (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references pipeline.buildout_snapshots (id) on delete restrict,
  reason        text not null references reference.buildout_deferral_reasons (code) on delete restrict,
  native_list   text,
  native_key    text,
  native_value  text,
  detail        text not null
                  constraint buildout_deferrals_detail_nonempty check (btrim(detail) <> ''),
  row_ordinal   integer
                  constraint buildout_deferrals_ordinal_positive check (row_ordinal is null or row_ordinal >= 1),
  created_at    timestamptz not null default now()
);

create unique index buildout_deferrals_identity_idx
  on pipeline.buildout_deferrals
  (snapshot_id, reason, coalesce(native_list, ''), coalesce(native_key, ''),
   coalesce(native_value, ''), coalesce(row_ordinal, 0));

comment on table pipeline.buildout_deferrals is
  'What was seen and not canonicalised, with the publisher''s own value. A rerun records no second copy.';

create trigger buildout_deferrals_append_only
  before update or delete on pipeline.buildout_deferrals
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------------------------- invariants

create or replace function pipeline.buildout_domain_violations()
returns table (violation text, detail text, occurrences bigint)
language sql
stable
as $$
  -- A canonical observation whose raw row belongs to a different snapshot: the evidence chain is
  -- broken even though both foreign keys resolve.
  select 'observation_raw_snapshot_mismatch',
         'project observation cites a raw record from another snapshot',
         count(*)
    from pipeline.buildout_project_observations o
    join pipeline.raw_buildout_records r on r.id = o.raw_record_id
   where r.snapshot_id <> o.snapshot_id
  having count(*) > 0

  union all
  select 'lifecycle_raw_snapshot_mismatch',
         'lifecycle observation cites a raw record from another snapshot',
         count(*)
    from pipeline.buildout_lifecycle_observations l
    join pipeline.raw_buildout_records r on r.id = l.raw_record_id
   where r.snapshot_id <> l.snapshot_id
  having count(*) > 0

  union all
  select 'milestone_raw_snapshot_mismatch',
         'milestone cites a raw record from another snapshot',
         count(*)
    from pipeline.buildout_milestones m
    join pipeline.raw_buildout_records r on r.id = m.raw_record_id
   where r.snapshot_id <> m.snapshot_id
  having count(*) > 0

  union all
  select 'quantity_raw_snapshot_mismatch',
         'quantity cites a raw record from another snapshot',
         count(*)
    from pipeline.buildout_quantities q
    join pipeline.raw_buildout_records r on r.id = q.raw_record_id
   where r.snapshot_id <> q.snapshot_id
  having count(*) > 0

  union all
  -- A raw row with no retrieval behind its snapshot cannot be traced back to a rights state.
  select 'raw_record_without_retrieval',
         'raw record whose snapshot has no retrieval lineage',
         count(*)
    from pipeline.raw_buildout_records r
    join pipeline.buildout_snapshots s on s.id = r.snapshot_id
   where s.retrieval_id is null
  having count(*) > 0

  union all
  -- The rule GBV-1 exists to protect: a date defect must never demote an authoritative state.
  select 'sentinel_date_carries_value',
         'milestone marked unknown or unparseable yet holding a date',
         count(*)
    from pipeline.buildout_milestones
   where date_quality <> 'reported' and observed_date is not null
  having count(*) > 0

  union all
  select 'completed_list_not_in_service',
         'a row from an authoritative completed list not mapped to in_service',
         count(*)
    from pipeline.buildout_lifecycle_observations
   where native_list ilike 'completed%' and lifecycle_state <> 'in_service'
  having count(*) > 0

  union all
  select 'cancelled_list_not_cancelled',
         'a row from an authoritative cancelled list not mapped to cancelled',
         count(*)
    from pipeline.buildout_lifecycle_observations
   where native_list ilike 'cancelled%' and lifecycle_state <> 'cancelled'
  having count(*) > 0

  union all
  -- Personal contact data is excluded at the adapter. This proves it never arrived.
  select 'personal_contact_ingested',
         'a raw payload carrying a contact, email or phone field',
         count(*)
    from pipeline.raw_buildout_records r
   where exists (
           select 1 from jsonb_object_keys(r.payload) as k(key)
            where key ilike '%email%' or key ilike '%phone%' or key ilike '%contact%')
  having count(*) > 0

  union all
  select 'quantity_unreported_with_value',
         'a quantity marked not reported yet carrying a number',
         count(*)
    from pipeline.buildout_quantities
   where not is_reported and value_numeric is not null
  having count(*) > 0

  union all
  select 'relationship_resolves_to_self',
         'a stated relationship pointing at its own project',
         count(*)
    from pipeline.buildout_relationships
   where related_project_id = project_id
  having count(*) > 0

  union all
  select 'driver_class_without_sufficient_basis',
         'a driver class other than unknown resting on a text signal',
         count(*)
    from pipeline.buildout_project_observations
   where driver_class <> 'unknown'
     and driver_basis not in ('publisher_field', 'publisher_identifier')
  having count(*) > 0;
$$;

comment on function pipeline.buildout_domain_violations() is
  'Invariants no single constraint can express, chiefly that evidence chains stay within one snapshot and that a date defect never rewrites a lifecycle state. Expected to be empty.';

-- ---------------------------------------------------------------- source interfaces

insert into reference.source_use_purposes (code, display_name, is_public, description) values
  ('grid_buildout_retention', 'Grid buildout retention', false,
   'Retain retrieved transmission project trackers and the rows parsed from them.'),
  ('grid_buildout_calculation', 'Grid buildout calculation', false,
   'Derive project counts and schedule durations internally from retained project records.')
on conflict (code) do nothing;

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   is_active, notes)
select v.id, p.id, v.slug, v.name, 'power_system_operational_data', v.canonical_url, true,
       'public_unauthenticated', v.production_access_state, v.terms_review_state, v.terms_review_state,
       true, v.notes
from (values
  ('9b000000-0000-4000-8400-000000000001'::uuid, 'ercot-planning', 'ercot-tpit-transmission-projects',
   'ERCOT Transmission Project and Information Tracking (TPIT)',
   'https://www.ercot.com/gridinfo/sysplan',
   'production_review_pending', 'permitted',
   'A single XLSX republished roughly three times a year at a stable URL, no account. Four lifecycle sheets -- Future, Planned, Completed, Cancelled -- share one 33-column schema and partition the tracker with no overlap. Sheet membership is the lifecycle authority: the workbook''s own Transmission Status column is Optional in ERCOT''s field dictionary and disagrees with the sheet on 44.7% of completed rows. Actual In-Service Date is required once a project energises and is populated on all 262 completed rows, but nine of them carry year 9999, which asserts completion without a date. The public file is the No Cost variant, so per-project cost is withheld by design. Both circuit-mile columns are Optional and 169 of 262 completed rows report neither.'),
  ('9b000000-0000-4000-8400-000000000002'::uuid, 'caiso', 'caiso-tdf-approved-tpp-projects',
   'CAISO Transmission Development Forum, Approved Projects (Transmission Planning Process)',
   'https://www.caiso.com/library/transmission-development-forum',
   'production_review_pending', 'permitted',
   'An XLSX posted twice a year, no account, one sheet per participating transmission owner plus a legend. The workbook is its own longitudinal archive: roughly fifteen dated prior in-service columns sit beside a frozen in-service date at approval, so schedule revisions are readable without having snapshotted earlier forums. Project Status is uncontrolled free text -- four spellings of in-flight, two of in service -- and is preserved rather than mapped. Only eight of 233 rows are in service, so this interface supports schedule slip and not a completion census. The sibling generator-interconnection workbook is a different object and is never ingested here.')
) as v(id, provider_slug, slug, name, canonical_url, production_access_state, terms_review_state, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

update reference.source_interfaces set
  terms_artifact_url = 'https://www.ercot.com/help/terms',
  terms_retrieved_at = timestamptz '2026-09-22T00:00:00Z',
  terms_evidence = jsonb_build_object(
    'reviewed_on', '2026-09-22',
    'research', 'docs/research/grid-buildout-velocity/gbv-1-architecture.md',
    'documents', jsonb_build_array(jsonb_build_object(
      'title', 'ERCOT Terms of Use',
      'url', 'https://www.ercot.com/help/terms',
      'note', 'Raw data in public portions of the website may be used and reproduced in '
              || 'compilations, charts and analyses with attribution. GBV-1 classified this '
              || 'interface reusable_with_attribution_or_conditions on that grant, assessed for '
              || 'the TPIT workbook specifically rather than inherited from another ERCOT '
              || 'interface.')))
where slug = 'ercot-tpit-transmission-projects';

update reference.source_interfaces set
  terms_artifact_url = 'https://www.caiso.com/legal-notices',
  terms_retrieved_at = timestamptz '2026-09-22T00:00:00Z',
  terms_evidence = jsonb_build_object(
    'reviewed_on', '2026-09-22',
    'research', 'docs/research/grid-buildout-velocity/gbv-1-architecture.md',
    'documents', jsonb_build_array(jsonb_build_object(
      'title', 'CAISO website legal notices',
      'url', 'https://www.caiso.com/legal-notices',
      'note', 'Public-record style reuse of material posted on the website, with attribution. '
              || 'GBV-1 classified this interface reusable_with_attribution_or_conditions. The '
              || 'CAISO API terms, which assert a CAISO Data ownership clause, govern a different '
              || 'interface and are not relied on here because the TDF workbook is a plain file '
              || 'download.')))
where slug = 'caiso-tdf-approved-tpp-projects';

-- ---------------------------------------------------------------- security

-- No policies: these schemas are not exposed through the API, and every reader reaches them with a
-- privileged connection. RLS on with no policy is the deny-by-default posture the roster test
-- enforces across both schemas.

alter table reference.buildout_lifecycle_states enable row level security;
alter table reference.buildout_lifecycle_bases enable row level security;
alter table reference.buildout_milestone_kinds enable row level security;
alter table reference.buildout_date_qualities enable row level security;
alter table reference.buildout_date_precisions enable row level security;
alter table reference.buildout_quantity_kinds enable row level security;
alter table reference.buildout_driver_classes enable row level security;
alter table reference.buildout_driver_bases enable row level security;
alter table reference.buildout_relationship_kinds enable row level security;
alter table reference.buildout_deferral_reasons enable row level security;
alter table pipeline.buildout_snapshots enable row level security;
alter table pipeline.raw_buildout_records enable row level security;
alter table pipeline.buildout_projects enable row level security;
alter table pipeline.buildout_project_observations enable row level security;
alter table pipeline.buildout_lifecycle_observations enable row level security;
alter table pipeline.buildout_milestones enable row level security;
alter table pipeline.buildout_quantities enable row level security;
alter table pipeline.buildout_relationships enable row level security;
alter table pipeline.buildout_deferrals enable row level security;
