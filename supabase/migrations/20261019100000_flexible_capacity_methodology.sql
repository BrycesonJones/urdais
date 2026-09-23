-- Flexible Capacity FC-2: methodology 1.0.0 and its parameter registry.
--
-- This migration registers rules and creates no tables. FC-2's job is to make the question
-- `curtailment_enabled_headroom_gw` answers unambiguous, and to establish the observed history the
-- answer needs; the analytical layer that stores results belongs to FC-3, and inventing its tables
-- now would fix a storage shape before the calculation has run against real data once.
--
-- Nothing here holds hourly demand. Flexible Capacity reads the canonical EIA-930 observations
-- Power Delivery already collects, and a second representation of the same hours would be a
-- second thing to keep correct.
--
-- Every assumption the calculation depends on is a row in reference.methodology_parameters with a
-- rationale, and the calculation layer mirrors those values in
-- src/lib/flexible-capacity/methodology.ts where a test asserts the two agree. Three parameters
-- are registered as drafts carrying the text `unresolved`: they have an identity and no
-- defensible value, and a draft row saying so is a queryable admission where an absent row would
-- be indistinguishable from an oversight.

-- ---------------------------------------------------------------- methodology

insert into reference.methodologies (id, slug, name, document_path) values
  ('9c000000-0000-4000-8500-000000000001'::uuid, 'flexible-capacity',
   'Urdais Flexible Capacity', 'docs/methodology/flexible-capacity.md')
on conflict (slug) do nothing;

-- The digest binds the approved rules to the bytes that were approved. Authorisation reads this
-- row; it never reads the file. A filesystem check is what broke Transmission Headroom's first
-- production cron, where docs/ is absent from the serverless bundle.
insert into reference.methodology_versions
  (methodology_id, version, status, document_path, content_hash, effective_from)
select m.id, '1.0.0', 'approved', 'docs/methodology/flexible-capacity.md',
       '6d0ab68b314b073b96413d5728ef67d8b1b3dfdfed279c5d300e5198620283b2',
       timestamptz '2026-09-23T00:00:00Z'
from reference.methodologies m where m.slug = 'flexible-capacity'
on conflict do nothing;

-- ---------------------------------------------------------------- approved parameters

insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, numeric_value, text_value, status,
   effective_from, approved_by, approved_on, rationale)
select mv.id, v.k, v.num, v.txt, 'approved', date '2026-09-23',
       'Urdais founder decision, Flexible Capacity 1.0.0 scenario contract', date '2026-09-23', v.why
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'flexible-capacity'
  cross join (values
    ('annual_curtailment_energy_fraction_default', 0.0050::numeric, null,
     'Alpha: the hypothetical new load''s annual curtailed energy as a fraction of its own annual energy, at the default scenario. 0.50% is the middle of the published set. An energy allowance is the control rather than a count of hours because the number of hours is an output of the model: how many hours a given allowance spends depends on the shape of the demand series. The retired scenario chart used an undefined "flexible hours per year" as its axis, which is the defect this parameter exists to remove.'),
    ('annual_curtailment_energy_fraction_maximum', 0.05, null,
     'The largest alpha the methodology will evaluate. A guardrail on the model''s domain, not a claim that 5% is achievable: past a few percent a load being curtailed is no longer the flexible-but-firm load this model describes, and a linear energy budget stops being a good account of it. The solver refuses an alpha above this rather than extrapolating.'),
    ('annual_curtailment_energy_fraction_scenarios', null, '0.0025,0.0050,0.0100',
     'The published scenario set: 0.25%, 0.50% and 1.00%, equal to 21.9, 43.8 and 87.6 equivalent full-load hours in a complete non-leap year. These are Urdais scenario parameters informed by the range the external research found discussed, and are not reproductions of any published result: every figure Urdais states is recomputed from EIA-930 by this methodology.'),
    ('battery_enabled', null, 'false',
     'Storage contributes nothing in 1.0.0, as an approved decision rather than an omission. Three independent reasons, each sufficient. It is not additive with curtailable load: both serve the same tight hours, so summing them counts the same headroom twice, and the retired chart did exactly that with an unexplained 0.8 multiplier that is not carried forward. There is no inventory: Urdais holds no deployed-storage figures for any market, reference.capacity_component_kinds names storage_capability and no row has ever been written to it, and the thousands of battery interconnection requests are proposals, which cannot shift load. And storage needs power, energy, duration, round-trip efficiency, state of charge and recharge opportunity, none of which a flat-load energy budget can represent.'),
    ('curtailment_dispatch_foresight', null, 'perfect_within_period',
     'The scenario curtails in exactly the hours required and no others, which assumes perfect knowledge of the whole year in advance. It is an upper bound on what dispatch could achieve: a real operator deciding hour by hour, without knowing whether a tighter hour lies ahead, would achieve less. Recorded as a parameter because it is a substantive assumption that is easy to leave unstated, and because relaxing it is a defensible future version.'),
    ('market_scope', null, 'per_balancing_authority_no_aggregation',
     'Published per balancing authority, with no total of any kind. Each market sets its own peak reference from its own demand, and those references belong to different systems with different peak hours and seasons and no shared adequacy constraint. Adding the results would describe no system that exists: it would assume silently that headroom in one market can serve load in another, which is precisely the transmission question this methodology does not represent.'),
    ('minimum_annual_coverage', 0.995, null,
     'A market-year below 99.5% hourly coverage is refused rather than modelled. Calibrated against measured history rather than chosen: a full backfill of local year 2025 returned 100.0000% for ERCOT, MISO and SPP, 99.9886% for PJM, NYISO and ISO-NE, and 99.9772% for CAISO, a worst case of two absent hours in 8,760. The floor is roughly twenty times that worst case, so an ordinary year passes comfortably while a year missing more than about 44 hours does not. It bounds quantity and not position, which maximum_contiguous_gap_hours records as unresolved.'),
    ('missing_hour_treatment', null, 'excluded_no_interpolation',
     'Missing hours are excluded from the series and from T. They are never interpolated, carried forward or filled from any model. The reason is specific to this metric: the answer is decided by the top of the load distribution and the peak reference is a single observed hour, so an invented value near the top would change the result while being indistinguishable from evidence. Excluding an hour costs one term in a sum of thousands; inventing one can move the reference itself.'),
    ('modeled_load_shape', null, 'flat',
     'The hypothetical additional load is the same in every hour of the modelled period. A flat shape is the one that can be stated without assuming anything about what the new load is for; any other shape would embed a usage profile the methodology has no source for.'),
    ('peak_reference_rule', null, 'modeled_period_observed_peak',
     'Peak_ref is the modelled period''s own maximum observed hourly actual demand, ties resolved to the earliest hour. It is entirely observed, so the scenario rests on one source and needs no forecast or planning document. It is within-period, so modelling year Y needs only year Y -- a prior-year rule would require two complete years before stating anything and would mix two periods in one figure, which matters while the backfilled history is short. And it makes every headroom gap non-negative, so the counterfactual is exactly "without raising the peak this system actually reached". The alternatives considered and not adopted are prior_period_observed_peak, seasonal_observed_peak and percentile_of_observed_load; adopting one is a version change, not a code change.'),
    ('peak_region_coverage_rule', null, 'local_calendar_day_of_observed_peak',
     'The local calendar day containing the observed maximum must be completely present, or the market-year is ineligible. minimum_annual_coverage bounds how many hours are absent; this bounds where. Without it a year could lose the afternoon of its hottest day, keep a surviving shoulder hour, set Peak_ref from that hour, and report more headroom than the evidence supports while its coverage ratio still looked healthy. The day is counted in instants, so a spring-forward day legitimately expects 23 hours and a fall-back day 25; nothing assumes 24. It is a necessary condition and not a sufficient one: a complete peak day cannot prove a gap elsewhere in the year did not hold a higher value, which is the residual maximum_contiguous_gap_hours covers.'),
    ('rebound_model', null, 'no_rebound',
     'Curtailed energy is forgone, not deferred into a later hour. A load that must make up the work afterwards is not described by this figure, and modelling deferral would require knowing what the load is for and how long it may be postponed.'),
    ('solver_method', null, 'bisection_on_feasible_interval',
     'Delta-L* is found by bisection on [0, U]. Valid because feasibility is monotone: each R_t is non-decreasing, convex and piecewise linear in Delta-L and the budget is linear, so their difference is convex and zero at the origin and the feasible set is an interval anchored at zero. The search returns the feasible end of the final bracket, never the infeasible end, so a published figure satisfies its own budget rather than approximating it. U is analytic rather than guessed: since R_t >= Delta-L - max(d_t, 0), any Delta-L above sum_t max(d_t, 0) / ((1 - alpha) * T) is infeasible.'),
    ('solver_tolerance_mw', 0.000001, null,
     'Bisection stops when the bracket is one microwatt wide, or after 100 iterations; the analytic bound needs roughly 35 halvings to reach it. Reported megawatts are floored to six decimals so the published value stays on the feasible side, and the reported curtailed energy is recomputed at the reported headroom so the two always describe the same scenario.'),
    ('validation_market', null, 'ercot',
     'ERCOT is the first market FC-3 validates against: its measured 2025 coverage is complete, its summer peak is sharply defined, and it is a single-state interconnection whose demand series has no seam.')
  ) as v(k, num, txt, why)
on conflict do nothing;

-- ---------------------------------------------------------------- unresolved parameters
--
-- Named, draft, and carrying the reason they cannot be settled here. A draft row has no effective
-- date, which the table enforces, and no approved calculation may rest on one.

insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, numeric_value, text_value, status, rationale)
select mv.id, v.k, null::numeric, 'unresolved', 'draft', v.why
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'flexible-capacity'
  cross join (values
    ('demand_response_inventory',
     'UNRESOLVED. Demand response is not an input to 1.0.0, and adding it later is a specific identified trap rather than a simple extension. Some publishers already net demand response out of the demand they report: SPP defines Net Peak Demand as forecast peak less controllable and dispatchable demand response, and the Urdais ingestion for that source carries netPeakDemandExcludesDemandResponse on every record precisely so the fact survives. A version that introduces demand response must first establish, per publisher, whether the demand series it is added to already excludes it, or it will count the same megawatts twice.'),
    ('deployed_storage_inventory',
     'UNRESOLVED. Modelling storage requires an inventory of storage that is actually deployed, with power, energy and duration per market. Urdais holds none: reference.capacity_component_kinds names storage_capability and it has no rows, and the interconnection queue records proposals rather than plant. Until such an inventory exists, and until non-additivity with curtailable load is modelled explicitly rather than by summing two terms, battery_enabled stays false.'),
    ('maximum_contiguous_gap_hours',
     'UNRESOLVED. minimum_annual_coverage bounds how many hours are absent from a market-year, not where they are. Forty-four hours scattered across a mild spring are nearly harmless; forty-four consecutive hours of an August heatwave could remove the annual peak and still leave a coverage ratio that passes. 1.0.0 does not close this, and the parameter exists so the gap in the rule is recorded where a later version will look for it. Every result reports its missing-hour count in the meantime.')
  ) as v(k, why)
on conflict do nothing;
