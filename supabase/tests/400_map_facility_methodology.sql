-- The facility methodology, and the citation classes.
--
-- Two things are checked here that nothing else checks.
--
--   A published dot names the rulebook that admitted it. Without the column,
--   "why is this facility on the map" is answerable only by reading whatever
--   the rules happened to be on the day it was written, and a later change to
--   the rules leaves no trace on the rows decided under the old ones.
--
--   Citing a fact is not republishing a feed. The citation class is what keeps
--   ordinary attribution — a company's own page, a county permit — out of the
--   licensing gate that exists for commercial price data, without quietly
--   putting a commercial feed through the same door.
--
-- Synthetic and rolled back.
begin;

-- --------------------------------------------------- the methodology exists

do $$
declare c record; n integer;
begin
  -- The version in force, whichever it is. Which version that is belongs to the
  -- migration that approved it and to 410; what this file asserts is the shape
  -- every approved facility methodology must have.
  select v.* into c
    from reference.methodology_versions v
    join reference.methodologies m on m.id = v.methodology_id
   where m.slug = 'map-facilities' and v.status = 'approved';
  if c is null then raise exception 'the map facilities methodology has no approved version'; end if;
  -- Approved, not draft. The map already publishes facilities, and publishing
  -- under a draft is prohibited across Urdais.
  if c.effective_from is null then raise exception 'an approved methodology version carries no effective date'; end if;
  if c.document_path <> 'docs/methodology/map-facilities.md' then
    raise exception 'the methodology version points at %', c.document_path;
  end if;
  if c.content_hash is null then raise exception 'the methodology version records no content hash'; end if;

  -- One approved version, so "the rules in force" is never ambiguous.
  select count(*) into n
    from reference.methodology_versions v
    join reference.methodologies m on m.id = v.methodology_id
   where m.slug = 'map-facilities' and v.status = 'approved';
  if n <> 1 then raise exception '% approved versions of the facility methodology', n; end if;

  -- Every earlier version stays on file with its own hash, so the rules a
  -- record was approved under remain readable after the rules change.
  select count(*) into n
    from reference.methodology_versions v
    join reference.methodologies m on m.id = v.methodology_id
   where m.slug = 'map-facilities' and v.status = 'superseded' and v.content_hash is null;
  if n <> 0 then raise exception '% superseded version(s) lost their content hash', n; end if;
end $$;

-- --------------------------------------------------- a published dot names it

do $$
declare ok boolean; v_id uuid; v_ev uuid; v_method uuid;
begin
  select v.id into v_method
    from reference.methodology_versions v
    join reference.methodologies m on m.id = v.methodology_id
   where m.slug = 'map-facilities' and v.status = 'approved'
   limit 1;

  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date)
      values ('fixture-unmethodical', 'Unmethodical', 'data_center', 'high', 'published', 40, -80, 'campus', current_date);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a facility published without naming a methodology version'; end if;

  -- A research record needs none: no rule has been applied to it yet.
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state)
    values ('fixture-no-method-research', 'Research Without Methodology', 'data_center', 'high', 'research')
    returning id into v_id;
  if v_id is null then raise exception 'a research record was refused for naming no methodology'; end if;

  -- With the version named, and its evidence, the same row publishes.
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                    latitude, longitude, coordinate_precision, last_verified_date, methodology_version_id)
    values ('fixture-methodical', 'Methodical', 'data_center', 'high', 'published', 40, -80, 'campus', current_date, v_method)
    returning id into v_id;
  insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
    values (v_id, 'Fixture Publisher', 'Campus page', 'https://example.invalid/methodical', 'company_facility_page')
    returning id into v_ev;
  insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
    values (v_ev, 'location', 'Fixture Street 1');
  set constraints all immediate;
  set constraints all deferred;
end $$;

-- --------------------------------------------------- the two added evidence types

do $$
declare v_id uuid; n integer;
begin
  select id into v_id from reference.facilities where research_key = 'fixture-methodical';

  -- An economic-development authority's own announcement and financial press:
  -- both appear in the research package and neither had a home before 1.0.0.
  insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type) values
    (v_id, 'Indiana Economic Development Corporation', 'Incentive announcement', 'https://example.invalid/iedc', 'economic_development'),
    (v_id, 'A Financial Paper', 'Coverage', 'https://example.invalid/financial', 'financial_press');

  select count(*) into n from reference.facility_evidence
   where facility_id = v_id and document_type in ('economic_development', 'financial_press');
  if n <> 2 then raise exception 'the added evidence types were not storable'; end if;
end $$;

-- --------------------------------------------------- citation classes

do $$
declare t text;
begin
  -- A company stating a fact about its own facility, and a government record:
  -- both are ordinary attribution. Neither passes through the terms gate that
  -- governs commercial price feeds.
  foreach t in array array['company_facility_page', 'company_press_release'] loop
    if reference.facility_evidence_citation_class(t) <> 'public_primary_evidence' then
      raise exception '% is not classified as public primary evidence', t;
    end if;
  end loop;

  foreach t in array array['sec_filing', 'government_record', 'permit', 'planning', 'utility_filing', 'economic_development'] loop
    if reference.facility_evidence_citation_class(t) <> 'government_evidence' then
      raise exception '% is not classified as government evidence', t;
    end if;
  end loop;

  -- Press is corroboration. Naming it separately is what lets a paywalled or
  -- licence-bound outlet be reviewed without sweeping every company page in
  -- with it.
  foreach t in array array['industry_press', 'financial_press'] loop
    if reference.facility_evidence_citation_class(t) <> 'secondary_corroboration' then
      raise exception '% is not classified as secondary corroboration', t;
    end if;
  end loop;

  if reference.facility_evidence_citation_class('something_else') <> 'unclassified' then
    raise exception 'an unknown document type was given a citation class';
  end if;
end $$;

-- --------------------------------------------------- the terms gate is untouched

do $$
declare n integer;
begin
  -- The facility work adds no source interface and relaxes no existing terms
  -- state. Commercial feeds stay exactly where they were.
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved' and terms_review_state <> 'permitted';
  if n <> 0 then raise exception '% interface(s) are production-approved without permitted terms', n; end if;

  select count(*) into n from reference.facility_evidence where source_interface_id is not null;
  if n <> 0 then raise exception '% facility evidence row(s) claim a registered source interface', n; end if;

  raise notice 'map facilities methodology 1.0.0: approved, named by every published dot, citation classes hold';
end $$;

rollback;
