-- PD-3B: planning vintages, scenarios, evidence, points, rights records, and the wall between
-- planning demand and the PD-2 operational store.
begin;

-- The rights vocabulary and the V1 source policy are present and unmodified.
do $$
declare n integer; classes text[];
begin
  select array_agg(code order by severity_ordinal) into classes from reference.source_rights_classifications;
  if classes <> array['clearly_reusable','reusable_with_attribution_or_conditions',
                      'ambiguous_requires_legal_review','unsuitable_without_permission'] then
    raise exception 'unexpected rights classification vocabulary: %', classes;
  end if;

  select count(*) into n from reference.source_use_purposes where is_public;
  if n <> 2 then raise exception 'expected two public use purposes, found %', n; end if;

  -- Every ambiguous determination states the question it is unresolved on. Publication under
  -- an ambiguous classification is only defensible while that is true.
  if exists (select 1 from reference.source_use_permissions
              where rights_classification = 'ambiguous_requires_legal_review'
                and (unresolved_issue is null or btrim(unresolved_issue) = '')) then
    raise exception 'an ambiguous determination carries no unresolved issue';
  end if;

  -- Nothing was relabelled: the four ambiguous sources are still ambiguous.
  select count(distinct s.slug) into n
    from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where sup.rights_classification = 'ambiguous_requires_legal_review';
  if n <> 4 then raise exception 'expected four ambiguous planning sources, found %', n; end if;
end $$;

-- A later written permission makes a blocked source publishable without rewriting the review
-- that governed earlier evidence: the old determination is closed, not edited.
do $$
declare iface uuid; closed record; opened record;
begin
  select id into iface from reference.source_interfaces where slug = 'spp-resource-adequacy-report';
  update reference.source_use_permissions set effective_to = '2026-10-01T00:00:00Z'
   where source_interface_id = iface and purpose_code = 'public_raw_planning_value_display';
  insert into reference.source_use_permissions
    (source_interface_id, purpose_code, rights_classification, disposition, attribution_required,
     attribution_text, conditions, unresolved_issue, terms_document_url, decisive_clause,
     reviewed_by, reviewed_on, effective_from)
  values (iface, 'public_raw_planning_value_display', 'unsuitable_without_permission', 'permitted', true,
          'Source: Southwest Power Pool, Inc., Seasonal Resource Adequacy Report.',
          'Display of Table 1 peaks only.', null, 'https://portal.spp.org/terms-of-use',
          'fixture: express written authorization', 'fixture', date '2026-10-01', '2026-10-01T00:00:00Z');

  select disposition, rights_classification, effective_to into closed
    from reference.source_use_permissions
   where source_interface_id = iface and purpose_code = 'public_raw_planning_value_display'
     and effective_to is not null;
  select disposition, rights_classification into opened
    from reference.source_use_permissions
   where source_interface_id = iface and purpose_code = 'public_raw_planning_value_display'
     and effective_to is null;
  if closed.disposition <> 'prohibited' then
    raise exception 'the superseded determination was rewritten to %', closed.disposition;
  end if;
  if opened.disposition <> 'permitted' or opened.rights_classification <> 'unsuitable_without_permission' then
    raise exception 'a permission grant silently converted the rights classification to %', opened.rights_classification;
  end if;
end $$;

-- Two open-ended determinations for one source and purpose is a contradiction, not a history.
do $$
declare iface uuid;
begin
  select id into iface from reference.source_interfaces where slug = 'nyiso-gold-book';
  begin
    insert into reference.source_use_permissions
      (source_interface_id, purpose_code, rights_classification, disposition,
       unresolved_issue, reviewed_by, reviewed_on, effective_from)
    values (iface, 'internal_retention', 'ambiguous_requires_legal_review', 'not_established',
            'fixture', 'fixture', date '2026-10-01', '2026-10-01T00:00:00Z');
    raise exception 'two open determinations for one source and purpose were accepted';
  exception when unique_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- vintages and supersession
do $$
declare
  ercot_area uuid; pjm_area uuid; iface uuid; retrieval uuid;
  v2025 uuid := '94000000-0000-4000-8900-000000000001';
  v2026 uuid := '94000000-0000-4000-8900-000000000002';
  v2026_corrected uuid := '94000000-0000-4000-8900-000000000003';
  s_ref uuid := '94000000-0000-4000-8a00-000000000001';
  s_high uuid := '94000000-0000-4000-8a00-000000000002';
  raw_annual uuid; raw_seasonal uuid; raw_hourly uuid; n integer;
begin
  select id into ercot_area from reference.grid_areas where eia_ba_code = 'ERCO';
  select id into pjm_area from reference.grid_areas where eia_ba_code = 'PJM';
  select id into iface from reference.source_interfaces where slug = 'ercot-long-term-load-forecast';

  insert into pipeline.source_retrievals
    (source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
     response_status, response_hash, record_count, enumeration_assessment, retrieval_purpose)
  values (iface, 'pd3-fixture', '2026-09-20T09:00:00Z', '2026-09-20T09:00:05Z', 'GET',
          'https://www.ercot.com/gridinfo/load/forecast', 200, repeat('a', 64), 3, 'complete', 'research')
  returning id into retrieval;

  -- A retrieval freezes the determination it was collected under.
  insert into pipeline.retrieval_rights_snapshots
    (retrieval_id, purpose_code, rights_classification, disposition, attribution_required,
     attribution_text, captured_at)
  select retrieval, sup.purpose_code, sup.rights_classification, sup.disposition,
         sup.attribution_required, sup.attribution_text, '2026-09-20T09:00:00Z'
    from reference.source_use_permissions sup
   where sup.source_interface_id = iface and sup.effective_to is null;
  select count(*) into n from pipeline.retrieval_rights_snapshots where retrieval_id = retrieval;
  if n <> 4 then raise exception 'retrieval froze % rights determinations, expected 4', n; end if;
  begin
    update pipeline.retrieval_rights_snapshots set disposition = 'prohibited' where retrieval_id = retrieval;
    raise exception 'a frozen rights snapshot was editable';
  exception when restrict_violation then null;
  end;

  insert into pipeline.planning_forecast_vintages
    (id, grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     published_at, published_at_precision, retrieved_at, rights_classification, publication_state, quality_status)
  values
    (v2025, ercot_area, iface, retrieval, 'ltlf-2025-04-adjusted', '2025 Long-Term Load Forecast (April 2025 Adjusted)',
     '2025-04-15T00:00:00Z', 'day', '2026-09-20T09:00:00Z', 'reusable_with_attribution_or_conditions', 'published', 'accepted'),
    (v2026, ercot_area, iface, retrieval, 'ltlf-2026-04-adjusted', '2026 Long-Term Load Forecast (April 2026 Adjusted)',
     '2026-04-15T00:00:00Z', 'day', '2026-09-20T09:00:00Z', 'reusable_with_attribution_or_conditions', 'published', 'accepted');

  -- Two live vintages for one market, both speaking about the same target years.
  select count(*) into n from pipeline.planning_forecast_vintages
   where grid_area_id = ercot_area and superseded_by_id is null;
  if n <> 2 then raise exception 'expected two live ERCOT vintages, found %', n; end if;

  -- A new annual forecast is not a correction of its predecessor and may not pose as one.
  begin
    update pipeline.planning_forecast_vintages
       set superseded_by_id = v2026, superseded_at = '2026-04-15T00:00:00Z',
           supersession_reason = 'a newer forecast exists', supersession_kind = 'reissue'
     where id = v2025;
    raise exception 'a new annual vintage superseded the prior vintage';
  exception when check_violation then null;
  end;

  -- A reissue of the same release does supersede it, and only it. The predecessor is retired
  -- first so that exactly one live row per release holds throughout.
  update pipeline.planning_forecast_vintages
     set superseded_by_id = v2026_corrected, superseded_at = '2026-05-02T00:00:00Z',
         supersession_reason = 'publisher reissued the April 2026 workbook with corrected weather-zone totals',
         supersession_kind = 'correction'
   where id = v2026;
  insert into pipeline.planning_forecast_vintages
    (id, grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     published_at, published_at_precision, retrieved_at, rights_classification, publication_state, quality_status)
  values (v2026_corrected, ercot_area, iface, retrieval, 'ltlf-2026-04-adjusted',
          '2026 Long-Term Load Forecast (April 2026 Adjusted, corrected)',
          '2026-05-02T00:00:00Z', 'day', '2026-09-20T09:00:00Z',
          'reusable_with_attribution_or_conditions', 'published', 'accepted');
  if (select superseded_by_id from pipeline.planning_forecast_vintages where id = v2025) is not null then
    raise exception 'correcting the 2026 release also superseded the 2025 release';
  end if;
  select count(*) into n from pipeline.planning_forecast_vintages
   where grid_area_id = ercot_area and superseded_by_id is null;
  if n <> 2 then raise exception 'expected two live vintages after the correction, found %', n; end if;

  -- A vintage of one market cannot be superseded by a vintage of another, even when the two
  -- share a native release key.
  insert into pipeline.planning_forecast_vintages
    (grid_area_id, source_interface_id, source_retrieval_id, native_vintage_key, report_title,
     published_at, retrieved_at, rights_classification)
  values (pjm_area, iface, retrieval, 'ltlf-2025-04-adjusted', 'same key, different market',
          '2025-04-15T00:00:00Z', '2026-09-20T09:00:00Z', 'reusable_with_attribution_or_conditions');
  begin
    update pipeline.planning_forecast_vintages
       set superseded_by_id = (select id from pipeline.planning_forecast_vintages
                                where grid_area_id = pjm_area and native_vintage_key = 'ltlf-2025-04-adjusted'),
           superseded_at = '2026-05-02T00:00:00Z', supersession_reason = 'fixture', supersession_kind = 'correction'
     where id = v2025;
    raise exception 'a vintage was superseded across markets';
  exception when check_violation then null;
  end;

  -- ----------------------------------------------------------------------------- scenarios
  insert into pipeline.planning_forecast_scenarios
    (id, vintage_id, native_scenario_key, native_scenario_label, canonical_class, is_reference,
     weather_basis, load_basis, large_load_policy, assumptions_text)
  values
    (s_ref, v2025, 'ERCOT_Adjusted', 'ERCOT Adjusted Forecast', 'reference', true,
     'p50', 'net', 'included_probability_weighted', 'Large-load additions discounted by signed-agreement status.'),
    (s_high, v2025, 'TSP_Provided', 'TSP Provided Forecast', 'high', false,
     'p50', 'net', 'included_all', 'Transmission service provider submissions without ERCOT adjustment.');
  select count(*) into n from pipeline.planning_forecast_scenarios where vintage_id = v2025;
  if n <> 2 then raise exception 'expected two coexisting scenarios, found %', n; end if;
  begin
    insert into pipeline.planning_forecast_scenarios
      (vintage_id, native_scenario_key, native_scenario_label, is_reference)
    values (v2025, 'P90', 'P90 weather case', true);
    raise exception 'a vintage accepted a second reference scenario';
  exception when unique_violation then null;
  end;

  -- ------------------------------------------------------------------------- raw evidence
  insert into pipeline.raw_planning_forecast_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_scenario,
     native_value, native_unit, raw_payload, extraction_method, extraction_version,
     workbook_sheet, workbook_cell)
  values (retrieval, 0, repeat('b', 64), 'ERCOT Total', '2031 Summer', 'ERCOT_Adjusted',
          '144522', 'MW', '{"value":"144522"}', 'workbook_cell', 'xlsb-reader/1.0.0',
          'Appendix A', 'D17')
  returning id into raw_seasonal;
  insert into pipeline.raw_planning_forecast_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_scenario,
     native_value, native_unit, raw_payload, extraction_method, extraction_version, pdf_page, pdf_table)
  values (retrieval, 1, repeat('c', 64), 'ERCOT Total', '2031', 'ERCOT_Adjusted',
          '498231', 'GWh', '{"value":"498231"}', 'pdf_table', 'pdf-reader/1.0.0', 12, 'Table 3')
  returning id into raw_annual;
  insert into pipeline.raw_planning_forecast_records
    (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_scenario,
     native_value, native_unit, raw_payload, extraction_method, extraction_version,
     workbook_sheet, workbook_range)
  values (retrieval, 2, repeat('d', 64), 'ERCOT Total', '2031-08-12 17:00', 'ERCOT_Adjusted',
          '143900', 'MW', '{"value":"143900"}', 'workbook_cell', 'xlsb-reader/1.0.0',
          'Hourly', 'A2:B8761')
  returning id into raw_hourly;

  -- The locator survives, and an extraction that cannot point at its own cell is refused.
  if (select workbook_cell from pipeline.raw_planning_forecast_records where id = raw_seasonal) <> 'D17'
     or (select pdf_page from pipeline.raw_planning_forecast_records where id = raw_annual) <> 12 then
    raise exception 'raw planning locators were not preserved';
  end if;
  begin
    insert into pipeline.raw_planning_forecast_records
      (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_value,
       native_unit, raw_payload, extraction_method, extraction_version)
    values (retrieval, 3, repeat('e', 64), 'ERCOT Total', '2032', '150000', 'MW', '{}', 'workbook_cell', 'x/1');
    raise exception 'an extraction without a locator was accepted';
  exception when check_violation then null;
  end;

  -- Re-extracting the same artifact is idempotent rather than duplicative.
  begin
    insert into pipeline.raw_planning_forecast_records
      (retrieval_id, row_ordinal, record_hash, native_geography, native_period, native_value,
       native_unit, raw_payload, extraction_method, extraction_version, workbook_sheet, workbook_cell)
    values (retrieval, 4, repeat('b', 64), 'ERCOT Total', '2031 Summer', '144522', 'MW', '{}',
            'workbook_cell', 'xlsb-reader/1.0.0', 'Appendix A', 'D17');
    raise exception 'duplicate extracted evidence was accepted under a new ordinal';
  exception when unique_violation then null;
  end;
  begin
    update pipeline.raw_planning_forecast_records set native_value = '0' where id = raw_seasonal;
    raise exception 'extracted planning evidence was editable';
  exception when restrict_violation then null;
  end;

  -- ------------------------------------------------------------------------------- points
  insert into pipeline.planning_forecast_points
    (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
     target_year, target_season, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
  values (v2025, s_ref, ercot_area, raw_seasonal, 'balancing_authority', 'seasonal',
          2031, 'summer', 144522, 'MW', 'non_coincident_peak', 'p50', 'net', 'included_probability_weighted');
  insert into pipeline.planning_forecast_points
    (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
     target_year, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
  values (v2025, s_ref, ercot_area, raw_annual, 'balancing_authority', 'annual',
          2031, 498231, 'GWh', 'annual_energy', 'p50', 'net', 'included_probability_weighted');
  insert into pipeline.planning_forecast_points
    (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
     target_year, target_timestamp, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
  values (v2025, s_ref, ercot_area, raw_hourly, 'balancing_authority', 'hourly_profile',
          2031, '2031-08-12T22:00:00Z', 143900, 'MW', 'hourly_load', 'p50', 'net', 'included_probability_weighted');

  -- Three grains coexist under one scenario; hourly is available and is not compulsory.
  select count(*) into n from pipeline.planning_forecast_points where scenario_id = s_ref;
  if n <> 3 then raise exception 'expected three planning points, found %', n; end if;
  select count(*) into n from pipeline.planning_forecast_points
   where scenario_id = s_ref and target_timestamp is null;
  if n <> 2 then raise exception 'annual and seasonal points acquired a timestamp'; end if;

  -- Grain validation: an annual point may not carry a season, a seasonal point must.
  begin
    insert into pipeline.planning_forecast_points
      (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
       target_year, target_season, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
    values (v2025, s_ref, ercot_area, raw_annual, 'balancing_authority', 'annual',
            2032, 'summer', 1, 'MW', 'non_coincident_peak', 'p50', 'net', 'included_all');
    raise exception 'an annual planning point accepted a season';
  exception when check_violation then null;
  end;
  begin
    insert into pipeline.planning_forecast_points
      (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
       target_year, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
    values (v2025, s_ref, ercot_area, raw_seasonal, 'balancing_authority', 'seasonal',
            2032, 1, 'MW', 'non_coincident_peak', 'p50', 'net', 'included_all');
    raise exception 'a seasonal planning point was accepted without a season';
  exception when check_violation then null;
  end;

  -- A point may not drift away from the release that published it.
  begin
    insert into pipeline.planning_forecast_points
      (vintage_id, scenario_id, grid_area_id, raw_record_id, geographic_grain, target_period_kind,
       target_year, value, unit, peak_type, weather_basis, load_basis, large_load_policy)
    values (v2026_corrected, s_ref, ercot_area, raw_annual, 'balancing_authority', 'annual',
            2032, 1, 'GWh', 'annual_energy', 'p50', 'net', 'included_all');
    raise exception 'a planning point attached to a scenario from another vintage';
  exception when check_violation then null;
  end;

  -- --------------------------------------------------- the wall between planning and PD-2
  -- A planning value cannot become an hourly operational observation: power_observations is
  -- keyed on operational raw evidence and a planning record is not any of it.
  begin
    insert into pipeline.power_observations
      (raw_power_record_id, grid_area_id, power_metric_id, period_start, period_end,
       temporal_resolution, value_mw, unit, value_status, source_effective_at, retrieved_at, quality_status)
    values (raw_seasonal, ercot_area,
            (select id from reference.power_metrics where code = 'actual_load'),
            '2031-08-12T22:00:00Z', '2031-08-12T23:00:00Z', 'hourly', 144522, 'MW', 'observed',
            '2031-08-12T22:00:00Z', '2026-09-20T09:00:00Z', 'accepted');
    raise exception 'a planning record entered the operational observation store';
  -- The operational store rejects it twice over: its reproduction trigger cannot find the id in
  -- pipeline.raw_power_records, and the foreign key would refuse it anyway.
  exception when check_violation or foreign_key_violation then null;
  end;

  -- And a planning type code cannot be filed as EIA operational evidence.
  begin
    insert into pipeline.raw_power_records
      (retrieval_id, row_ordinal, record_hash, grid_area_id, power_metric_id, native_respondent,
       native_type, native_period, period_start, period_end, native_value, native_unit,
       normalized_value_mw, normalization_status, raw_payload)
    values (retrieval, 90, repeat('f', 64), ercot_area,
            (select id from reference.power_metrics where code = 'actual_load'),
            'ERCO', 'LTLF', '2031', '2031-08-12T22:00:00Z', '2031-08-12T23:00:00Z',
            '144522', 'megawatthours', 144522, 'available', '{}');
    raise exception 'a planning type code was accepted as EIA operational evidence';
  exception when check_violation then null;
  end;
end $$;

rollback;
