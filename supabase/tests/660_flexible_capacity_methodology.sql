-- FC-2: Flexible Capacity methodology 1.0.0 and its parameter registry.
--
-- FC-2 registers rules and stores no analytical output, so what there is to test is the
-- registration itself: that the version is approved against a real digest, that every assumption
-- the calculation depends on exists as an approved row rather than a constant in code, and that
-- the two inputs a later phase will need are present and visibly unresolved rather than absent.
--
-- The last of those is the point of the exercise. A parameter that does not exist is indistinguishable
-- from one nobody has thought about; a draft row saying `unresolved` is a queryable admission.
begin;

do $$
declare
  n integer;
  method uuid;
  version_id uuid;
  digest text;
begin
  -- -------------------------------------------------------------- the methodology
  select id into method from reference.methodologies where slug = 'flexible-capacity';
  if method is null then raise exception 'the flexible-capacity methodology is not registered'; end if;

  select id, content_hash into version_id, digest
    from reference.methodology_versions
   where methodology_id = method and methodology_versions.version = '1.0.0';
  if version_id is null then raise exception 'flexible capacity 1.0.0 is not registered'; end if;

  -- The guard compares this against a constant pinned in TypeScript, so a placeholder here would
  -- pass registration and fail every production read with a confusing message.
  if digest !~ '^[0-9a-f]{64}$' or digest = repeat('0', 64) then
    raise exception 'flexible capacity 1.0.0 has no real document digest: %', digest;
  end if;

  select count(*) into n from reference.methodology_versions
   where methodology_id = method and methodology_versions.version = '1.0.0' and status = 'approved';
  if n <> 1 then raise exception 'flexible capacity 1.0.0 is not approved'; end if;

  -- One version only. A second one registered in the same migration would make "the approved
  -- methodology" ambiguous at exactly the moment the guard needs it to be singular.
  select count(*) into n from reference.methodology_versions where methodology_id = method;
  if n <> 1 then raise exception 'flexible capacity has % registered versions, expected 1', n; end if;

  -- -------------------------------------------------------------- the parameters
  select count(*) into n from reference.methodology_parameters where methodology_version_id = version_id;
  if n <> 18 then raise exception 'flexible capacity 1.0.0 registers % parameters, expected 18', n; end if;

  -- Every rule the calculation reads must be approved. A draft cannot gate a published figure,
  -- and the code mirrors these values, so a silent demotion here would be a silent divergence.
  foreach digest in array array[
    'annual_curtailment_energy_fraction_default',
    'annual_curtailment_energy_fraction_maximum',
    'annual_curtailment_energy_fraction_scenarios',
    'battery_enabled',
    'curtailment_dispatch_foresight',
    'market_scope',
    'minimum_annual_coverage',
    'missing_hour_treatment',
    'modeled_load_shape',
    'peak_reference_rule',
    'peak_region_coverage_rule',
    'rebound_model',
    'solver_method',
    'solver_tolerance_mw',
    'validation_market'
  ] loop
    select count(*) into n from reference.methodology_parameters
     where methodology_version_id = version_id and parameter_key = digest and status = 'approved';
    if n <> 1 then raise exception 'parameter % is not registered and approved', digest; end if;
  end loop;

  -- The peak reference the code implements, and the only one 1.0.0 adopts.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = version_id and parameter_key = 'peak_reference_rule'
     and text_value = 'modeled_period_observed_peak' and status = 'approved';
  if n <> 1 then raise exception 'the adopted peak reference rule is not registered'; end if;

  -- Storage is off, and off as an approved decision rather than an omission.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = version_id and parameter_key = 'battery_enabled'
     and text_value = 'false' and status = 'approved';
  if n <> 1 then raise exception 'battery_enabled is not registered as an approved false'; end if;

  -- Missing hours are excluded, never interpolated. If this ever reads otherwise, the peak
  -- reference could be set by a value no publisher reported.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = version_id and parameter_key = 'missing_hour_treatment'
     and text_value = 'excluded_no_interpolation' and status = 'approved';
  if n <> 1 then raise exception 'missing-hour treatment is not registered as exclusion'; end if;

  -- No cross-market total, recorded where a later phase will look for it.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = version_id and parameter_key = 'market_scope'
     and text_value = 'per_balancing_authority_no_aggregation' and status = 'approved';
  if n <> 1 then raise exception 'the no-aggregation market scope is not registered'; end if;


  -- The topological half of the coverage rule: the peak day must be complete. Without it the
  -- quantity floor alone would pass a year that lost the afternoon of its hottest day.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = version_id and parameter_key = 'peak_region_coverage_rule'
     and text_value = 'local_calendar_day_of_observed_peak' and status = 'approved';
  if n <> 1 then raise exception 'the peak-region coverage rule is not registered'; end if;

  -- -------------------------------------------------------------- the unresolved three
  -- Named, draft, and each carrying a reason: the two inventories a later version would need
  -- and neither Urdais holds, plus the shape-of-absence rule the coverage floor does not cover.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = version_id
     and parameter_key in ('demand_response_inventory', 'deployed_storage_inventory',
                           'maximum_contiguous_gap_hours')
     and status = 'draft' and text_value = 'unresolved'
     and effective_from is null and btrim(coalesce(rationale, '')) <> '';
  if n <> 3 then raise exception 'the three unresolved inputs are not registered as unresolved drafts'; end if;

  -- And nothing else is draft: an approved calculation may not rest on an unsettled parameter.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = version_id and status <> 'approved';
  if n <> 3 then raise exception '% parameters are not approved, expected exactly the 3 unresolved', n; end if;

  -- A draft parameter carries no effective date, which the table also enforces; asserted here so
  -- that a future edit promoting one of these has to think about attribution.
  select count(*) into n from reference.methodology_parameters
   where methodology_version_id = version_id and status = 'approved'
     and (effective_from is null or approved_by is null or approved_on is null);
  if n <> 0 then raise exception '% approved parameters are unattributed', n; end if;
end $$;

-- FC-2 stores no analytical output. If a later phase adds tables, this assertion is the place
-- that will notice they arrived without their own tests.
do $$
declare
  n integer;
begin
  select count(*) into n from information_schema.tables
   where table_schema = 'pipeline' and table_name like 'flexible_capacity%';
  if n <> 0 then
    raise exception 'FC-2 registers methodology only, but % pipeline.flexible_capacity* tables exist', n;
  end if;
end $$;


-- The publication gate assertPublicationAuthorized() enforces fails closed while any parameter is
-- unresolved. That is a code path, but its precondition is data: assert here that 1.0.0 as
-- registered genuinely cannot satisfy it, so a future migration quietly promoting the three drafts
-- has to come past this test.
do $$
declare
  n integer;
begin
  select count(*) into n
    from reference.methodology_parameters p
    join reference.methodology_versions mv on mv.id = p.methodology_version_id
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'flexible-capacity' and mv.version = '1.0.0'
     and (p.status <> 'approved' or lower(btrim(coalesce(p.text_value, ''))) = 'unresolved');
  if n <> 3 then
    raise exception 'flexible capacity 1.0.0 has % publication-blocking parameters, expected exactly 3', n;
  end if;
end $$;

rollback;
