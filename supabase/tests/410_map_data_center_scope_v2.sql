-- Map Facilities 2.0.0: the data-centre universe opens, and nothing else does.
--
-- Two sentences are what most of these fixtures test:
--
--   A data centre is on this map because it exists, not because it runs AI.
--   A directory can find a facility and cannot place a dot.
--
-- Both fail silently in the other direction. An AI requirement left in place
-- would produce a map that simply lacks facilities, with nothing to indicate
-- they were excluded rather than absent; a directory address accepted as
-- authoritative would produce a dot at a stale or copied position that looks
-- exactly like a surveyed one.
--
-- The last third of the file is about what did *not* change: the GPU cluster,
-- fab and power rules, and 1.0.0's continued identifiability.
--
-- Synthetic and rolled back.
begin;

create or replace function pg_temp.map_methodology(p_version text default '2.0.0') returns uuid language sql stable as $$
  select v.id
    from reference.methodology_versions v
    join reference.methodologies m on m.id = v.methodology_id
   where m.slug = 'map-facilities' and v.version = p_version;
$$;

/** A publishable data centre with one tier-1 positioning source. Returns its id. */
create or replace function pg_temp.make_data_center(p_key text, p_ai text default 'unknown') returns uuid language plpgsql as $$
declare v_id uuid; v_ev uuid;
begin
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                    latitude, longitude, coordinate_precision, last_verified_date,
                                    ai_relevance, methodology_version_id)
    values (p_key, initcap(replace(p_key, '-', ' ')), 'data_center', 'high', 'published',
            52.0, 4.0, 'building', current_date, p_ai, pg_temp.map_methodology())
    returning id into v_id;
  insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
    values (v_id, 'Fixture Operator', 'Facility page', 'https://example.invalid/' || p_key, 'company_facility_page')
    returning id into v_ev;
  insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
    values (v_ev, 'location', 'Fixture Street 1');
  return v_id;
end;
$$;

-- ------------------------------------------- the methodology moved, and 1.0.0 stayed

do $$
declare v record; n integer;
begin
  select * into v from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.version = '2.0.0';
  if v is null then raise exception 'map-facilities 2.0.0 does not exist'; end if;
  if v.status <> 'approved' then raise exception '2.0.0 is % rather than approved', v.status; end if;
  if v.effective_from is null then raise exception '2.0.0 carries no effective date'; end if;

  -- 1.0.0 is superseded, not retired, and keeps its own hash and interval: it is
  -- the version the first published facilities were approved under, and a
  -- reader has to be able to find out what those rules were.
  select * into v from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.version = '1.0.0';
  if v is null then raise exception '1.0.0 was deleted rather than superseded'; end if;
  if v.status <> 'superseded' then raise exception '1.0.0 is % rather than superseded', v.status; end if;
  if v.content_hash is null then raise exception '1.0.0 lost its content hash'; end if;
  if v.effective_to is null then raise exception '1.0.0 has no end to its interval'; end if;

  -- Exactly one approved version, so "the rules in force" is unambiguous.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.status = 'approved';
  if n <> 1 then raise exception '% approved map-facilities versions', n; end if;

  -- And the migration restamped no facility.
  select count(*) into n from reference.facilities;
  if n <> 0 then raise exception '% facility row(s) exist in a bootstrapped database', n; end if;
end $$;

-- ------------------------------------------- a data centre with no AI evidence

do $$
declare v_id uuid; n integer;
begin
  -- The headline rule of 2.0.0. An ordinary colocation hall, no GPU, no AI
  -- tenant, no capacity figure, no operator: publishable.
  v_id := pg_temp.make_data_center('fixture-ordinary-colo', 'no_documented_ai');
  set constraints all immediate;

  select count(*) into n from reference.facilities
   where id = v_id and publication_state = 'published' and ai_relevance = 'no_documented_ai'
     and owner_name is null and operator_name is null;
  if n <> 1 then raise exception 'a data centre with no AI evidence and no owner was not publishable'; end if;

  select count(*) into n from reference.facility_facts where facility_id = v_id;
  if n <> 0 then raise exception 'the fixture needed a capacity fact to publish'; end if;
  -- Back to deferred before building the next fixture: an immediate trigger
  -- would judge a facility before its evidence rows exist.
  set constraints all deferred;

  -- And the default for an unassessed facility is unknown, not a negative.
  v_id := pg_temp.make_data_center('fixture-unassessed');
  set constraints all immediate;
  select count(*) into n from reference.facilities where id = v_id and ai_relevance = 'unknown';
  if n <> 1 then raise exception 'an unassessed facility did not default to unknown'; end if;
  set constraints all deferred;
end $$;

-- ------------------------------------------- a positive AI claim needs a document

do $$
declare ok boolean; v_id uuid; v_ev uuid; n integer;
begin
  ok := false;
  begin
    v_id := pg_temp.make_data_center('fixture-claimed-ai', 'documented_ai');
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a facility claimed documented AI with no source stating it'; end if;
  set constraints all deferred;
end $$;

do $$
declare v_id uuid; v_ev uuid; n integer; ok boolean;
begin
  -- With an ai_relevance claim behind it, the same classification stands.
  v_id := pg_temp.make_data_center('fixture-evidenced-ai');
  update reference.facilities set ai_relevance = 'documented_ai' where id = v_id;
  select id into v_ev from reference.facility_evidence where facility_id = v_id;
  insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
    values (v_ev, 'ai_relevance', 'operator names a GB200 deployment at this facility');
  set constraints all immediate;

  select count(*) into n from reference.facilities where id = v_id and ai_relevance = 'documented_ai';
  if n <> 1 then raise exception 'an evidenced AI classification was refused'; end if;

  -- Removing the claim that supported it fails as loudly as never having had it.
  ok := false;
  begin
    delete from reference.facility_evidence_claims where evidence_id = v_ev and claim_field = 'ai_relevance';
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'the claim behind an AI classification was removed while the classification stood'; end if;
  set constraints all deferred;
end $$;

do $$
declare v_id uuid; n integer;
begin
  -- The capability state takes the same route: marketed high density is a claim.
  v_id := pg_temp.make_data_center('fixture-high-density');
  update reference.facilities set ai_relevance = 'ai_capable_or_high_density' where id = v_id;
  insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
    select id, 'ai_relevance', 'operator markets 100 kW per rack, direct liquid cooling'
      from reference.facility_evidence where facility_id = v_id;
  set constraints all immediate;
  select count(*) into n from reference.facilities where id = v_id and ai_relevance = 'ai_capable_or_high_density';
  if n <> 1 then raise exception 'an evidenced capability classification was refused'; end if;
  set constraints all deferred;
end $$;

-- ------------------------------------------- directories find, they do not place

do $$
declare ok boolean; v_id uuid; v_ev uuid; n integer;
begin
  -- One directory entry is a lead.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date, methodology_version_id)
      values ('fixture-directory-only', 'Directory Only', 'data_center', 'high', 'published',
              52.1, 4.1, 'building', current_date, pg_temp.map_methodology())
      returning id into v_id;
    insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
      values (v_id, 'A Directory', 'Listing', 'https://example.invalid/directory-1', 'facility_directory')
      returning id into v_ev;
    insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
      values (v_ev, 'location', 'Fixture Street 9');
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a single directory entry placed a public dot'; end if;
  set constraints all deferred;
end $$;

do $$
declare ok boolean; v_id uuid; v_a uuid; v_b uuid; n integer;
begin
  -- Two rows from the *same* publisher are still one lead.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date, methodology_version_id)
      values ('fixture-one-directory-twice', 'One Directory Twice', 'data_center', 'high', 'published',
              52.2, 4.2, 'building', current_date, pg_temp.map_methodology())
      returning id into v_id;
    insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
      values (v_id, 'A Directory', 'Listing', 'https://example.invalid/d-a', 'facility_directory') returning id into v_a;
    insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
      values (v_id, 'a directory', 'Second listing', 'https://example.invalid/d-b', 'facility_directory') returning id into v_b;
    insert into reference.facility_evidence_claims (evidence_id, claim_field, statement) values
      (v_a, 'location', 'Fixture Street 9'), (v_b, 'location', 'Fixture Street 9');
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'one directory citing itself twice placed a public dot'; end if;
  set constraints all deferred;
end $$;

do $$
declare v_id uuid; v_a uuid; v_b uuid; n integer;
begin
  -- Two independent directories agreeing do place one. This is the rule that
  -- makes global coverage possible outside the markets trade press follows.
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                    latitude, longitude, coordinate_precision, last_verified_date, methodology_version_id)
    values ('fixture-two-directories', 'Two Directories', 'data_center', 'high', 'published',
            52.3, 4.3, 'building', current_date, pg_temp.map_methodology())
    returning id into v_id;
  insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
    values (v_id, 'Directory One', 'Listing', 'https://example.invalid/one', 'facility_directory') returning id into v_a;
  insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
    values (v_id, 'Directory Two', 'Listing', 'https://example.invalid/two', 'facility_directory') returning id into v_b;
  insert into reference.facility_evidence_claims (evidence_id, claim_field, statement) values
    (v_a, 'location', 'Fixture Street 9'), (v_b, 'coordinates', 'Fixture Street 9, 52.3 4.3');
  set constraints all immediate;

  select count(*) into n from reference.facilities where id = v_id and publication_state = 'published';
  if n <> 1 then raise exception 'two independent directories did not place a dot'; end if;
  set constraints all deferred;
end $$;

do $$
declare t text; n smallint;
begin
  -- The tiers themselves.
  foreach t in array array['company_facility_page', 'company_press_release', 'sec_filing', 'government_record',
                           'permit', 'planning', 'utility_filing', 'economic_development'] loop
    if reference.facility_evidence_source_tier(t) <> 1 then raise exception '% is not tier 1', t; end if;
  end loop;
  foreach t in array array['industry_press', 'financial_press', 'property_record'] loop
    if reference.facility_evidence_source_tier(t) <> 2 then raise exception '% is not tier 2', t; end if;
  end loop;
  if reference.facility_evidence_source_tier('facility_directory') <> 3 then raise exception 'a directory is not tier 3'; end if;
  -- An unknown type falls to tier 3, which is the cautious direction: it may
  -- discover, it may not place.
  if reference.facility_evidence_source_tier('something_new') <> 3 then raise exception 'an unknown document type was trusted'; end if;
  if reference.facility_evidence_citation_class('facility_directory') <> 'structured_directory' then
    raise exception 'a directory is not classified as a structured directory';
  end if;
end $$;

-- ------------------------------------------- city precision still never publishes

do $$
declare ok boolean;
begin
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date, methodology_version_id)
      values ('fixture-city-2', 'City Centroid', 'data_center', 'high', 'published',
              52.4, 4.4, 'city', current_date, pg_temp.map_methodology());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'broadening the data-centre scope also admitted city centroids'; end if;

  -- And a street address nobody has geocoded is still a valid research record.
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state, coordinate_precision)
    values ('fixture-ungeocoded', 'Known Street, No Pin', 'data_center', 'high', 'research', 'street');
end $$;

-- ------------------------------------------- nothing else broadened

do $$
declare ok boolean; v_power uuid; v_ev uuid;
begin
  -- The power rule is exactly as strict as it was: a generator with no
  -- evidenced compute link does not publish, whatever 2.0.0 did for data centres.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date, methodology_version_id)
      values ('fixture-plant-v2', 'Fixture Plant', 'power_infrastructure', 'high', 'published',
              41.0, -76.0, 'campus', current_date, pg_temp.map_methodology())
      returning id into v_power;
    insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
      values (v_power, 'Fixture Utility', 'Plant page', 'https://example.invalid/plant-v2', 'company_facility_page')
      returning id into v_ev;
    insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
      values (v_ev, 'location', 'Salem Township');
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'the power rule was loosened along with the data-centre scope'; end if;
  set constraints all deferred;
end $$;

do $$
declare n integer;
begin
  -- The categories are still exactly four, and the retired one is still retired.
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence)
      values ('fixture-old-taxonomy-2', 'Old Taxonomy', 'compute_cluster', 'high');
    raise exception 'compute_cluster became storable again';
  exception when check_violation then null;
  end;

  -- AI relevance is not a publication gate in either direction: the published
  -- fixtures above span unknown, no_documented_ai and documented_ai.
  select count(distinct ai_relevance) into n from reference.facilities where publication_state = 'published';
  if n < 3 then raise exception 'the published fixtures do not span AI relevance states (%)' , n; end if;

  raise notice 'map facilities 2.0.0: existence admits a data centre, directories do not place dots, nothing else moved';
end $$;

rollback;
