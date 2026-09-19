-- PD-2 physical identity, versioned membership, evidence and revision invariants.
begin;

do $$
declare n integer; codes text[];
begin
  select count(*), array_agg(eia_ba_code order by eia_ba_code) into n, codes from reference.grid_areas;
  if n <> 7 then raise exception 'expected seven PD-2 grid areas, found %', n; end if;
  if codes <> array['CISO','ERCO','ISNE','MISO','NYIS','PJM','SWPP'] then
    raise exception 'unexpected EIA BA codes: %', codes;
  end if;
  select count(*) into n from reference.grid_area_memberships gm
    join reference.grid_universe_versions uv on uv.id=gm.universe_version_id
    join reference.grid_universes u on u.id=uv.universe_id
   where u.slug='seven_organized_us_wholesale_markets' and uv.version=1;
  if n <> 7 then raise exception 'V1 membership has % areas', n; end if;
  if exists (select 1 from reference.power_metrics where code in ('planning_demand_forecast','deliverable_capacity','delivery_gap')) then
    raise exception 'PD-2 contains an excluded canonical metric';
  end if;
  if exists (select 1 from reference.grid_areas where id::text like 'power-%') then
    raise exception 'physical grid identity reused a UEPI instrument key';
  end if;
end $$;

-- A second membership version can differ without rewriting V1.
do $$
declare u uuid; v2 uuid := '93000000-0000-4000-8300-000000000003'; n1 integer; n2 integer;
begin
  select id into u from reference.grid_universes where slug='seven_organized_us_wholesale_markets';
  update reference.grid_universe_versions set effective_to='2030-01-01T00:00:00Z'
   where universe_id=u and version=1;
  insert into reference.grid_universe_versions (id,universe_id,version,effective_from)
    values (v2,u,2,'2030-01-01T00:00:00Z');
  insert into reference.grid_area_memberships (universe_version_id,grid_area_id,ordinal)
    select v2,grid_area_id,ordinal from reference.grid_area_memberships
     where universe_version_id='93000000-0000-4000-8300-000000000002' and ordinal <= 6;
  select count(*) into n1 from reference.grid_area_memberships where universe_version_id='93000000-0000-4000-8300-000000000002';
  select count(*) into n2 from reference.grid_area_memberships where universe_version_id=v2;
  if n1 <> 7 or n2 <> 6 then raise exception 'versioning rewrote history: V1 %, V2 %', n1, n2; end if;
end $$;

-- Raw evidence remains while a changed report supersedes canonical current state.
do $$
declare iface uuid; grant_id uuid; retrieval uuid; area uuid; metric uuid; raw1 uuid; raw2 uuid;
        old_obs uuid := '93000000-0000-4000-8500-000000000001';
        new_obs uuid := '93000000-0000-4000-8500-000000000002';
        n integer; latest numeric;
begin
  select id into iface from reference.source_interfaces where slug='eia-930-region-data';
  select id into grant_id from reference.permission_grants where source_interface_id=iface;
  select id into area from reference.grid_areas where eia_ba_code='ERCO';
  select id into metric from reference.power_metrics where code='actual_load';
  insert into pipeline.source_retrievals
    (source_interface_id,idempotency_key,requested_at,completed_at,request_method,request_url,
     response_status,response_hash,record_count,enumeration_assessment,retrieval_purpose,permission_grant_id)
  values (iface,'pd2-fixture','2026-09-19T13:00:00Z','2026-09-19T13:00:01Z','GET','https://api.eia.gov/',
          200,repeat('a',64),2,'complete','production',grant_id) returning id into retrieval;
  insert into pipeline.raw_power_records
    (retrieval_id,row_ordinal,record_hash,grid_area_id,power_metric_id,native_respondent,native_type,
     native_period,period_start,period_end,native_value,native_unit,normalized_value_mw,normalization_status,raw_payload)
  values (retrieval,0,repeat('b',64),area,metric,'ERCO','D','2026-09-19T11','2026-09-19T11:00:00Z','2026-09-19T12:00:00Z','53599','megawatthours',53599,'available','{"value":"53599"}') returning id into raw1;
  insert into pipeline.raw_power_records
    (retrieval_id,row_ordinal,record_hash,grid_area_id,power_metric_id,native_respondent,native_type,
     native_period,period_start,period_end,native_value,native_unit,normalized_value_mw,normalization_status,raw_payload)
  values (retrieval,1,repeat('c',64),area,metric,'ERCO','D','2026-09-19T11','2026-09-19T11:00:00Z','2026-09-19T12:00:00Z','53601','megawatthours',53601,'available','{"value":"53601"}') returning id into raw2;
  insert into pipeline.power_observations
    (id,raw_power_record_id,grid_area_id,power_metric_id,period_start,period_end,temporal_resolution,
     value_mw,unit,value_status,source_effective_at,retrieved_at,quality_status)
  values (old_obs,raw1,area,metric,'2026-09-19T11:00:00Z','2026-09-19T12:00:00Z','hourly',53599,'MW','observed','2026-09-19T11:00:00Z','2026-09-19T13:00:00Z','accepted');
  update pipeline.power_observations set superseded_by_id=new_obs,superseded_at='2026-09-19T14:00:00Z',
    supersession_reason='fixture revision' where id=old_obs;
  insert into pipeline.power_observations
    (id,raw_power_record_id,grid_area_id,power_metric_id,period_start,period_end,temporal_resolution,
     value_mw,unit,value_status,source_effective_at,retrieved_at,quality_status)
  values (new_obs,raw2,area,metric,'2026-09-19T11:00:00Z','2026-09-19T12:00:00Z','hourly',53601,'MW','observed','2026-09-19T11:00:00Z','2026-09-19T14:00:00Z','accepted');
  select count(*) into n from pipeline.power_observations where grid_area_id=area and period_start='2026-09-19T11:00:00Z';
  select value_mw into latest from pipeline.power_observations where grid_area_id=area and period_start='2026-09-19T11:00:00Z' and superseded_by_id is null;
  if n <> 2 or latest <> 53601 then raise exception 'revision history/current resolution failed: rows %, latest %', n, latest; end if;
  select count(*) into n from pipeline.raw_power_records where retrieval_id=retrieval;
  if n <> 2 then raise exception 'revision discarded raw evidence'; end if;
end $$;

rollback;
