-- UMPI Phase 5: the derivation layer's storage.
--
-- Phase 3 created `pipeline.umpi_index_bases` and `pipeline.umpi_publications` and left both
-- empty. Phase 5 fills them, and needs three things the original shapes did not carry.
--
--   1. **Which observations a base was computed from.** The base is Σ USD / Σ kg over twelve
--      months; a digest proves the inputs were the same, but it cannot say *which rows* they
--      were. Following the pattern of `deliverable_capacity_result_inputs` and
--      `delivery_gap_result_inputs`, the link is its own table.
--
--   2. **A publication's own inputs digest and calculation version.** Reproducibility means the
--      same inputs under the same code produce the same row, and a rerun must be able to tell
--      that without recomputing from scratch.
--
--   3. **Room for a recalculation.** The original unique key was
--      `(series_id, reference_month, source_vintage_ordinal)`. That is wrong for Series B: if a
--      2020 month is revised the base changes and every derived level changes, while the source
--      vintage of the *published* month has not moved at all. The identity of a publication is
--      therefore its inputs, not the vintage of one of them.
--
-- No new run table. A derivation reads current observations and writes publications; it has no
-- retrieval, no date range to request and no source to page. `pipeline.umpi_ingestion_runs`
-- describes a retrieval and could not hold one honestly, and a second run table carrying two
-- fields would be ceremony. The lineage a recalculation needs — inputs digest, calculation
-- version, base, observation, methodology version — lives on the publication row itself.

-- ------------------------------------------------------------------- base input provenance

create table pipeline.umpi_index_base_inputs (
  id              uuid primary key default gen_random_uuid(),
  index_base_id   uuid not null references pipeline.umpi_index_bases (id) on delete restrict,
  observation_id  uuid not null references pipeline.umpi_observations (id) on delete restrict,
  reference_month date not null
                    constraint umpi_base_inputs_reference_is_month check (extract(day from reference_month) = 1),
  -- The figures as they stood when the base was computed. Stored rather than re-read, so a
  -- later revision of the observation cannot silently change what the base was built from.
  export_value_usd numeric(20, 2) not null
                    constraint umpi_base_inputs_value_nonneg check (export_value_usd >= 0),
  export_weight_kg numeric(20, 3) not null
                    constraint umpi_base_inputs_weight_positive check (export_weight_kg > 0),
  created_at      timestamptz not null default now(),
  -- One row per month per base, and one contribution per observation.
  unique (index_base_id, reference_month),
  unique (index_base_id, observation_id)
);

comment on table pipeline.umpi_index_base_inputs is
  'The observations a rebasing base was computed from, with their figures frozen at computation time. A base is auditable to the row, not only to a digest.';

create index umpi_index_base_inputs_base_idx on pipeline.umpi_index_base_inputs (index_base_id, reference_month);
create index umpi_index_base_inputs_observation_idx on pipeline.umpi_index_base_inputs (observation_id);

-- ------------------------------------------------------------------ publication provenance

alter table pipeline.umpi_publications
  -- Which implementation produced the number. A formula change that leaves the inputs alone is
  -- still a different calculation, and a published value has to be able to say which one.
  add column calculation_version text
    constraint umpi_publications_calculation_version_format
    check (calculation_version is null or calculation_version ~ '^[a-z0-9.\-]+$'),
  -- The deterministic digest of everything that produced this row. Two runs over identical
  -- inputs produce the same digest and therefore write nothing the second time.
  add column inputs_digest text
    constraint umpi_publications_inputs_digest_format
    check (inputs_digest is null or inputs_digest ~ '^[0-9a-f]{64}$'),
  -- The observation the month-over-month change was measured against, where one exists. A
  -- withheld change has none, which is itself part of the record.
  add column previous_observation_id uuid references pipeline.umpi_observations (id) on delete restrict;

comment on column pipeline.umpi_publications.inputs_digest is
  'Deterministic digest over the observation, the base, the comparison month, the methodology version and the calculation version. Identity of a publication is its inputs, never the clock.';
comment on column pipeline.umpi_publications.previous_observation_id is
  'The observation the MoM was computed against. Null where the change was withheld, which the reason column explains.';

-- A publication's identity is its inputs. The vintage-keyed uniqueness could not express a
-- recalculation caused by a *base* change, where the published month's own source vintage has
-- not moved.
alter table pipeline.umpi_publications
  drop constraint umpi_publications_series_id_reference_month_source_vintage__key;

create unique index umpi_publications_inputs_idx
  on pipeline.umpi_publications (series_id, reference_month, inputs_digest)
  where inputs_digest is not null;

-- At most one live publication per series and month. A recalculation supersedes; it does not
-- accumulate alongside.
create unique index umpi_publications_one_live_idx
  on pipeline.umpi_publications (series_id, reference_month)
  where superseded_by_id is null;

-- A withheld change names no comparison month, and a computed one must.
alter table pipeline.umpi_publications
  add constraint umpi_publications_comparison_matches_change
    check ((mom_change is null) = (previous_observation_id is null));

-- ----------------------------------------------------------------------------- privileges

revoke update, delete, truncate on pipeline.umpi_index_base_inputs from service_role;
alter table pipeline.umpi_index_base_inputs enable row level security;

-- ------------------------------------------------------------------------------ assertions

do $$
declare n integer;
begin
  -- Phase 5 creates the structures and no rows; the derivation writes them.
  select count(*) into n from pipeline.umpi_index_base_inputs;
  if n <> 0 then raise exception 'this migration must not create base inputs'; end if;
  select count(*) into n from pipeline.umpi_publications;
  if n <> 0 then raise exception 'this migration must not create publications'; end if;

  -- The methodology is still a draft, and stays one. Internal records may be written under it;
  -- public exposure may not, and that gate belongs to a later phase.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and (mv.status <> 'draft' or mv.effective_from is not null);
  if n <> 0 then raise exception 'the UMPI methodology is no longer an undated draft'; end if;
end $$;
