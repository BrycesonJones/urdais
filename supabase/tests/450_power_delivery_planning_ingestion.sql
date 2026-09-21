-- PD-3C: the grains, locators and approval states real planning ingestion needed.
begin;

-- The accepted-risk state is available only while a terms review is genuinely open, and it
-- never rewrites the rights classification it was granted in spite of.
do $$
declare n integer; cls text;
begin
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved_under_accepted_risk'
     and source_class = 'power_system_planning_forecast';
  if n <> 4 then raise exception 'expected four accepted-risk planning interfaces, found %', n; end if;

  select rights_classification into cls from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.slug = 'pjm-load-forecast-report' and sup.purpose_code = 'public_raw_planning_value_display';
  if cls <> 'ambiguous_requires_legal_review' then
    raise exception 'approving PJM for collection changed its classification to %', cls;
  end if;

  -- A source whose terms were reviewed and refused cannot be collected under accepted risk.
  begin
    update reference.source_interfaces
       set production_access_state = 'production_approved_under_accepted_risk'
     where slug = 'spp-resource-adequacy-report';
    raise exception 'a not_permitted source was approved under accepted risk';
  exception when check_violation then null;
  end;
end $$;

-- A production retrieval is possible from an accepted-risk interface and impossible from a
-- blocked one, and the grant it cites must cover what a planning interface is read for.
do $$
declare iface uuid; grant_id uuid; blocked uuid;
begin
  select id into iface from reference.source_interfaces where slug = 'cec-california-energy-demand-forecast';
  select id into grant_id from reference.permission_grants where source_interface_id = iface;
  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, record_count, enumeration_assessment, retrieval_purpose, permission_grant_id)
  values (iface, 'pd3c-accepted-risk', '2026-09-21T09:00:00Z', '2026-09-21T09:00:05Z', 'GET',
          'https://efiling.energy.ca.gov/', 200, repeat('a', 64), 1, 'complete', 'production', grant_id);

  select id into blocked from reference.source_interfaces where slug = 'spp-resource-adequacy-report';
  begin
    insert into pipeline.source_retrievals
      (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
       response_status, response_hash, record_count, enumeration_assessment, retrieval_purpose)
    values (blocked, 'pd3c-blocked', '2026-09-21T09:00:00Z', '2026-09-21T09:00:05Z', 'GET',
            'https://spp.org/', 200, repeat('b', 64), 1, 'complete', 'production');
    raise exception 'a production retrieval was accepted from a blocked interface';
  exception when check_violation then null;
  end;

  -- A grant that does not cover internal use cannot authorise a planning collection.
  update reference.permission_grants set covers_internal_use = false where id = grant_id;
  begin
    insert into pipeline.source_retrievals
      (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
       response_status, response_hash, record_count, enumeration_assessment, retrieval_purpose, permission_grant_id)
    values (iface, 'pd3c-uncovered', '2026-09-21T09:00:00Z', '2026-09-21T09:00:05Z', 'GET',
            'https://efiling.energy.ca.gov/', 200, repeat('c', 64), 1, 'complete', 'production', grant_id);
    raise exception 'a grant that covers no internal use authorised a planning retrieval';
  exception when check_violation then null;
  end;
end $$;

-- Monthly is a first-class grain, and each grain still carries only the fields it should.
do $$
declare
  area uuid; iface uuid; retrieval uuid; grant_id uuid;
  vintage uuid := '95000000-0000-4000-8900-000000000001';
  scenario uuid := '95000000-0000-4000-8a00-000000000001';
  raw_id uuid; n integer;
begin
  select id into area from reference.grid_areas where eia_ba_code = 'PJM';
  select id into iface from reference.source_interfaces where slug = 'pjm-load-forecast-report';
  select id into grant_id from reference.permission_grants where source_interface_id = iface;
  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, record_count, enumeration_assessment, retrieval_purpose, permission_grant_id)
  values (iface, 'pd3c-monthly', '2026-09-21T09:00:00Z', '2026-09-21T09:00:05Z', 'GET',
          'https://www.pjm.com/', 200, repeat('d', 64), 2, 'complete', 'production', grant_id)
  returning id into retrieval;

  insert into pipeline.planning_forecast_vintages
    (id, grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     published_at, retrieved_at, rights_classification, publication_state, quality_status)
  values (vintage, area, iface, retrieval, 'load-forecast-2026', 'PJM 2026 Load Forecast Report',
          '2026-01-14T00:00:00Z', '2026-09-21T09:00:00Z', 'ambiguous_requires_legal_review', 'published', 'accepted');
  insert into pipeline.planning_forecast_scenarios
    (id, vintage_id, native_scenario_key, native_scenario_label, is_reference)
  values (scenario, vintage, 'PJM_Staff_Forecast', 'PJM 2026 Load Forecast', true);

  -- The archive locator: a member path without its container is refused.
  begin
    insert into pipeline.raw_planning_forecast_records
      (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_value,
       native_unit, raw_payload, extraction_method, extraction_version, workbook_sheet, workbook_cell,
       archive_member)
    values (retrieval, 90, repeat('e', 64), 'PJM_RTO', '2026-01', '1', 'MW', '{}', 'workbook_cell',
            'x/1', 'PJM_RTO', 'D2', 'xl/worksheets/sheet25.xml');
    raise exception 'an archive member was accepted without its archive';
  exception when check_violation then null;
  end;

  insert into pipeline.raw_planning_forecast_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_value,
     native_unit, raw_payload, extraction_method, extraction_version, workbook_sheet, workbook_cell,
     archive_ref, archive_member)
  values (retrieval, 0, repeat('e', 64), 'PJM_RTO', '2026-01', '131709', 'MW', '{}', 'workbook_cell',
          'urdais-planning-extractor/1.0.0', 'PJM_RTO', 'D2',
          '2026-load-report-data (sha256 ...)', 'xl/worksheets/sheet25.xml')
  returning id into raw_id;

  -- Monthly peak and monthly energy coexist for the same month: different measures, not a
  -- restatement of one another.
  insert into pipeline.planning_forecast_points
    (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
     target_year, target_month, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
  values (vintage, scenario, area, raw_id, 'balancing_authority', 'monthly', 2026, 1, 131709, 'MW',
          'coincident_peak', 'unspecified', 'unspecified', 'included_screened');
  insert into pipeline.planning_forecast_points
    (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
     target_year, target_month, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
  values (vintage, scenario, area, raw_id, 'balancing_authority', 'monthly', 2026, 1, 62000, 'GWh',
          'period_energy', 'unspecified', 'unspecified', 'included_screened');
  select count(*) into n from pipeline.planning_forecast_points where vintage_id = vintage;
  if n <> 2 then raise exception 'monthly peak and energy did not coexist: % rows', n; end if;

  -- The same measure twice for the same month is a duplicate and is refused.
  begin
    insert into pipeline.planning_forecast_points
      (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
       target_year, target_month, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
    values (vintage, scenario, area, raw_id, 'balancing_authority', 'monthly', 2026, 1, 999, 'MW',
            'coincident_peak', 'unspecified', 'unspecified', 'included_screened');
    raise exception 'a duplicate live monthly point was accepted';
  exception when unique_violation then null;
  end;

  -- A monthly point may not also claim a season, and an annual point may not claim a month.
  begin
    insert into pipeline.planning_forecast_points
      (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
       target_year, target_month, target_season, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
    values (vintage, scenario, area, raw_id, 'balancing_authority', 'monthly', 2026, 1, 'winter', 1, 'MW',
            'coincident_peak', 'unspecified', 'unspecified', 'included_screened');
    raise exception 'a monthly point accepted a season';
  exception when check_violation then null;
  end;
  begin
    insert into pipeline.planning_forecast_points
      (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
       target_year, target_month, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
    values (vintage, scenario, area, raw_id, 'balancing_authority', 'annual', 2026, 1, 1, 'MW',
            'coincident_peak', 'unspecified', 'unspecified', 'included_screened');
    raise exception 'an annual point accepted a month';
  exception when check_violation then null;
  end;

  -- Energy units still require an energy measure, at either grain.
  begin
    insert into pipeline.planning_forecast_points
      (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
       target_year, target_month, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
    values (vintage, scenario, area, raw_id, 'balancing_authority', 'monthly', 2026, 2, 1, 'GWh',
            'coincident_peak', 'unspecified', 'unspecified', 'included_screened');
    raise exception 'a peak was recorded in GWh';
  exception when check_violation then null;
  end;

  -- A planning raw record still cannot be filed as EIA operational evidence.
  begin
    insert into pipeline.power_observations
      (raw_power_record_id, grid_area_id, power_metric_id, period_start, period_end,
       temporal_resolution, value_mw, unit, value_status, source_effective_at, retrieved_at, quality_status)
    values (raw_id, area, (select id from reference.power_metrics where code = 'actual_load'),
            '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 'hourly', 1, 'MW', 'observed',
            '2026-01-01T00:00:00Z', '2026-09-21T09:00:00Z', 'accepted');
    raise exception 'an ingested planning record entered the operational store';
  exception when check_violation or foreign_key_violation then null;
  end;
end $$;

rollback;
