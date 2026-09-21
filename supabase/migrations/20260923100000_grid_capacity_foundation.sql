-- PD-4B: the grid capacity domain.
--
-- Three layers, kept apart on purpose, because the research found four quantities that markets
-- publish side by side and that mean entirely different things:
--
--   what a system can supply        capability      ERCOT CDR total, CAISO NQC, ISO-NE qualified
--   what it is obliged to hold      requirement     PJM Reliability Requirement, MISO PRMR, ICR
--   what the network permits        constraint      CETL, CIL, MIC, MCL
--   what Urdais concluded           derived         deliverable capacity
--
-- Subtracting a requirement from a capability is a methodology. Adding them is nonsense. The
-- schema refuses to let the second happen by making the classification mandatory, un-defaulted,
-- and separately enforced per table: components may not hold a derived quantity, derived results
-- may not hold anything else, and constraints live in their own layer so that Transmission
-- Headroom can later read the same rows instead of storing a second copy.
--
-- A naming note that matters more than it should. `pipeline.capacity_observations`,
-- `capacity_source_observations` and `reference.capacity_signal_capabilities` already exist in
-- this repository and are about rentable GPUs. Nothing here may be called `capacity_*` on its
-- own; grid power objects are `grid_capacity_*`, `grid_constraint_*` and `deliverable_capacity_*`
-- so that a future reader grepping for capacity cannot mistake one domain for the other.
--
-- This migration ingests nothing and encodes no market formula.

-- ------------------------------------------------------------------------ shared vocabulary

create table reference.capacity_quantity_kinds (
  code        text primary key
                constraint capacity_quantity_kinds_code_format check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  display_name text not null,
  description text not null,
  /** Whether a value of this kind is something a publisher stated or something Urdais concluded. */
  origin      text not null
                constraint capacity_quantity_kinds_origin_allowed check (origin in ('source_published', 'urdais_derived')),
  created_at  timestamptz not null default now()
);

comment on table reference.capacity_quantity_kinds is
  'What a grid capacity number is: a capability, an obligation, a network limit, a raw resource count, an Urdais conclusion, or a figure kept only for cross-checking. Never inferred from a source term; always recorded by the adapter that read it.';

insert into reference.capacity_quantity_kinds (code, display_name, description, origin) values
  ('capability', 'Capability', 'What the system or locality can supply, on the source''s own accreditation. ERCOT''s protocol-prescribed CDR total, CAISO NQC, ISO-NE qualified capacity.', 'source_published'),
  ('requirement', 'Requirement', 'What the system is obliged to hold. PJM''s Reliability Requirement, MISO''s PRMR, ISO-NE''s ICR. Never a supply figure.', 'source_published'),
  ('constraint', 'Network constraint', 'A limit the network imposes on delivery: CETL, CIL, CEL, MIC, MCL, TSL. Stored in pipeline.grid_constraint_values, not as a capacity component.', 'source_published'),
  ('resource_quantity', 'Resource quantity', 'A count or rating of resources that is not itself an accredited capability, such as installed or nameplate MW.', 'source_published'),
  ('derived_quantity', 'Derived quantity', 'A value Urdais calculated under an approved methodology. Only pipeline.deliverable_capacity_results may hold one.', 'urdais_derived'),
  ('diagnostic_only', 'Diagnostic only', 'Retained for cross-checking and never used in a published calculation. EIA-860 summer capacity is the standing example.', 'source_published');

create table reference.capacity_component_kinds (
  code         text primary key
                 constraint capacity_component_kinds_code_format check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  display_name text not null,
  description  text not null,
  created_at   timestamptz not null default now()
);

comment on table reference.capacity_component_kinds is
  'The native role a quantity plays, kept separate from its classification. A component is both a kind of thing (import capability) and a kind of quantity (capability); collapsing the two loses one of them.';

insert into reference.capacity_component_kinds (code, display_name, description) values
  ('accredited_resource_capacity', 'Accredited resource capacity', 'Resource capability as the market accredits it, not as nameplate.'),
  ('procured_capacity', 'Procured capacity', 'Capacity cleared or committed through a market mechanism.'),
  ('installed_capacity', 'Installed capacity', 'Installed or nameplate rating, which is not an accreditation.'),
  ('import_capability', 'Import capability', 'Capability to import into an area or locality.'),
  ('export_capability', 'Export capability', 'Capability to export out of an area or locality.'),
  ('transfer_capability', 'Transfer capability', 'Capability to move power across an interface in either stated direction.'),
  ('reserve_requirement', 'Reserve requirement', 'Reserve margin or planning reserve obligation.'),
  ('local_reliability_requirement', 'Local reliability requirement', 'An obligation specific to a locality or capacity zone.'),
  ('demand_response', 'Demand response', 'Load that the market recognises as a capacity resource.'),
  ('storage_capability', 'Storage capability', 'Storage capability as the market accredits it.'),
  ('firm_capacity', 'Firm capacity', 'Capacity under a firm commitment or contract.'),
  ('other', 'Other', 'A native role the vocabulary does not yet name. Requires a source term.');

-- The basis a capacity number is denominated in. Two numbers on different bases are not
-- comparable and must never be combined; ICAP and UCAP differ by the forced-outage treatment.
create table reference.capacity_bases (
  code         text primary key
                 constraint capacity_bases_code_format check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  display_name text not null,
  description  text not null,
  created_at   timestamptz not null default now()
);

insert into reference.capacity_bases (code, display_name, description) values
  ('ucap', 'Unforced capacity (UCAP)', 'Capacity net of forced-outage expectation.'),
  ('icap', 'Installed capacity (ICAP)', 'Capacity before forced-outage derating.'),
  ('nqc', 'Net qualifying capacity', 'CAISO''s accreditation basis.'),
  ('accredited', 'Accredited', 'A market-specific accreditation that is none of the above by name.'),
  ('nameplate', 'Nameplate', 'Manufacturer rating. Never an accreditation.'),
  ('unspecified', 'Unspecified', 'The source did not state a basis. Blocks combination rather than assuming one.');

-- ------------------------------------------------------------------------------- geography
--
-- Localities are deliberately not rows in reference.grid_areas. That table is one row per EIA
-- balancing authority, its eia_ba_code is unique, and PD-2's coincident aggregation resolves
-- seven-market membership through it; adding PJM's LDAs there would silently change what the
-- seven-market universe means.

create table reference.grid_subareas (
  id             uuid primary key default gen_random_uuid(),
  grid_area_id   uuid not null references reference.grid_areas (id) on delete restrict,
  subarea_kind   text not null
                   constraint grid_subareas_kind_allowed
                   check (subarea_kind in ('lda', 'lrz', 'locality', 'local_capacity_area',
                                           'capacity_zone', 'load_zone', 'other')),
  native_key     text not null
                   constraint grid_subareas_key_nonempty check (btrim(native_key) <> ''),
  native_label   text not null
                   constraint grid_subareas_label_nonempty check (btrim(native_label) <> ''),
  notes          text,
  effective_from timestamptz not null,
  effective_to   timestamptz,
  created_at     timestamptz not null default now(),
  constraint grid_subareas_interval_ordered check (effective_to is null or effective_to > effective_from)
);

comment on table reference.grid_subareas is
  'A locality inside one balancing authority: a PJM LDA, a MISO LRZ, a NYISO locality, a CAISO local capacity area, an ISO-NE capacity zone. Markets define these differently, so the kind is recorded rather than harmonised.';

create unique index grid_subareas_current_identity_idx
  on reference.grid_subareas (grid_area_id, subarea_kind, native_key) where effective_to is null;
create index grid_subareas_area_idx on reference.grid_subareas (grid_area_id, subarea_kind);

-- A directional transfer boundary. Shared infrastructure: PD-4 reads these to bound deliverable
-- capacity, and Transmission Headroom will later read the same rows rather than keeping a copy.
create table reference.grid_interfaces (
  id                uuid primary key default gen_random_uuid(),
  grid_area_id      uuid not null references reference.grid_areas (id) on delete restrict,
  from_subarea_id   uuid references reference.grid_subareas (id) on delete restrict,
  to_subarea_id     uuid references reference.grid_subareas (id) on delete restrict,
  interface_kind    text not null
                      constraint grid_interfaces_kind_allowed
                      check (interface_kind in ('import', 'export', 'internal_transfer', 'external_tie', 'other')),
  native_key        text not null
                      constraint grid_interfaces_key_nonempty check (btrim(native_key) <> ''),
  native_label      text not null
                      constraint grid_interfaces_label_nonempty check (btrim(native_label) <> ''),
  notes             text,
  effective_from    timestamptz not null,
  effective_to      timestamptz,
  created_at        timestamptz not null default now(),
  constraint grid_interfaces_interval_ordered check (effective_to is null or effective_to > effective_from),
  -- An interface between nothing and nothing is not a boundary, and one whose two ends are the
  -- same locality is not a transfer.
  constraint grid_interfaces_has_an_end check (from_subarea_id is not null or to_subarea_id is not null),
  constraint grid_interfaces_ends_differ check (from_subarea_id is distinct from to_subarea_id)
);

comment on table reference.grid_interfaces is
  'A directional transfer boundary. Shared between Deliverable Capacity and the future Transmission Headroom section so neither owns a private copy of the same limit.';

create unique index grid_interfaces_current_identity_idx
  on reference.grid_interfaces (grid_area_id, native_key) where effective_to is null;

-- A locality belongs to exactly one balancing authority, and an interface's ends must belong to
-- the balancing authority it is declared under. A CHECK cannot join, so this is a trigger.
create or replace function reference.check_grid_interface_ends()
returns trigger language plpgsql as $$
declare owner uuid;
begin
  if new.from_subarea_id is not null then
    select grid_area_id into owner from reference.grid_subareas where id = new.from_subarea_id;
    if owner is distinct from new.grid_area_id then
      raise exception 'interface end % belongs to a different balancing authority', new.from_subarea_id
        using errcode = 'check_violation';
    end if;
  end if;
  if new.to_subarea_id is not null then
    select grid_area_id into owner from reference.grid_subareas where id = new.to_subarea_id;
    if owner is distinct from new.grid_area_id then
      raise exception 'interface end % belongs to a different balancing authority', new.to_subarea_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger grid_interfaces_ends_check
  before insert or update on reference.grid_interfaces
  for each row execute function reference.check_grid_interface_ends();

-- ---------------------------------------------------------------------- source releases

create table pipeline.grid_capacity_vintages (
  id                         uuid primary key default gen_random_uuid(),
  grid_area_id               uuid not null references reference.grid_areas (id) on delete restrict,
  source_interface_id        uuid not null references reference.source_interfaces (id) on delete restrict,
  source_retrieval_id        uuid not null references pipeline.source_retrievals (id) on delete restrict,
  native_vintage_key         text not null
                               constraint grid_capacity_vintages_key_nonempty check (btrim(native_vintage_key) <> ''),
  native_report_id           text,
  report_title               text not null
                               constraint grid_capacity_vintages_title_nonempty check (btrim(report_title) <> ''),
  release_kind               text not null
                               constraint grid_capacity_vintages_release_kind_allowed
                               check (release_kind in ('adequacy_report', 'auction_result', 'accreditation_release',
                                                       'requirement_filing', 'study', 'tariff_document', 'other')),
  published_at               timestamptz not null,
  published_at_precision     text not null default 'day'
                               constraint grid_capacity_vintages_precision_allowed
                               check (published_at_precision in ('year', 'month', 'day', 'minute')),
  retrieved_at               timestamptz not null,
  source_methodology_name    text,
  source_methodology_version text,
  rights_classification      text not null references reference.source_rights_classifications (code) on delete restrict,
  publication_state          text not null default 'internal_only'
                               constraint grid_capacity_vintages_publication_state_allowed
                               check (publication_state in ('internal_only', 'publication_candidate', 'published', 'withdrawn')),
  quality_status             text not null default 'provisional'
                               constraint grid_capacity_vintages_quality_allowed
                               check (quality_status in ('accepted', 'provisional', 'suspect')),
  review_notes               text,
  superseded_by_id           uuid references pipeline.grid_capacity_vintages (id) on delete restrict
                               deferrable initially deferred,
  superseded_at              timestamptz,
  supersession_reason        text,
  supersession_kind          text
                               constraint grid_capacity_vintages_supersession_kind_allowed
                               check (supersession_kind in ('correction', 'reissue')),
  created_at                 timestamptz not null default now(),
  constraint grid_capacity_vintages_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null and supersession_kind is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null and supersession_kind is not null)
  ),
  constraint grid_capacity_vintages_not_self_superseding check (superseded_by_id is null or superseded_by_id <> id),
  constraint grid_capacity_vintages_retrieved_after_published check (retrieved_at >= published_at)
);

comment on table pipeline.grid_capacity_vintages is
  'One immutable capacity release: a CDR, an auction result, an accreditation posting, a requirement filing. A new annual release is a new vintage and supersedes nothing; overlapping target years across releases are normal.';

create unique index grid_capacity_vintages_current_idx
  on pipeline.grid_capacity_vintages (source_interface_id, grid_area_id, native_vintage_key)
  where superseded_by_id is null;
create index grid_capacity_vintages_market_idx
  on pipeline.grid_capacity_vintages (grid_area_id, published_at desc);

-- Supersession is confined to a correction or reissue of the same release, in the same market,
-- from the same interface. A later annual release cannot pose as a correction of its predecessor.
create or replace function pipeline.allow_only_grid_capacity_vintage_supersession()
returns trigger language plpgsql as $$
declare successor record; old_json jsonb; new_json jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'grid capacity vintages are never deleted: supersede them instead'
      using errcode = 'restrict_violation';
  end if;
  if tg_op = 'INSERT' then
    if new.superseded_by_id is not null then
      raise exception 'a capacity vintage is inserted live; supersession is a later act'
        using errcode = 'restrict_violation';
    end if;
    if exists (
      select 1 from pipeline.grid_capacity_vintages v
       where v.superseded_by_id = new.id
         and (v.native_vintage_key <> new.native_vintage_key
              or v.grid_area_id <> new.grid_area_id
              or v.source_interface_id <> new.source_interface_id)
    ) then
      raise exception 'capacity vintage % was offered as a correction of a different source release', new.native_vintage_key
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if old.superseded_by_id is not null then
    raise exception 'capacity vintage % is already superseded and is immutable', old.id
      using errcode = 'restrict_violation';
  end if;
  if new.superseded_by_id is null or new.superseded_at is null
     or new.supersession_reason is null or new.supersession_kind is null then
    raise exception 'superseding a capacity vintage sets superseded_by_id, superseded_at, supersession_reason and supersession_kind together'
      using errcode = 'restrict_violation';
  end if;
  old_json := to_jsonb(old) - 'superseded_by_id' - 'superseded_at' - 'supersession_reason' - 'supersession_kind';
  new_json := to_jsonb(new) - 'superseded_by_id' - 'superseded_at' - 'supersession_reason' - 'supersession_kind';
  if old_json <> new_json then
    raise exception 'update on pipeline.grid_capacity_vintages changed columns other than the supersession columns'
      using errcode = 'restrict_violation';
  end if;
  select grid_area_id, source_interface_id, native_vintage_key into successor
    from pipeline.grid_capacity_vintages where id = new.superseded_by_id;
  if not found then return new; end if;
  if successor.native_vintage_key <> new.native_vintage_key
     or successor.grid_area_id <> new.grid_area_id
     or successor.source_interface_id <> new.source_interface_id then
    raise exception 'a capacity vintage may only be superseded by a correction or reissue of the same source release (%), not by %',
      new.native_vintage_key, successor.native_vintage_key using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger grid_capacity_vintages_supersede_only
  before insert or update or delete on pipeline.grid_capacity_vintages
  for each row execute function pipeline.allow_only_grid_capacity_vintage_supersession();

create table pipeline.grid_capacity_scenarios (
  id                    uuid primary key default gen_random_uuid(),
  vintage_id            uuid not null references pipeline.grid_capacity_vintages (id) on delete restrict,
  native_scenario_key   text not null
                          constraint grid_capacity_scenarios_key_nonempty check (btrim(native_scenario_key) <> ''),
  native_scenario_label text not null
                          constraint grid_capacity_scenarios_label_nonempty check (btrim(native_scenario_label) <> ''),
  canonical_class       text
                          constraint grid_capacity_scenarios_class_allowed
                          check (canonical_class in ('reference', 'high', 'low', 'sensitivity', 'other')),
  is_reference          boolean not null default false,
  assumptions           jsonb not null default '{}'::jsonb
                          constraint grid_capacity_scenarios_assumptions_object check (jsonb_typeof(assumptions) = 'object'),
  assumptions_text      text,
  created_at            timestamptz not null default now(),
  unique (vintage_id, native_scenario_key)
);

comment on table pipeline.grid_capacity_scenarios is
  'A case as the publisher named it, scoped to one release: summer and winter, a transmission project in or out, a base case and its sensitivities. There is no cross-market scenario taxonomy and there should not be one.';

create unique index grid_capacity_scenarios_one_reference_idx
  on pipeline.grid_capacity_scenarios (vintage_id) where is_reference;

-- -------------------------------------------------------------------------- raw evidence

create table pipeline.raw_grid_capacity_records (
  id                 uuid primary key default gen_random_uuid(),
  retrieval_id       uuid not null references pipeline.source_retrievals (id) on delete restrict,
  row_ordinal        integer not null
                       constraint raw_grid_capacity_ordinal_nonnegative check (row_ordinal >= 0),
  record_hash        text not null
                       constraint raw_grid_capacity_hash_format check (record_hash ~ '^[0-9a-f]{64}$'),
  artifact_ref       text,
  native_geography   text not null,
  native_period      text not null,
  native_scenario    text,
  -- The publisher's own word for the quantity: "CETL", "PRMR", "Net Qualifying Capacity".
  -- Retained verbatim because the classification must never be re-derived from it later.
  native_term        text not null
                       constraint raw_grid_capacity_term_nonempty check (btrim(native_term) <> ''),
  native_value       text,
  native_unit        text not null,
  raw_payload        jsonb not null,
  extraction_method  text not null
                       constraint raw_grid_capacity_method_allowed
                       check (extraction_method in ('workbook_cell', 'pdf_table', 'csv_row', 'html_table',
                                                    'tariff_clause', 'manual_transcription')),
  extraction_version text not null
                       constraint raw_grid_capacity_version_nonempty check (btrim(extraction_version) <> ''),
  workbook_sheet     text,
  workbook_range     text,
  workbook_cell      text,
  pdf_page           integer constraint raw_grid_capacity_pdf_page_positive check (pdf_page is null or pdf_page > 0),
  pdf_table          text,
  csv_row_number     integer constraint raw_grid_capacity_csv_row_nonnegative check (csv_row_number is null or csv_row_number >= 0),
  html_selector      text,
  -- Capacity values often come from a manual or tariff, where the durable address is a section
  -- or clause rather than a cell or a page that repagination will move.
  document_section   text,
  clause_reference   text,
  archive_ref        text,
  archive_member     text,
  archive_member_hash text
                       constraint raw_grid_capacity_archive_hash_format
                       check (archive_member_hash is null or archive_member_hash ~ '^[0-9a-f]{64}$'),
  created_at         timestamptz not null default now(),
  unique (retrieval_id, row_ordinal),
  unique (retrieval_id, record_hash),
  constraint raw_grid_capacity_archive_member_needs_archive
    check (archive_member is null or archive_ref is not null),
  constraint raw_grid_capacity_archive_hash_needs_member
    check (archive_member_hash is null or archive_member is not null),
  constraint raw_grid_capacity_locator_present check (
    case extraction_method
      when 'workbook_cell' then workbook_sheet is not null and (workbook_cell is not null or workbook_range is not null)
      when 'pdf_table'     then pdf_page is not null
      when 'csv_row'       then csv_row_number is not null
      when 'html_table'    then html_selector is not null
      when 'tariff_clause' then document_section is not null or clause_reference is not null
      when 'manual_transcription' then artifact_ref is not null
      else false
    end
  )
);

comment on table pipeline.raw_grid_capacity_records is
  'One capacity value as it was extracted, with the locator needed to find it again. Append-only. A tariff clause is a first-class locator because a manual section outlives the page it happened to be printed on.';

create index raw_grid_capacity_retrieval_idx on pipeline.raw_grid_capacity_records (retrieval_id, row_ordinal);
create trigger raw_grid_capacity_records_append_only
  before update or delete on pipeline.raw_grid_capacity_records
  for each row execute function pipeline.forbid_mutation();

-- ---------------------------------------------- normalized source-published components

create table pipeline.grid_capacity_components (
  id                  uuid primary key default gen_random_uuid(),
  vintage_id          uuid not null references pipeline.grid_capacity_vintages (id) on delete restrict,
  scenario_id         uuid not null references pipeline.grid_capacity_scenarios (id) on delete restrict,
  grid_area_id        uuid not null references reference.grid_areas (id) on delete restrict,
  grid_subarea_id     uuid references reference.grid_subareas (id) on delete restrict,
  grid_interface_id   uuid references reference.grid_interfaces (id) on delete restrict,
  raw_record_id       uuid not null references pipeline.raw_grid_capacity_records (id) on delete restrict,

  quantity_kind       text not null references reference.capacity_quantity_kinds (code) on delete restrict,
  component_kind      text not null references reference.capacity_component_kinds (code) on delete restrict,
  -- The publisher's own term, carried through so the classification can always be audited
  -- against the word the source used.
  source_term         text not null
                        constraint grid_capacity_components_term_nonempty check (btrim(source_term) <> ''),

  period_basis        text not null
                        constraint grid_capacity_components_period_basis_allowed
                        check (period_basis in ('calendar', 'delivery_year', 'capability_year',
                                                'capacity_commitment_period', 'planning_year', 'seasonal')),
  target_year         integer not null
                        constraint grid_capacity_components_year_range check (target_year between 1990 and 2200),
  target_season       text
                        constraint grid_capacity_components_season_allowed
                        check (target_season in ('winter', 'spring', 'summer', 'fall')),
  period_start        date,
  period_end          date,

  value               numeric not null constraint grid_capacity_components_value_finite check (value <> 'NaN'::numeric),
  unit                text not null
                        constraint grid_capacity_components_unit_allowed check (unit in ('MW', 'GW')),
  capacity_basis      text not null references reference.capacity_bases (code) on delete restrict,

  quality_status      text not null default 'provisional'
                        constraint grid_capacity_components_quality_allowed
                        check (quality_status in ('accepted', 'provisional', 'suspect')),
  superseded_by_id    uuid references pipeline.grid_capacity_components (id) on delete restrict
                        deferrable initially deferred,
  superseded_at       timestamptz,
  supersession_reason text,
  created_at          timestamptz not null default now(),

  constraint grid_capacity_components_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint grid_capacity_components_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id),
  -- This table holds what a publisher said. An Urdais conclusion belongs in
  -- pipeline.deliverable_capacity_results and nowhere else.
  constraint grid_capacity_components_are_source_published
    check (quantity_kind <> 'derived_quantity'),
  -- A network limit belongs in the shared constraint layer, so that Transmission Headroom can
  -- read the same row instead of a second copy of it.
  constraint grid_capacity_components_are_not_constraints
    check (quantity_kind <> 'constraint'),
  -- A seasonal period names its season; a period with explicit dates orders them.
  constraint grid_capacity_components_seasonal_names_a_season
    check (period_basis <> 'seasonal' or target_season is not null),
  constraint grid_capacity_components_period_dates_ordered
    check (period_start is null or period_end is null or period_end >= period_start),
  -- An interface-scoped quantity is a transfer across a boundary; a locality-scoped one is not.
  constraint grid_capacity_components_interface_is_a_transfer
    check (grid_interface_id is null
           or component_kind in ('import_capability', 'export_capability', 'transfer_capability'))
);

comment on table pipeline.grid_capacity_components is
  'Normalized quantities exactly as a publisher stated them. quantity_kind is mandatory and has no default because the difference between a capability and a requirement is the difference between a supply figure and an obligation, and no default could be right for both.';

create unique index grid_capacity_components_current_idx
  on pipeline.grid_capacity_components
  (scenario_id, grid_area_id, grid_subarea_id, grid_interface_id, quantity_kind, component_kind,
   period_basis, target_year, target_season, unit, capacity_basis)
  nulls not distinct
  where superseded_by_id is null;
create index grid_capacity_components_lookup_idx
  on pipeline.grid_capacity_components (grid_area_id, target_year, quantity_kind);

-- A component belongs to its scenario's vintage and to that vintage's market, and a locality it
-- names must sit inside that market.
create or replace function pipeline.check_grid_capacity_component_lineage()
returns trigger language plpgsql as $$
declare scenario record; vintage record; owner uuid;
begin
  select vintage_id into scenario from pipeline.grid_capacity_scenarios where id = new.scenario_id;
  if scenario.vintage_id <> new.vintage_id then
    raise exception 'capacity component scenario % belongs to vintage %, not %',
      new.scenario_id, scenario.vintage_id, new.vintage_id using errcode = 'check_violation';
  end if;
  select grid_area_id into vintage from pipeline.grid_capacity_vintages where id = new.vintage_id;
  if vintage.grid_area_id <> new.grid_area_id then
    raise exception 'capacity component market % disagrees with its vintage %',
      new.grid_area_id, new.vintage_id using errcode = 'check_violation';
  end if;
  if new.grid_subarea_id is not null then
    select grid_area_id into owner from reference.grid_subareas where id = new.grid_subarea_id;
    if owner is distinct from new.grid_area_id then
      raise exception 'locality % is not inside market %', new.grid_subarea_id, new.grid_area_id
        using errcode = 'check_violation';
    end if;
  end if;
  if new.grid_interface_id is not null then
    select grid_area_id into owner from reference.grid_interfaces where id = new.grid_interface_id;
    if owner is distinct from new.grid_area_id then
      raise exception 'interface % is not inside market %', new.grid_interface_id, new.grid_area_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger grid_capacity_components_lineage_check
  before insert on pipeline.grid_capacity_components
  for each row execute function pipeline.check_grid_capacity_component_lineage();
create trigger grid_capacity_components_supersede_only
  before update or delete on pipeline.grid_capacity_components
  for each row execute function pipeline.allow_only_supersession();

-- ------------------------------------------------- shared network constraints (PD-4 + Headroom)

create table pipeline.grid_constraint_values (
  id                  uuid primary key default gen_random_uuid(),
  vintage_id          uuid not null references pipeline.grid_capacity_vintages (id) on delete restrict,
  scenario_id         uuid not null references pipeline.grid_capacity_scenarios (id) on delete restrict,
  grid_area_id        uuid not null references reference.grid_areas (id) on delete restrict,
  grid_interface_id   uuid not null references reference.grid_interfaces (id) on delete restrict,
  grid_subarea_id     uuid references reference.grid_subareas (id) on delete restrict,
  raw_record_id       uuid not null references pipeline.raw_grid_capacity_records (id) on delete restrict,

  -- Fixed. A row in this table is a network limit and nothing else; the column exists so that a
  -- reader joining across layers never has to ask which kind of quantity it is holding.
  quantity_kind       text not null default 'constraint'
                        references reference.capacity_quantity_kinds (code) on delete restrict
                        constraint grid_constraint_values_are_constraints check (quantity_kind = 'constraint'),
  constraint_kind     text not null
                        constraint grid_constraint_values_kind_allowed
                        check (constraint_kind in ('cetl', 'cil', 'cel', 'mic', 'mcl', 'tsl',
                                                   'import_limit', 'export_limit', 'other')),
  direction           text not null
                        constraint grid_constraint_values_direction_allowed
                        check (direction in ('import', 'export', 'bidirectional')),
  source_term         text not null
                        constraint grid_constraint_values_term_nonempty check (btrim(source_term) <> ''),

  period_basis        text not null
                        constraint grid_constraint_values_period_basis_allowed
                        check (period_basis in ('calendar', 'delivery_year', 'capability_year',
                                                'capacity_commitment_period', 'planning_year', 'seasonal')),
  target_year         integer not null
                        constraint grid_constraint_values_year_range check (target_year between 1990 and 2200),
  target_season       text
                        constraint grid_constraint_values_season_allowed
                        check (target_season in ('winter', 'spring', 'summer', 'fall')),
  period_start        date,
  period_end          date,

  value               numeric not null constraint grid_constraint_values_value_finite check (value <> 'NaN'::numeric),
  unit                text not null constraint grid_constraint_values_unit_allowed check (unit in ('MW', 'GW')),

  quality_status      text not null default 'provisional'
                        constraint grid_constraint_values_quality_allowed
                        check (quality_status in ('accepted', 'provisional', 'suspect')),
  superseded_by_id    uuid references pipeline.grid_constraint_values (id) on delete restrict
                        deferrable initially deferred,
  superseded_at       timestamptz,
  supersession_reason text,
  created_at          timestamptz not null default now(),
  constraint grid_constraint_values_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint grid_constraint_values_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id),
  constraint grid_constraint_values_seasonal_names_a_season
    check (period_basis <> 'seasonal' or target_season is not null),
  constraint grid_constraint_values_period_dates_ordered
    check (period_start is null or period_end is null or period_end >= period_start)
);

comment on table pipeline.grid_constraint_values is
  'Network limits as their publisher stated them: CETL, CIL, CEL, MIC, MCL, TSL, interface limits. Deliberately its own layer rather than a component kind, so Deliverable Capacity and the future Transmission Headroom section read the same canonical rows and neither keeps a private copy.';

create unique index grid_constraint_values_current_idx
  on pipeline.grid_constraint_values
  (scenario_id, grid_interface_id, grid_subarea_id, constraint_kind, direction,
   period_basis, target_year, target_season, unit)
  nulls not distinct
  where superseded_by_id is null;
create index grid_constraint_values_interface_idx
  on pipeline.grid_constraint_values (grid_interface_id, target_year, constraint_kind);

create or replace function pipeline.check_grid_constraint_lineage()
returns trigger language plpgsql as $$
declare scenario record; vintage record; owner uuid;
begin
  select vintage_id into scenario from pipeline.grid_capacity_scenarios where id = new.scenario_id;
  if scenario.vintage_id <> new.vintage_id then
    raise exception 'constraint scenario % belongs to vintage %, not %',
      new.scenario_id, scenario.vintage_id, new.vintage_id using errcode = 'check_violation';
  end if;
  select grid_area_id into vintage from pipeline.grid_capacity_vintages where id = new.vintage_id;
  if vintage.grid_area_id <> new.grid_area_id then
    raise exception 'constraint market % disagrees with its vintage %', new.grid_area_id, new.vintage_id
      using errcode = 'check_violation';
  end if;
  select grid_area_id into owner from reference.grid_interfaces where id = new.grid_interface_id;
  if owner is distinct from new.grid_area_id then
    raise exception 'interface % is not inside market %', new.grid_interface_id, new.grid_area_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger grid_constraint_values_lineage_check
  before insert on pipeline.grid_constraint_values
  for each row execute function pipeline.check_grid_constraint_lineage();
create trigger grid_constraint_values_supersede_only
  before update or delete on pipeline.grid_constraint_values
  for each row execute function pipeline.allow_only_supersession();

-- ------------------------------------------------------------- Urdais-derived results

create table pipeline.deliverable_capacity_results (
  id                      uuid primary key default gen_random_uuid(),
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  grid_area_id            uuid not null references reference.grid_areas (id) on delete restrict,
  grid_subarea_id         uuid references reference.grid_subareas (id) on delete restrict,
  -- The publisher case this result was computed against, where it was computed against one.
  scenario_id             uuid references pipeline.grid_capacity_scenarios (id) on delete restrict,

  quantity_kind           text not null default 'derived_quantity'
                            references reference.capacity_quantity_kinds (code) on delete restrict
                            constraint deliverable_capacity_results_are_derived check (quantity_kind = 'derived_quantity'),

  period_basis            text not null
                            constraint deliverable_capacity_results_period_basis_allowed
                            check (period_basis in ('calendar', 'delivery_year', 'capability_year',
                                                    'capacity_commitment_period', 'planning_year', 'seasonal')),
  target_year             integer not null
                            constraint deliverable_capacity_results_year_range check (target_year between 1990 and 2200),
  target_season           text
                            constraint deliverable_capacity_results_season_allowed
                            check (target_season in ('winter', 'spring', 'summer', 'fall')),
  period_start            date,
  period_end              date,

  value                   numeric not null
                            constraint deliverable_capacity_results_value_finite check (value <> 'NaN'::numeric),
  unit                    text not null
                            constraint deliverable_capacity_results_unit_allowed check (unit in ('MW', 'GW')),
  capacity_basis          text not null references reference.capacity_bases (code) on delete restrict,

  calculation_status      text not null
                            constraint deliverable_capacity_results_calculation_status_allowed
                            check (calculation_status in ('draft', 'validated', 'failed')),
  publication_state       text not null default 'internal_only'
                            constraint deliverable_capacity_results_publication_state_allowed
                            check (publication_state in ('internal_only', 'publication_candidate', 'published', 'withdrawn')),
  calculation_notes       text,
  superseded_by_id        uuid references pipeline.deliverable_capacity_results (id) on delete restrict
                            deferrable initially deferred,
  superseded_at           timestamptz,
  supersession_reason     text,
  created_at              timestamptz not null default now(),
  constraint deliverable_capacity_results_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  ),
  constraint deliverable_capacity_results_not_self_superseding
    check (superseded_by_id is null or superseded_by_id <> id),
  constraint deliverable_capacity_results_seasonal_names_a_season
    check (period_basis <> 'seasonal' or target_season is not null),
  -- Only a validated calculation may be offered for publication.
  constraint deliverable_capacity_results_publication_requires_validation
    check (publication_state in ('internal_only', 'withdrawn') or calculation_status = 'validated')
);

comment on table pipeline.deliverable_capacity_results is
  'What Urdais concluded, never what a publisher said. Every row names the methodology version that produced it, and pipeline.deliverable_capacity_result_inputs freezes the exact rows it was computed from.';

create unique index deliverable_capacity_results_current_idx
  on pipeline.deliverable_capacity_results
  (methodology_version_id, grid_area_id, grid_subarea_id, scenario_id,
   period_basis, target_year, target_season, unit, capacity_basis)
  nulls not distinct
  where superseded_by_id is null;

-- A draft methodology cannot produce a published number. methodology_versions already forbids a
-- draft carrying an effective date; this is the same rule applied to the result.
create or replace function pipeline.check_deliverable_capacity_publication()
returns trigger language plpgsql as $$
declare status text; owner uuid;
begin
  if new.publication_state in ('publication_candidate', 'published') then
    select mv.status into status from reference.methodology_versions mv where mv.id = new.methodology_version_id;
    if status <> 'approved' then
      raise exception 'a deliverable capacity result under a % methodology version may not be published', status
        using errcode = 'check_violation';
    end if;
  end if;
  if new.grid_subarea_id is not null then
    select grid_area_id into owner from reference.grid_subareas where id = new.grid_subarea_id;
    if owner is distinct from new.grid_area_id then
      raise exception 'locality % is not inside market %', new.grid_subarea_id, new.grid_area_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger deliverable_capacity_results_publication_check
  before insert or update on pipeline.deliverable_capacity_results
  for each row execute function pipeline.check_deliverable_capacity_publication();

-- Exactly which rows produced the number. Append-only: a published result must stay reproducible
-- from frozen row ids, never from whatever happens to be current at read time.
create table pipeline.deliverable_capacity_result_inputs (
  id            uuid primary key default gen_random_uuid(),
  result_id     uuid not null references pipeline.deliverable_capacity_results (id) on delete restrict,
  input_kind    text not null
                  constraint deliverable_capacity_inputs_kind_allowed check (input_kind in ('component', 'constraint')),
  component_id  uuid references pipeline.grid_capacity_components (id) on delete restrict,
  constraint_id uuid references pipeline.grid_constraint_values (id) on delete restrict,
  -- The part this input played, in the methodology's own words.
  input_role    text not null
                  constraint deliverable_capacity_inputs_role_nonempty check (btrim(input_role) <> ''),
  created_at    timestamptz not null default now(),
  constraint deliverable_capacity_inputs_one_reference check (
    (input_kind = 'component' and component_id is not null and constraint_id is null) or
    (input_kind = 'constraint' and constraint_id is not null and component_id is null)
  ),
  unique (result_id, component_id, constraint_id)
);

comment on table pipeline.deliverable_capacity_result_inputs is
  'The frozen input set behind one derived result. A published value must be reconstructible from these row ids and its approved methodology version alone.';

create index deliverable_capacity_inputs_result_idx on pipeline.deliverable_capacity_result_inputs (result_id);
create trigger deliverable_capacity_result_inputs_append_only
  before update or delete on pipeline.deliverable_capacity_result_inputs
  for each row execute function pipeline.forbid_mutation();

-- ------------------------------------------------------------------------ rights purposes

insert into reference.source_use_purposes (code, display_name, is_public, description) values
  ('grid_capacity_calculation', 'Grid capacity calculation', false,
   'Retained capacity values may be used to calculate an Urdais deliverable-capacity result.'),
  ('public_raw_grid_capacity_value_display', 'Public display of source capacity values', true,
   'The publisher''s own capacity, requirement or constraint numbers may be shown publicly, attributed to the publisher.'),
  ('public_derived_deliverable_capacity_display', 'Public display of derived deliverable capacity', true,
   'A deliverable-capacity value Urdais derived may be shown publicly.'),
  ('public_derived_delivery_gap_display', 'Public display of a derived delivery gap', true,
   'A delivery gap Urdais derived from demand and deliverable capacity may be shown publicly.');

-- --------------------------------------------------------------------- methodology shell

insert into reference.methodologies (id, slug, name, document_path) values
  ('97000000-0000-4000-8000-000000000001', 'deliverable-capacity',
   'Urdais Deliverable Capacity', 'docs/methodology/deliverable-capacity.md');

-- A draft, deliberately. PD-4A concluded that no universal cross-market formula is defensible,
-- so the market equations are not encoded here and nothing may publish under this version.
insert into reference.methodology_versions (id, methodology_id, version, status, document_path, content_hash) values
  ('97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001',
   '0.1.0-draft', 'draft', 'docs/methodology/deliverable-capacity.md',
   'b7494482332d6ecd9210555287ec245a593df02d4629e02ebdafbee9482e1fae');

revoke update, delete, truncate on
  pipeline.grid_capacity_vintages, pipeline.grid_capacity_scenarios,
  pipeline.raw_grid_capacity_records, pipeline.grid_capacity_components,
  pipeline.grid_constraint_values, pipeline.deliverable_capacity_results,
  pipeline.deliverable_capacity_result_inputs
from service_role;

alter table reference.capacity_quantity_kinds              enable row level security;
alter table reference.capacity_component_kinds             enable row level security;
alter table reference.capacity_bases                       enable row level security;
alter table reference.grid_subareas                        enable row level security;
alter table reference.grid_interfaces                      enable row level security;
alter table pipeline.grid_capacity_vintages                enable row level security;
alter table pipeline.grid_capacity_scenarios               enable row level security;
alter table pipeline.raw_grid_capacity_records             enable row level security;
alter table pipeline.grid_capacity_components              enable row level security;
alter table pipeline.grid_constraint_values                enable row level security;
alter table pipeline.deliverable_capacity_results          enable row level security;
alter table pipeline.deliverable_capacity_result_inputs    enable row level security;

do $$
declare n integer;
begin
  select count(*) into n from reference.capacity_quantity_kinds;
  if n <> 6 then raise exception 'expected six quantity kinds, found %', n; end if;
  select count(*) into n from reference.source_use_purposes where is_public;
  if n <> 5 then raise exception 'expected five public use purposes after PD-4B, found %', n; end if;
  -- The GPU compute domain is untouched and must stay a different set of tables.
  if to_regclass('pipeline.capacity_observations') is null then
    raise exception 'the compute capacity domain vanished; this migration should not have touched it';
  end if;
  select count(*) into n from reference.grid_areas;
  if n <> 7 then raise exception 'PD-4B changed the seven-market grid area set: %', n; end if;
end $$;
