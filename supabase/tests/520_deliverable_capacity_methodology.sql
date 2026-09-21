-- PD-4F: what an approved methodology may and may not do.
begin;

-- Exactly one approved version, carrying the hash of the document it approved and an effective
-- date. The draft it replaced is superseded, not deleted: what it hashed is a historical record.
do $$
declare n integer;
begin
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.status = 'approved';
  if n <> 1 then raise exception 'expected one approved deliverable capacity version, found %', n; end if;

  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.version = '0.1.0-draft' and mv.status = 'superseded';
  if n <> 1 then raise exception 'the draft methodology version was not superseded'; end if;

  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.status = 'approved'
     and (mv.content_hash is null or mv.effective_from is null);
  if n <> 0 then raise exception 'an approved version carries no document hash or no effective date'; end if;
end $$;

-- A result under a version that is not approved may not be published, whatever the code believes.
do $$
declare area uuid; draft uuid; approved uuid; scen uuid; vint uuid; src uuid; retr uuid;
begin
  select id into area from reference.grid_areas where slug = 'ercot';
  select mv.id into draft from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.version = '0.1.0-draft';
  select mv.id into approved from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.version = '1.0.0';

  begin
    insert into pipeline.deliverable_capacity_results
      (methodology_version_id, grid_area_id, period_basis, target_year, target_season,
       value, unit, capacity_basis, calculation_status, publication_state)
    values (draft, area, 'seasonal', 2026, 'summer', 104850, 'MW', 'accredited', 'validated', 'published');
    raise exception 'a result under a superseded methodology version was published';
  exception when check_violation then null;
  end;

  -- An unvalidated calculation may not be offered for publication either.
  begin
    insert into pipeline.deliverable_capacity_results
      (methodology_version_id, grid_area_id, period_basis, target_year, target_season,
       value, unit, capacity_basis, calculation_status, publication_state)
    values (approved, area, 'seasonal', 2026, 'summer', 104850, 'MW', 'accredited', 'draft', 'publication_candidate');
    raise exception 'an unvalidated result was offered for publication';
  exception when check_violation then null;
  end;

  -- A derived result is always a derived quantity; it may never claim to be what a publisher said.
  begin
    insert into pipeline.deliverable_capacity_results
      (methodology_version_id, grid_area_id, quantity_kind, period_basis, target_year, target_season,
       value, unit, capacity_basis, calculation_status, publication_state)
    values (approved, area, 'capability', 'seasonal', 2026, 'summer', 104850, 'MW', 'accredited',
            'validated', 'internal_only');
    raise exception 'a derived result was filed as a source capability';
  exception when check_violation then null;
  end;

  -- A validated result under the approved version is fine, and it may be published.
  insert into pipeline.deliverable_capacity_results
    (methodology_version_id, grid_area_id, period_basis, target_year, target_season,
     value, unit, capacity_basis, calculation_status, publication_state)
  values (approved, area, 'seasonal', 2026, 'summer', 104850, 'MW', 'accredited', 'validated', 'publication_candidate');
end $$;

-- A derived result is an amount of power. A rate is a source statement, never a conclusion.
do $$
declare area uuid; approved uuid;
begin
  select id into area from reference.grid_areas where slug = 'nyiso';
  select mv.id into approved from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.version = '1.0.0';
  begin
    insert into pipeline.deliverable_capacity_results
      (methodology_version_id, grid_area_id, period_basis, target_year,
       value, unit, capacity_basis, calculation_status, publication_state)
    values (approved, area, 'capability_year', 2026, 86.4, 'percent', 'icap', 'validated', 'internal_only');
    raise exception 'a deliverable capacity result was accepted as a percentage';
  exception when check_violation then null;
  end;
end $$;

-- Markets the methodology does not approve hold no results at all. Absent, never zero.
do $$
declare n integer;
begin
  select count(*) into n from pipeline.deliverable_capacity_results r
    join reference.grid_areas a on a.id = r.grid_area_id
   where a.slug in ('caiso', 'nyiso', 'iso-ne', 'spp');
  if n <> 0 then raise exception '% result(s) exist for a market the methodology does not approve', n; end if;
end $$;

rollback;
