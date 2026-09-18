-- Public research is a verification state, not a category or a weakened
-- published state. Synthetic and rolled back.
begin;

do $$
declare n integer; definition text; version text;
begin
  select mv.version into version
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.status = 'approved';
  if version <> '2.1.0' then raise exception 'approved facility methodology is %, expected 2.1.0', version; end if;

  select indexdef into definition from pg_indexes
   where schemaname = 'reference' and indexname = 'facilities_public_map_candidates_idx';
  if definition is null or definition not like '%publication_state%research%' then
    raise exception 'public-map candidate index does not cover research records: %', definition;
  end if;

  insert into reference.facilities
    (research_key, canonical_name, category, confidence, publication_state,
     latitude, longitude, coordinate_precision, last_verified_date)
  values
    ('fixture-public-research', 'Public Research Facility', 'data_center', 'medium', 'research',
     40, -80, 'street', current_date);

  select count(*) into n from reference.facilities
   where research_key = 'fixture-public-research'
     and publication_state = 'research'
     and reference.facility_is_map_eligible(latitude, longitude, coordinate_precision);
  if n <> 1 then raise exception 'a map-eligible research record is not representable'; end if;

  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state)
      values ('fixture-research-category', 'Not a Category', 'research', 'medium', 'research');
    raise exception 'research became an infrastructure category';
  exception when check_violation then null;
  end;

  raise notice 'map facilities 2.1.0: safe research may be public, research is not a category';
end $$;

rollback;
