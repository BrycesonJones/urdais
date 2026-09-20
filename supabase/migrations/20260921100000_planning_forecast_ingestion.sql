-- PD-3C: what ingesting real planning artifacts turned out to require.
--
-- PD-3B built the planning domain against the shape of the sources as the research described
-- them. Retrieving the actual workbooks produced four corrections, and each is here because the
-- alternative was to distort a publisher's own data to fit a schema:
--
--   1. Monthly is a native planning grain. ERCOT publishes monthly peak demand and monthly
--      energy for the whole forecast horizon, PJM publishes monthly peak and energy per zone
--      and for the RTO, and the CEC publishes monthly peaks. Without a monthly grain the only
--      ways to store those are to aggregate them (inventing an annual peak the publisher did
--      not state) or to drop them. Both are worse than adding the grain.
--
--   2. Artifacts arrive inside archives. The CEC serves its forecast forms as ZIP containers,
--      and a locator that names a cell without naming the archive member it was in does not
--      identify the cell.
--
--   3. Production collection needs a state the registry did not have. The registry gates
--      production on a terms review that concluded `permitted`, which is right, and which the
--      four ambiguous sources will never satisfy -- that is what ambiguous means. The Urdais
--      policy nonetheless authorises collecting and publishing them under accepted risk, so the
--      registry gains a state that says exactly that and no more. It is not `permitted`, it
--      does not touch `terms_review_state`, and it changes no rights classification.
--
--   4. A production retrieval must cite a permission basis. PD-3B recorded planning rights in
--      reference.source_use_permissions, which pipeline.source_retrievals does not reference.
--      The five collectable sources get a permission_grants row, and the source-use rows are
--      tied to it so the two cannot drift apart.

-- ------------------------------------------------------------------------ 1. monthly grain

alter table pipeline.planning_forecast_points
  add column target_month smallint
    constraint planning_points_month_range check (target_month is null or target_month between 1 and 12);

comment on column pipeline.planning_forecast_points.target_month is
  'Calendar month for a monthly planning point, as the publisher numbered it. Null at every other grain.';

alter table pipeline.planning_forecast_points
  drop constraint planning_points_period_kind_allowed,
  add constraint planning_points_period_kind_allowed
    check (target_period_kind in ('annual', 'seasonal', 'monthly', 'hourly_profile'));

alter table pipeline.planning_forecast_points
  drop constraint planning_points_grain_fields,
  add constraint planning_points_grain_fields check (
    case target_period_kind
      when 'annual'         then target_season is null and target_month is null and target_timestamp is null
      when 'seasonal'       then target_season is not null and target_month is null and target_timestamp is null
      when 'monthly'        then target_month is not null and target_season is null and target_timestamp is null
      when 'hourly_profile' then target_timestamp is not null and target_month is null
      else false
    end
  );

drop index pipeline.planning_forecast_points_current_idx;
create unique index planning_forecast_points_current_idx
  on pipeline.planning_forecast_points
  (scenario_id, geographic_grain, native_geography_label, target_period_kind, target_year,
   target_season, target_month, target_timestamp, peak_type, unit)
  nulls not distinct
  where superseded_by_id is null;

-- Peak and energy are published for the same market, scenario and period, and are distinguished
-- by peak_type and unit. Both are already in the identity above; this states why unit is there.
comment on index pipeline.planning_forecast_points_current_idx is
  'One live value per scenario, geography, period and measure. Unit participates because a publisher states monthly peak MW and monthly energy GWh for the same month, and they are different measures rather than a restatement of one another.';

-- Energy is published at the same grains as peaks. The PD-3B vocabulary had only
-- `annual_energy`, which forced a monthly energy figure to claim it was annual; `period_energy`
-- lets a monthly or seasonal energy value say what it is.
alter table pipeline.planning_forecast_points
  drop constraint planning_points_peak_type_allowed,
  add constraint planning_points_peak_type_allowed
    check (peak_type in ('coincident_peak', 'non_coincident_peak', 'hourly_load',
                         'annual_energy', 'period_energy', 'average_load', 'unspecified'));

alter table pipeline.planning_forecast_points
  drop constraint planning_points_energy_unit_matches_peak_type,
  add constraint planning_points_energy_unit_matches_peak_type
    check ((peak_type in ('annual_energy', 'period_energy')) = (unit in ('MWh', 'GWh')));

-- ---------------------------------------------------------------- 2. archive provenance

alter table pipeline.raw_planning_forecast_records
  add column archive_ref         text,
  add column archive_member      text,
  add column archive_member_hash text
    constraint raw_planning_records_archive_hash_format
    check (archive_member_hash is null or archive_member_hash ~ '^[0-9a-f]{64}$'),
  -- Naming a member without naming the archive it came from is not a locator.
  add constraint raw_planning_records_archive_member_needs_archive
    check (archive_member is null or archive_ref is not null),
  add constraint raw_planning_records_archive_hash_needs_member
    check (archive_member_hash is null or archive_member is not null);

comment on column pipeline.raw_planning_forecast_records.archive_ref is
  'The container the extracted artifact came in, where the publisher ships one: a ZIP, or the XLSX package itself.';
comment on column pipeline.raw_planning_forecast_records.archive_member is
  'The member path inside that container, for example xl/worksheets/sheet2.xml or a ZIP entry name.';

-- ------------------------------------------------- 3. production collection under accepted risk

alter table reference.source_interfaces
  drop constraint source_interfaces_production_state_allowed,
  add constraint source_interfaces_production_state_allowed check (production_access_state in (
    'research_usable',
    'production_review_pending',
    'production_approved',
    -- Collection and publication authorised by Urdais policy while the terms review remains
    -- open. Strictly weaker than production_approved and never a substitute for it.
    'production_approved_under_accepted_risk',
    'production_blocked'
  ));

-- The accepted-risk state is only available while a review is genuinely open. A source whose
-- terms were reviewed and found prohibitive cannot be collected under it.
alter table reference.source_interfaces
  add constraint source_interfaces_accepted_risk_requires_open_review
    check (production_access_state <> 'production_approved_under_accepted_risk'
           or (terms_review_state = 'under_review' and data_use_terms_state <> 'not_permitted'));

comment on column reference.source_interfaces.production_access_state is
  'How production collection stands. production_approved means the terms review concluded permitted. production_approved_under_accepted_risk means Urdais authorised collection under its founder-accepted-risk policy while the review is still open; it asserts nothing about the terms and never edits terms_review_state.';

-- Extends the definition news ingestion last left, adding two things and changing nothing else:
-- the use a planning interface is read for, and the accepted-risk approval state.
create or replace function pipeline.check_retrieval_permission()
returns trigger
language plpgsql
as $$
declare
  g record;
  iface record;
  needed boolean;
begin
  select source_class into iface from reference.source_interfaces where id = new.source_interface_id;

  if new.permission_grant_id is not null then
    select source_interface_id, effective_from, effective_to, covers_collection, covers_index_use,
           covers_content_syndication, covers_internal_use
      into g
      from reference.permission_grants where id = new.permission_grant_id;
    if g.source_interface_id <> new.source_interface_id then
      raise exception 'permission grant % belongs to a different source interface', new.permission_grant_id
        using errcode = 'check_violation';
    end if;
    if new.requested_at < g.effective_from or (g.effective_to is not null and new.requested_at >= g.effective_to) then
      raise exception 'permission grant % was not in force at %', new.permission_grant_id, new.requested_at
        using errcode = 'check_violation';
    end if;
    if new.retrieval_purpose <> 'research' then
      -- The use the grant has to cover is the use this source class is read for. A planning
      -- forecast is not an index input and never will be, so demanding covers_index_use of it
      -- would be demanding the wrong right; what it is read for is retention and analysis.
      needed := case
        when iface.source_class = 'news_feed' then g.covers_collection and g.covers_content_syndication
        when iface.source_class = 'power_system_planning_forecast' then g.covers_collection and g.covers_internal_use
        else g.covers_collection and g.covers_index_use
      end;
      if not needed then
        raise exception 'permission grant % does not cover collection and the use a % interface is read for',
          new.permission_grant_id, iface.source_class
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.retrieval_purpose in ('production', 'validation') then
    if new.acquisition_mode is distinct from 'manual_verified' then
      select production_access_state, terms_review_state, data_use_terms_state into iface
        from reference.source_interfaces where id = new.source_interface_id;
      if iface.production_access_state not in ('production_approved', 'production_approved_under_accepted_risk') then
        raise exception '% retrieval from a source interface that is % (terms %, data use %)',
          new.retrieval_purpose, iface.production_access_state, iface.terms_review_state, iface.data_use_terms_state
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_retrieval_permission() is
  'Trigger: a retrieval''s permission grant must belong to its interface, be in force at request time, and cover the use its source class is read for; a production or validation retrieval requires an interface approved outright or under the accepted-risk policy, unless it is a manually verified reading. The database still refuses production collection from a blocked or unreviewed source.';

-- ------------------------------------------- 4. a permission basis the retrieval table can cite

-- A grant cited by a source-use determination must belong to that determination's interface.
-- Enforced by trigger because a CHECK constraint cannot join.
create or replace function reference.check_source_use_permission_grant()
returns trigger language plpgsql as $$
declare owner uuid;
begin
  if new.permission_grant_id is null then return new; end if;
  select source_interface_id into owner from reference.permission_grants where id = new.permission_grant_id;
  if owner is distinct from new.source_interface_id then
    raise exception 'permission grant % belongs to a different source interface', new.permission_grant_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger source_use_permissions_grant_check
  before insert or update on reference.source_use_permissions
  for each row execute function reference.check_source_use_permission_grant();

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
   covers_internal_use, covers_index_calculation, covers_storage, covers_historical_retention,
   covers_historical_reconstruction, rights_layer, attribution_required, attribution_text,
   effective_from, evidence, reviewed_by, reviewed_on)
select v.id, s.id, 'provider_terms', v.reference,
       true, false, true, false, true, true, true,
       'publisher', true, sup.attribution_text,
       timestamptz '2026-09-19T00:00:00Z', v.evidence, 'Urdais research', date '2026-09-19'
from (values
  ('94000000-0000-4000-8200-000000000001'::uuid, 'ercot-long-term-load-forecast',
   'ERCOT Terms of Use section 5, reviewed 2026-09-19.',
   'ERCOT permits raw public data to be used, reproduced and redistributed in compilations, charts and analyses. Collection and publication proceed on that grant, with credit.'),
  ('94000000-0000-4000-8200-000000000002'::uuid, 'pjm-load-forecast-report',
   'pjm.com website terms, reviewed 2026-09-19; no reuse grant established.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy recorded in reference.source_use_permissions, which leaves the ambiguous_requires_legal_review classification in force.'),
  ('94000000-0000-4000-8200-000000000003'::uuid, 'cec-california-energy-demand-forecast',
   'CEC Conditions of Use, reviewed 2026-09-19; commercial-use sentence unresolved.',
   'The public-use paragraph and the commercial-use prohibition have not been reconciled. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.'),
  ('94000000-0000-4000-8200-000000000004'::uuid, 'nyiso-gold-book',
   'NYISO legal notice, reviewed 2026-09-19; no licence conferred.',
   'Access confers no licence and the notice is silent on republication of Gold Book values. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.'),
  ('94000000-0000-4000-8200-000000000005'::uuid, 'iso-ne-celt-report',
   'ISO-NE legal and privacy terms, reviewed 2026-09-19; copyright asserted.',
   'Site content is copyrighted and non-personal duplication is warned against. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.')
) as v(id, slug, reference, evidence)
join reference.source_interfaces s on s.slug = v.slug
join lateral (
  select attribution_text from reference.source_use_permissions
   where source_interface_id = s.id and purpose_code = 'public_raw_planning_value_display'
   limit 1
) sup on true
on conflict (id) do nothing;

update reference.source_use_permissions sup
   set permission_grant_id = g.id
  from reference.permission_grants g
 where g.source_interface_id = sup.source_interface_id
   and sup.permission_grant_id is null
   and g.id::text like '94000000-0000-4000-8200-%';

-- ERCOT's terms were reviewed and found permissive, so it is approved outright. The four
-- ambiguous sources are approved under the accepted-risk policy and their terms stay under
-- review. SPP and MISO are untouched and remain blocked.
update reference.source_interfaces
   set production_access_state = 'production_approved'
 where slug = 'ercot-long-term-load-forecast';
update reference.source_interfaces
   set production_access_state = 'production_approved_under_accepted_risk'
 where slug in ('pjm-load-forecast-report', 'cec-california-energy-demand-forecast',
                'nyiso-gold-book', 'iso-ne-celt-report');

do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces
   where slug in ('spp-resource-adequacy-report', 'miso-long-term-load-forecast')
     and production_access_state = 'production_blocked';
  if n <> 2 then raise exception 'PD-3C changed the SPP or MISO production state'; end if;

  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'power_system_planning_forecast'
     and sup.rights_classification = 'ambiguous_requires_legal_review';
  if n <> 16 then raise exception 'PD-3C changed an ambiguous rights classification; found % rows', n; end if;

  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved_under_accepted_risk'
     and terms_review_state <> 'under_review';
  if n <> 0 then raise exception 'an accepted-risk interface claims a concluded terms review'; end if;
end $$;
