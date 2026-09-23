-- Flexible Capacity FC-3: the analytical layer, and methodology 1.1.0.
--
-- FC-2 registered rules and created no tables. FC-3 adds the place calculated scenarios live, and
-- resolves the three parameters that were registered as unresolved because nobody had measured
-- them yet. Two of them turned out not to be inputs to this methodology at all; the third was
-- settled by a controlled experiment whose design and results are in
-- docs/research/flexible-capacity/fc3-gap-sensitivity.md.
--
-- Why a new methodology version rather than an edit. 1.0.0 is registered `approved`, and every
-- precedent in this repository supersedes an approved version rather than re-pointing its
-- content_hash -- UBWI 1.0.0 to 1.2.0, UTVI 1.0.0 to 1.1.0, open-weight 1.0.0 to 1.0.1,
-- map-facilities 1.0.0 to 2.1.0. Adding a validity rule changes which market-years may produce a
-- figure at all, which is a rule change and not a correction, so 1.1.0 is the honest place for it.
-- 1.0.0 published nothing during its life -- publication was blocked by its own unresolved
-- parameters -- so superseding it costs no published figure.
--
-- Nothing here holds hourly demand. Scenario results reference the canonical EIA-930 observations
-- Power Delivery already collects, by digest rather than by copy.

-- ================================================================ methodology 1.1.0

update reference.methodology_versions
   set status = 'superseded', effective_to = timestamptz '2026-09-23T00:00:00Z'
 where methodology_id = (select id from reference.methodologies where slug = 'flexible-capacity')
   and version = '1.0.0'
   and status = 'approved';

insert into reference.methodology_versions
  (methodology_id, version, status, document_path, content_hash, effective_from)
select m.id, '1.1.0', 'approved', 'docs/methodology/flexible-capacity.md',
       '6b902ec56f1314d64cb2130d4475c13e7dd45e93c887067cca9c2cd79420b21e',
       timestamptz '2026-09-23T00:00:00Z'
from reference.methodologies m where m.slug = 'flexible-capacity'
on conflict do nothing;

-- ---------------------------------------------------------------- approved parameters
--
-- Carried forward unchanged from 1.0.0 except where FC-3 resolved something. Registered against
-- the new version rather than moved, so the 1.0.0 record of what was believed at the time stays
-- readable.

insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, numeric_value, text_value, status,
   effective_from, approved_by, approved_on, rationale)
select mv.id, v.k, v.num, v.txt, 'approved', date '2026-09-23',
       'Urdais founder decision, Flexible Capacity 1.1.0 scenario contract', date '2026-09-23', v.why
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'flexible-capacity'
  cross join (values
    ('annual_curtailment_energy_fraction_default', 0.0050::numeric, null,
     'Alpha at the default scenario: the hypothetical new load''s annual curtailed energy as a fraction of its own annual energy. An energy allowance is the control rather than a count of hours because the number of hours is an output of the model, depending on the shape of the demand series. Unchanged from 1.0.0.'),
    ('annual_curtailment_energy_fraction_maximum', 0.05, null,
     'The largest alpha the methodology will evaluate. A guardrail on the model''s domain, not a claim that 5% is achievable. Unchanged from 1.0.0.'),
    ('annual_curtailment_energy_fraction_scenarios', null, '0.0025,0.0050,0.0100',
     'The published scenario set: 0.25%, 0.50% and 1.00%, equal to 21.9, 43.8 and 87.6 equivalent full-load hours in a complete non-leap year. Urdais parameters recomputed from EIA-930, never reproductions of a published result. Unchanged from 1.0.0.'),
    ('battery_enabled', null, 'false',
     'Storage contributes nothing, as an approved decision rather than an omission. It is not additive with curtailable load -- both serve the same tight hours, so summing them counts the same headroom twice. There is no deployed-storage inventory in Urdais, and interconnection-queue batteries are proposals that cannot shift load. And storage needs power, energy, duration, round-trip efficiency, state of charge and recharge opportunity, none of which a flat-load energy budget can represent. Unchanged from 1.0.0.'),
    ('curtailment_dispatch_foresight', null, 'perfect_within_period',
     'The scenario curtails in exactly the hours required and no others, assuming perfect knowledge of the whole year. It is an upper bound on what dispatch could achieve. Unchanged from 1.0.0.'),
    ('market_scope', null, 'per_balancing_authority_no_aggregation',
     'Published per balancing authority, with no total of any kind. Each market sets its own peak reference from its own demand, and those references belong to different systems with different peak hours and seasons. Unchanged from 1.0.0.'),
    ('minimum_annual_coverage', 0.995, null,
     'A market-year below 99.5% hourly coverage is refused rather than modelled. Calibrated against measured history: three complete years across seven markets are at or near 100%. It bounds quantity; maximum_contiguous_gap_hours bounds shape. Unchanged from 1.0.0.'),
    ('missing_hour_treatment', null, 'excluded_no_interpolation',
     'Missing hours are excluded from the series and from T, never interpolated or carried forward. The answer is decided by the top of the load distribution, so an invented value near the top would change the result while being indistinguishable from evidence. Unchanged from 1.0.0.'),
    ('modeled_load_shape', null, 'flat',
     'The hypothetical additional load is the same in every hour. A flat shape assumes nothing about what the new load is for. Unchanged from 1.0.0.'),
    ('peak_reference_rule', null, 'modeled_period_observed_peak',
     'Peak_ref is the modelled period''s own maximum observed hourly actual demand, ties to the earliest hour. It keeps every headroom gap non-negative, so the scenario only ever curtails the new load rather than being asked to resolve a baseline exceedance it did not cause, and it needs one complete year rather than two. Unchanged from 1.0.0.'),
    ('peak_plausibility_max_over_p999', 1.5, null,
     'NEW IN 1.1.0. A market-year whose maximum exceeds the 99.9th percentile of its own hourly loads by more than this factor is ineligible. The rule exists because FC-3 found a case no coverage rule could catch: SPP published 3,621,097 MW for the hour beginning 2023-06-12T22:00Z, sixty-five times that market''s real annual peak of about 56 GW. That year is 100% complete, has no gaps at all, satisfies every other condition, and taken at face value produces 3,597 GW of headroom. Canonical evidence is never repaired, so the value stays exactly as the publisher sent it and the market-year is refused instead. The factor is measured rather than assumed: across the twenty genuine market-years the maximum sits between 1.008 and 1.063 times the 99.9th percentile, because a real annual peak is by definition near the top of its own distribution. 1.5 is seven times the widest genuine separation and forty-four times below the defect.'),
    ('peak_region_coverage_rule', null, 'local_calendar_day_of_observed_peak',
     'The local calendar day containing the observed maximum must be completely present, or the market-year is ineligible. Counted in instants, so a spring-forward peak day expects 23 hours and a fall-back day 25. Unchanged from 1.0.0, and NOT weakened by the new contiguous-gap rule: a one-hour gap is within any threshold and is still fatal on the peak day.'),
    ('rebound_model', null, 'no_rebound',
     'Curtailed energy is forgone, not deferred into a later hour. Unchanged from 1.0.0.'),
    ('solver_method', null, 'bisection_on_feasible_interval',
     'Delta-L* is found by bisection on [0, U], valid because feasibility is monotone: each R_t is non-decreasing, convex and piecewise linear in Delta-L and the budget is linear. The search returns the feasible end of the bracket. U is analytic: sum_t max(d_t, 0) / ((1 - alpha) * T). Unchanged from 1.0.0.'),
    ('solver_tolerance_mw', 0.000001, null,
     'Bisection stops at one microwatt or 100 iterations; reported megawatts are floored to six decimals so the published value stays feasible, and energy is recomputed at the reported headroom. Unchanged from 1.0.0.'),
    ('validation_market', null, 'ercot',
     'ERCOT is the first market validated: complete measured coverage across 2023-2025, a sharply defined summer peak, and a single-state interconnection whose demand series has no seam. Unchanged from 1.0.0.')
  ) as v(k, num, txt, why)
 where mv.version = '1.1.0'
on conflict do nothing;

-- ---------------------------------------------------------------- the three resolutions
--
-- These are what FC-3 existed to settle. Each is registered approved with the evidence or the
-- scope decision behind it, and none carries an invented number.

insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, numeric_value, text_value, status,
   effective_from, approved_by, approved_on, rationale)
select mv.id, v.k, v.num, v.txt, 'approved', date '2026-09-23',
       'Urdais founder decision, Flexible Capacity 1.1.0 publication-blocker resolution', date '2026-09-23', v.why
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'flexible-capacity'
  cross join (values
    ('maximum_contiguous_gap_hours', 1::numeric, null,
     'RESOLVED by measurement, not by choice. FC-3 ran controlled deletion experiments over three years and seven markets: take a complete market-year, delete a contiguous block of known length at the worst admissible position outside the protected peak day, and recompute. Two findings decide the value. First, observed gaps are bimodal: across fourteen complete market-years a gap is either a single isolated hour or a publisher outage of 22 to 25 hours, and nothing between 2 and 21 hours was ever seen, so every threshold in that interval admits exactly the same market-years. Second, distortion grows steeply with length -- worst-case overstatement of headroom is 3.19% at one hour, 6.20% at two, 13.01% at six and 14.11% at twenty-four, at the most sensitive published alpha of 0.25%. Since the whole interval [1, 21] costs nothing in coverage, the tightest bound wins. The distortion is one-sided: deleting a low-load hour only removes budget and lowers the answer, while deleting an hour that was carrying curtailment removes a constraint and raises it, and only the second direction is dangerous. It is also not monotone in length, because a long gap cannot be aimed and necessarily swallows a nightly trough, so a threshold of N bounds every length up to N rather than being a measurement taken at N. The residual 3.19% is a real limitation, reported on every result; for scale, the smallest year-over-year movement measured in headroom itself across these markets is 20.8%.'),
    ('demand_response_inventory', null, 'not_used_in_methodology_1_1_0',
     'RESOLVED as out of scope rather than as a value. Methodology 1.1.0 does not consume a demand-response inventory anywhere in its calculation: the model adds a hypothetical flat load to an observed demand series and asks what curtailment budget keeps it below the observed peak. No term reads demand response, so there is nothing for an inventory to supply and no figure that changes when one appears. It was registered unresolved in 1.0.0 because it is a plausible input to a *future* version, and that was the wrong status for a parameter this version does not read -- it blocked publication on the absence of something the methodology never asked for. The substantive warning it carried is preserved and is not weakened: some publishers already net demand response out of the demand they report. SPP defines Net Peak Demand as forecast peak less controllable and dispatchable demand response, and the Urdais ingestion for that source carries netPeakDemandExcludesDemandResponse on every record. Any future version that introduces a demand-response term must first establish, per publisher, whether the demand series it is added to already excludes it.'),
    ('deployed_storage_inventory', null, 'not_used_in_methodology_1_1_0',
     'RESOLVED as out of scope rather than as a value, for the same reason: battery_enabled is false, so no term in methodology 1.1.0 reads a storage inventory and no figure changes when one exists. Urdais still holds no deployed-storage figures for any market -- reference.capacity_component_kinds names storage_capability and it has no rows, and interconnection-queue batteries are proposals -- but that absence is a fact about a future version, not a gap in this one. A version that enables storage must model it against the residual peak with power, energy, duration, state of charge and recharge opportunity, and must not add a storage term to a curtailment term, because both serve the same tight hours.')
  ) as v(k, num, txt, why)
 where mv.version = '1.1.0'
on conflict do nothing;

-- ================================================================ analytics runs

create table pipeline.flexible_capacity_analytics_runs (
  id                       uuid primary key default gen_random_uuid(),
  methodology_version_id   uuid not null references reference.methodology_versions (id) on delete restrict,
  -- Carried beside the foreign key so a run's provenance survives being read without a join, and
  -- so a digest that later changed would be visible rather than silently followed.
  methodology_content_hash text not null
                             constraint fc_runs_hash_format check (methodology_content_hash ~ '^[0-9a-f]{64}$'),

  -- A research run may calculate under an unresolved parameter; only a production run may become
  -- the basis of a publication. The distinction is recorded, not inferred.
  run_kind                 text not null
                             constraint fc_runs_kind check (run_kind in ('production', 'research')),
  run_status               text not null
                             constraint fc_runs_status check (run_status in ('running', 'validated', 'failed')),

  markets                  text[] not null
                             constraint fc_runs_markets_present check (cardinality(markets) > 0),
  local_years              integer[] not null
                             constraint fc_runs_years_present check (cardinality(local_years) > 0),
  alpha_scenarios          numeric[] not null
                             constraint fc_runs_alphas_present check (cardinality(alpha_scenarios) > 0),

  scenarios_stored         integer not null default 0
                             constraint fc_runs_stored_nonneg check (scenarios_stored >= 0),
  scenarios_reused         integer not null default 0
                             constraint fc_runs_reused_nonneg check (scenarios_reused >= 0),
  market_years_skipped     jsonb not null default '[]'::jsonb
                             constraint fc_runs_skipped_array check (jsonb_typeof(market_years_skipped) = 'array'),

  started_at               timestamptz not null,
  completed_at             timestamptz,
  failed_phase             text
                             constraint fc_runs_phase check (failed_phase is null or failed_phase in
                               ('eligibility', 'methodology_guard', 'calculation', 'validation', 'persistence')),
  error_class              text,
  error_detail             text,
  created_at               timestamptz not null default now(),

  -- A failure must say where it happened; a success must not claim one. The phase is taken from
  -- where the failure occurred, never inferred from a message.
  constraint fc_runs_failure_names_phase
    check (run_status <> 'failed' or failed_phase is not null),
  constraint fc_runs_success_has_no_phase
    check (run_status = 'failed' or (failed_phase is null and error_class is null)),
  constraint fc_runs_finished_has_completion
    check (run_status = 'running' or completed_at is not null)
);

comment on table pipeline.flexible_capacity_analytics_runs is
  'One row per analytical invocation. Mutable, because a row is a lifecycle: it opens as running and closes validated or failed. The results it produces are not mutable.';

create index flexible_capacity_runs_recent_idx
  on pipeline.flexible_capacity_analytics_runs (run_kind, run_status, started_at desc);

-- ================================================================ scenario results

create table pipeline.flexible_capacity_scenario_results (
  id                             uuid primary key default gen_random_uuid(),
  run_id                         uuid not null references pipeline.flexible_capacity_analytics_runs (id) on delete restrict,
  grid_area_id                   uuid not null references reference.grid_areas (id) on delete restrict,
  methodology_version_id         uuid not null references reference.methodology_versions (id) on delete restrict,
  methodology_content_hash       text not null
                                   constraint fc_results_hash_format check (methodology_content_hash ~ '^[0-9a-f]{64}$'),

  local_year                     integer not null
                                   constraint fc_results_year_range check (local_year between 2015 and 2100),
  period_start                   timestamptz not null,
  period_end                     timestamptz not null,
  expected_observation_count     integer not null
                                   constraint fc_results_expected_positive check (expected_observation_count > 0),

  -- Identity. observations_digest is the evidence; input_digest is evidence + rules + alpha.
  observations_digest            text not null
                                   constraint fc_results_obs_digest_format check (observations_digest ~ '^[0-9a-f]{64}$'),
  input_digest                   text not null
                                   constraint fc_results_input_digest_format check (input_digest ~ '^[0-9a-f]{64}$'),

  -- ------------------------------------------------------------ observed
  peak_reference_mw              numeric not null
                                   constraint fc_results_peak_positive check (peak_reference_mw > 0),
  peak_reference_at              timestamptz not null,
  peak_region_local_date         date not null,
  peak_region_expected_hours     integer not null
                                   constraint fc_results_peak_day_hours check (peak_region_expected_hours between 23 and 25),
  peak_region_present_hours      integer not null,
  mean_load_mw                   numeric not null
                                   constraint fc_results_mean_positive check (mean_load_mw > 0),
  observation_count              integer not null
                                   constraint fc_results_obs_positive check (observation_count > 0),
  missing_observation_count      integer not null
                                   constraint fc_results_missing_nonneg check (missing_observation_count >= 0),
  coverage_ratio                 numeric not null
                                   constraint fc_results_coverage_range check (coverage_ratio > 0 and coverage_ratio <= 1),
  max_contiguous_gap_hours       integer not null
                                   constraint fc_results_gap_nonneg check (max_contiguous_gap_hours >= 0),

  -- ------------------------------------------------------------ assumptions
  alpha                          numeric not null
                                   constraint fc_results_alpha_range check (alpha >= 0 and alpha <= 0.05),
  equivalent_full_load_hours     numeric not null
                                   constraint fc_results_eflh_nonneg check (equivalent_full_load_hours >= 0),
  peak_reference_rule            text not null
                                   constraint fc_results_peak_rule check (peak_reference_rule = 'modeled_period_observed_peak'),
  peak_region_rule               text not null
                                   constraint fc_results_region_rule check (peak_region_rule = 'local_calendar_day_of_observed_peak'),
  rebound_model                  text not null
                                   constraint fc_results_rebound check (rebound_model = 'no_rebound'),
  modeled_load_shape             text not null
                                   constraint fc_results_shape check (modeled_load_shape = 'flat'),
  battery_enabled                boolean not null
                                   constraint fc_results_no_battery check (battery_enabled = false),
  minimum_annual_coverage        numeric not null,
  maximum_contiguous_gap_hours   integer,

  -- ------------------------------------------------------------ outcome
  headroom_mw                    numeric not null
                                   constraint fc_results_headroom_nonneg check (headroom_mw >= 0),
  curtailed_energy_mwh           numeric not null
                                   constraint fc_results_energy_nonneg check (curtailed_energy_mwh >= 0),
  curtailment_budget_mwh         numeric not null
                                   constraint fc_results_budget_nonneg check (curtailment_budget_mwh >= 0),
  curtailment_clock_hours        integer not null
                                   constraint fc_results_clock_nonneg check (curtailment_clock_hours >= 0),
  curtailment_event_count        integer not null
                                   constraint fc_results_events_nonneg check (curtailment_event_count >= 0),
  mean_curtailment_event_hours   numeric not null
                                   constraint fc_results_mean_event_nonneg check (mean_curtailment_event_hours >= 0),
  max_curtailment_event_hours    integer not null
                                   constraint fc_results_max_event_nonneg check (max_curtailment_event_hours >= 0),

  calculated_at                  timestamptz not null,
  created_at                     timestamptz not null default now(),

  -- ------------------------------------------------------------ the invariants, at the database
  -- The budget must bind. A stored figure that spent more than it was allowed is not a figure.
  -- The tolerance is relative, matching energyToleranceMwh() in the calculation layer: summing
  -- thousands of MWh terms leaves float residue proportional to the total, and an absolute bound
  -- tight enough for a small market would reject a correct answer for a large one.
  constraint fc_results_within_budget
    check (curtailed_energy_mwh
           <= curtailment_budget_mwh + 0.000000001 * (abs(curtailment_budget_mwh) + 1)),
  -- Coverage arithmetic closes against the period, not against itself.
  constraint fc_results_coverage_closes
    check (observation_count + missing_observation_count = expected_observation_count),
  -- A stored result never has an incomplete peak day. Eligibility is enforced in code; this is
  -- the backstop that keeps a future code path from writing one anyway.
  constraint fc_results_peak_day_complete
    check (peak_region_present_hours = peak_region_expected_hours),
  -- Nor a gap above the threshold it claims to have applied.
  constraint fc_results_gap_within_threshold
    check (maximum_contiguous_gap_hours is null
           or max_contiguous_gap_hours <= maximum_contiguous_gap_hours),
  constraint fc_results_coverage_meets_floor
    check (coverage_ratio >= minimum_annual_coverage),
  constraint fc_results_clock_within_period
    check (curtailment_clock_hours <= observation_count),
  constraint fc_results_events_within_hours
    check (curtailment_event_count <= curtailment_clock_hours),
  constraint fc_results_longest_event_within_hours
    check (max_curtailment_event_hours <= curtailment_clock_hours),
  constraint fc_results_zero_alpha_zero_headroom
    check (alpha > 0 or headroom_mw = 0),
  constraint fc_results_period_ordered
    check (period_end > period_start),

  -- One row per question. Re-asking it reuses the row rather than writing a second answer.
  unique (input_digest)
);

comment on table pipeline.flexible_capacity_scenario_results is
  'One scenario: market x modelled year x alpha. Append-only. The analytical object of the product; a publication later selects among these rather than rewriting one.';
comment on column pipeline.flexible_capacity_scenario_results.input_digest is
  'sha256 over the observations, the methodology version and digest, the parameters that can change a number, and alpha. Equal digests are the same question asked of the same evidence, which is what makes reuse safe.';
comment on column pipeline.flexible_capacity_scenario_results.observations_digest is
  'sha256 over the hourly observations alone. Changes when EIA revises a value or a missing hour arrives, and not otherwise.';

create index flexible_capacity_results_lookup_idx
  on pipeline.flexible_capacity_scenario_results (grid_area_id, local_year, alpha, calculated_at desc);
create index flexible_capacity_results_run_idx
  on pipeline.flexible_capacity_scenario_results (run_id);

-- Append-only. A scenario result is evidence of what the approved rules produced from specific
-- observations at a point in time; correcting it means calculating again, not rewriting history.
create trigger flexible_capacity_results_immutable
  before update or delete on pipeline.flexible_capacity_scenario_results
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.flexible_capacity_analytics_runs enable row level security;
alter table pipeline.flexible_capacity_scenario_results enable row level security;

-- ================================================================ operational invariants

create or replace function pipeline.flexible_capacity_violations()
returns table (check_name text, detail text, offending bigint)
language sql
stable
set search_path = pg_catalog, pipeline, reference, public
as $$
  -- A stored result must cite the approved methodology version, not merely a registered one.
  select 'result_on_unapproved_methodology',
         'a scenario result cites a methodology version that is not approved',
         count(*)
    from pipeline.flexible_capacity_scenario_results r
    join reference.methodology_versions mv on mv.id = r.methodology_version_id
   where mv.status <> 'approved'
  having count(*) > 0

  union all
  -- The digest carried on the result must be the digest the registry holds for that version.
  select 'result_digest_disagrees_with_registry',
         'a scenario result carries a methodology digest the registry does not have',
         count(*)
    from pipeline.flexible_capacity_scenario_results r
    join reference.methodology_versions mv on mv.id = r.methodology_version_id
   where mv.content_hash <> r.methodology_content_hash
  having count(*) > 0

  union all
  -- A result may only belong to a run that validated. A failed run publishes nothing.
  select 'result_on_failed_run',
         'a scenario result belongs to a run that did not validate',
         count(*)
    from pipeline.flexible_capacity_scenario_results r
    join pipeline.flexible_capacity_analytics_runs run on run.id = r.run_id
   where run.run_status <> 'validated'
  having count(*) > 0

  union all
  -- The equivalent-full-load-hours figure is alpha x T and nothing else.
  select 'equivalent_hours_not_alpha_times_t',
         'a result reports equivalent full-load hours that are not alpha x observation count',
         count(*)
    from pipeline.flexible_capacity_scenario_results r
   where abs(r.equivalent_full_load_hours - (r.alpha * r.observation_count)) > 0.000001
  having count(*) > 0

  union all
  -- The budget is alpha x headroom x T.
  select 'budget_not_alpha_times_headroom_times_t',
         'a result reports a curtailment budget that is not alpha x headroom x observation count',
         count(*)
    from pipeline.flexible_capacity_scenario_results r
   where abs(r.curtailment_budget_mwh - (r.alpha * r.headroom_mw * r.observation_count))
         > 0.000001 * (1 + abs(r.curtailment_budget_mwh))
  having count(*) > 0

  union all
  -- Two markets never share a result, and no aggregate row exists: every result names exactly one
  -- grid area, which the foreign key already guarantees, and no grid area outside the seven.
  select 'result_outside_the_seven_markets',
         'a scenario result names a grid area that is not one of the seven markets',
         count(*)
    from pipeline.flexible_capacity_scenario_results r
    join reference.grid_areas ga on ga.id = r.grid_area_id
   where ga.slug not in ('ercot', 'pjm', 'miso', 'spp', 'caiso', 'nyiso', 'iso-ne')
  having count(*) > 0

  union all
  -- Headroom must not rise as alpha falls, within one market-year and one evidence set.
  select 'headroom_not_monotone_in_alpha',
         'within a market-year, a smaller alpha produced more headroom than a larger one',
         count(*)
    from pipeline.flexible_capacity_scenario_results a
    join pipeline.flexible_capacity_scenario_results b
      on b.grid_area_id = a.grid_area_id
     and b.local_year = a.local_year
     and b.observations_digest = a.observations_digest
     and b.methodology_version_id = a.methodology_version_id
     and b.alpha > a.alpha
   where b.headroom_mw < a.headroom_mw - 0.000001
  having count(*) > 0
$$;

comment on function pipeline.flexible_capacity_violations() is
  'Invariants for the Flexible Capacity analytical layer: that no figure rests on an unapproved or drifted methodology, that the budget arithmetic closes, that markets stay separate, and that headroom is monotone in alpha. Expected to be empty.';
