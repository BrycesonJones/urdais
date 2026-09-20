-- PD-3E: the comparison a planning rerun makes must not depend on a server rendering setting.
--
-- Production runs `extra_float_digits = 0`. Under it a numeric rendered through float8 is
-- printed to fifteen significant digits, so every stored ERCOT value needing sixteen came back
-- short, compared unequal to the number it had been stored from, and was superseded and
-- re-inserted on every run: 285 phantom revisions of 982 points, old and new numerically
-- identical. This pins the engine behaviour the fix relies on.
begin;

do $$
declare
  -- One of the 285 values that churned in production, and one that did not.
  long_value  numeric := 173231.3029514549;   -- sixteen significant digits
  short_value numeric := 144521.884;          -- nine
  rendered text;
begin
  -- Under production's setting, float8 rendering loses the sixteenth digit.
  set local extra_float_digits = 0;
  if current_setting('extra_float_digits') <> '0' then
    raise exception 'the test did not take effect; extra_float_digits is %', current_setting('extra_float_digits');
  end if;

  rendered := (long_value::float8)::text;
  if rendered = long_value::text then
    raise exception 'float8 rendering no longer loses precision at extra_float_digits=0 (% vs %); this test has stopped reproducing the defect', rendered, long_value::text;
  end if;

  -- The exact stored decimal is unaffected, which is why the comparison reads ::text.
  if long_value::text <> '173231.3029514549' then
    raise exception 'numeric::text is not the exact stored decimal: %', long_value::text;
  end if;

  -- A short value renders identically either way, which is why PJM, the CEC and ISO-NE never
  -- churned: their published values do not reach sixteen significant digits.
  if (short_value::float8)::text <> short_value::text then
    raise exception 'a nine-digit value lost precision through float8: % vs %', (short_value::float8)::text, short_value::text;
  end if;

  -- And at the local default the defect is invisible, which is how it reached production.
  set local extra_float_digits = 1;
  if (long_value::float8)::text <> long_value::text then
    raise exception 'the defect is visible at extra_float_digits=1, so the local suite should have caught it';
  end if;
end $$;

-- The same comparison, made the way the store makes it, against a real stored row.
do $$
declare
  iface uuid; area uuid; retrieval uuid; grant_id uuid;
  vintage uuid := '96000000-0000-4000-8900-000000000001';
  scenario uuid := '96000000-0000-4000-8a00-000000000001';
  raw_id uuid; stored_text text; stored_float text;
begin
  select id into iface from reference.source_interfaces where slug = 'ercot-long-term-load-forecast';
  select id into area from reference.grid_areas where eia_ba_code = 'ERCO';
  select id into grant_id from reference.permission_grants where source_interface_id = iface;
  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, record_count, enumeration_assessment, retrieval_purpose, permission_grant_id)
  values (iface, 'pd3e-precision', '2026-09-22T09:00:00Z', '2026-09-22T09:00:01Z', 'GET',
          'https://www.ercot.com/', 200, repeat('a', 64), 1, 'complete', 'production', grant_id)
  returning id into retrieval;
  insert into pipeline.planning_forecast_vintages
    (id, grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     published_at, retrieved_at, rights_classification, publication_state, quality_status)
  values (vintage, area, iface, retrieval, 'ltlf-2025-04-adjusted', '2025 LTLF',
          '2025-04-08T00:00:00Z', '2026-09-22T09:00:00Z',
          'reusable_with_attribution_or_conditions', 'published', 'accepted');
  insert into pipeline.planning_forecast_scenarios
    (id, vintage_id, native_scenario_key, native_scenario_label, is_reference)
  values (scenario, vintage, 'ERCOT_Adjusted', 'ERCOT Adjusted Forecast', true);
  insert into pipeline.raw_planning_forecast_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_value,
     native_unit, raw_payload, extraction_method, extraction_version, workbook_sheet, workbook_cell)
  values (retrieval, 0, repeat('b', 64), 'ERCOT', '2028 Summer', '173231.3029514549', 'MW', '{}',
          'workbook_cell', 'pd3e/1', 'Summer', 'J6')
  returning id into raw_id;
  insert into pipeline.planning_forecast_points
    (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
     target_year, target_season, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
  values (vintage, scenario, area, raw_id, 'balancing_authority', 'seasonal', 2028, 'summer',
          173231.3029514549, 'MW', 'coincident_peak', 'unspecified', 'net', 'included_probability_weighted');

  set local extra_float_digits = 0;
  select value::text, (value::float8)::text into stored_text, stored_float
    from pipeline.planning_forecast_points where vintage_id = vintage;

  -- What the store now reads: the value it stored, exactly.
  if stored_text <> '173231.3029514549' then
    raise exception 'the stored decimal read back as %', stored_text;
  end if;
  -- What the store used to read: a different number, which is the whole defect.
  if stored_float = stored_text then
    raise exception 'float8 readback no longer differs; this test has stopped guarding anything';
  end if;
end $$;

rollback;
