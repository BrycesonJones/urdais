-- The map's facility foundation: what the database refuses to hold.
--
-- Three sentences are what most of these fixtures test:
--
--   A facility that cannot be placed is a record, not a dot.
--   Two entities at one address are two entities.
--   A power station is on this map because of what it powers, or not at all.
--
-- Each of those fails silently in application code. A facility published with
-- no coordinates renders as nothing and looks like a filter working; a
-- deduplicating importer that merged LUMI into CSC Kajaani would produce one
-- plausible row where there are two real entities; a power station published
-- without its compute link looks exactly like one with it. So each rule is a
-- constraint or a commit-time trigger here, and every fixture below tries to
-- write the wrong row and expects to be refused.
--
-- Synthetic throughout, and rolled back; no researched facility is written.
begin;

-- --------------------------------------------------- nothing is seeded

do $$
declare n integer;
begin
  select count(*) into n from reference.facilities;
  if n <> 0 then raise exception '% facility row(s) are seeded by migration; the importer is the only way in', n; end if;
  select count(*) into n from reference.facility_evidence;
  if n <> 0 then raise exception '% evidence row(s) are seeded by migration', n; end if;
  select count(*) into n from reference.facility_relationships;
  if n <> 0 then raise exception '% relationship row(s) are seeded by migration', n; end if;
end $$;

-- --------------------------------------------------- the canonical record

do $$
declare ok boolean; v_id uuid;
begin
  -- The taxonomy rename is enforced, not merely documented. `compute_cluster`
  -- was the old value and must not be storable.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence)
      values ('fixture-old-taxonomy', 'Old Taxonomy', 'compute_cluster', 'high');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'the retired category compute_cluster was accepted'; end if;

  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence)
      values ('Fixture Key', 'Bad Key', 'data_center', 'high');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a research key that is not kebab-case was accepted'; end if;

  -- Impossible coordinates.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, latitude, longitude, coordinate_precision)
      values ('fixture-bad-lat', 'Bad Latitude', 'data_center', 'high', 91, 0, 'campus');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a latitude of 91 was accepted'; end if;

  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, latitude, longitude, coordinate_precision)
      values ('fixture-bad-lon', 'Bad Longitude', 'data_center', 'high', 0, -181, 'campus');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a longitude of -181 was accepted'; end if;

  -- Half a position is not a position.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, latitude, coordinate_precision)
      values ('fixture-half-position', 'Half Position', 'data_center', 'high', 40, 'campus');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a latitude with no longitude was accepted'; end if;

  -- A position whose precision is unstated cannot be judged.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, latitude, longitude)
      values ('fixture-no-precision', 'No Precision', 'data_center', 'high', 40, -80);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'coordinates with no stated precision were accepted'; end if;

  -- A researched facility with no coordinates at all is entirely legitimate.
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state)
    values ('fixture-research-only', 'Research Only', 'data_center', 'high', 'research')
    returning id into v_id;
  if v_id is null then raise exception 'a facility without coordinates was refused'; end if;
end $$;

-- --------------------------------------------------- publication gates

do $$
declare ok boolean;
begin
  -- No position: published is refused by the row-level constraint.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state, last_verified_date)
      values ('fixture-publish-no-coords', 'No Coordinates', 'data_center', 'high', 'published', current_date);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a facility with no coordinates was published'; end if;

  -- A city centroid is a location, not a position.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date)
      values ('fixture-publish-city', 'City Centroid', 'data_center', 'high', 'published', 40, -80, 'city', current_date);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a city-precision facility was published'; end if;

  -- Low confidence is a research state by definition.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date)
      values ('fixture-publish-low', 'Low Confidence', 'data_center', 'low', 'published', 40, -80, 'campus', current_date);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a low-confidence facility was published'; end if;

  -- A cancelled project is not current infrastructure.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, lifecycle_status, last_verified_date)
      values ('fixture-publish-cancelled', 'Cancelled', 'data_center', 'high', 'published', 40, -80, 'campus', 'cancelled', current_date);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a cancelled facility was published'; end if;

  -- And a published record says when it was last checked.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision)
      values ('fixture-publish-unverified', 'No Verification Date', 'data_center', 'high', 'published', 40, -80, 'campus');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a facility with no verification date was published'; end if;
end $$;

-- --------------------------------------------------- publication needs evidence

-- The evidence gates are deferred to commit, so each is exercised in its own
-- subtransaction: the failure arrives at the savepoint release, not at the
-- INSERT.
do $$
declare ok boolean; v_id uuid; v_ev uuid;
begin
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date)
      values ('fixture-publish-no-evidence', 'No Evidence', 'data_center', 'high', 'published', 40, -80, 'campus', current_date);
    -- Force the deferred constraint to be judged inside this block.
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a facility was published with no source behind it'; end if;
  set constraints all deferred;
end $$;

do $$
declare ok boolean; v_id uuid; v_ev uuid;
begin
  -- Evidence that supports something other than the location does not place a dot.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date)
      values ('fixture-publish-wrong-claim', 'Wrong Claim', 'data_center', 'high', 'published', 40, -80, 'campus', current_date)
      returning id into v_id;
    insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
      values (v_id, 'Fixture Publisher', 'A capacity note', 'https://example.invalid/capacity', 'company_press_release')
      returning id into v_ev;
    insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
      values (v_ev, 'capacity', '400 MW critical IT');
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a facility was published on evidence that never placed it'; end if;
  set constraints all deferred;
end $$;

-- --------------------------------------------------- two entities at one address

do $$
declare v_host uuid; v_cluster uuid; v_ev_host uuid; v_ev_cluster uuid; n integer;
begin
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                    latitude, longitude, coordinate_precision, last_verified_date)
    values ('fixture-host-campus', 'Fixture Host Campus', 'data_center', 'high', 'published',
            64.2319866, 27.691477, 'building', current_date)
    returning id into v_host;
  insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
    values (v_host, 'Fixture Operator', 'Campus page', 'https://example.invalid/campus', 'company_facility_page')
    returning id into v_ev_host;
  insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
    values (v_ev_host, 'location', 'Fixture Street 15');

  -- The same coordinates, deliberately. A GPU cluster inside a data center is a
  -- distinct entity, and nothing in this schema merges the two.
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                    latitude, longitude, coordinate_precision, last_verified_date)
    values ('fixture-hosted-cluster', 'Fixture Hosted Cluster', 'gpu_compute_cluster', 'high', 'published',
            64.2319866, 27.691477, 'building', current_date)
    returning id into v_cluster;
  insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
    values (v_cluster, 'Fixture Consortium', 'System page', 'https://example.invalid/system', 'government_record')
    returning id into v_ev_cluster;
  insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
    values (v_ev_cluster, 'coordinates', 'Fixture Street 15, same building as the host');

  select count(*) into n from reference.facilities
   where latitude = 64.2319866 and longitude = 27.691477;
  if n <> 2 then raise exception 'two entities at one position collapsed to % row(s)', n; end if;

  insert into reference.facility_relationships (from_facility_id, to_facility_id, relationship_type, evidence_id)
    values (v_cluster, v_host, 'hosted_by', v_ev_cluster);

  select count(*) into n from reference.facility_relationships
   where from_facility_id = v_cluster and to_facility_id = v_host and relationship_type = 'hosted_by';
  if n <> 1 then raise exception 'the hosted_by edge was not stored'; end if;
end $$;

-- --------------------------------------------------- relationship shape

do $$
declare ok boolean; v_a uuid; v_b uuid;
begin
  select id into v_a from reference.facilities where research_key = 'fixture-host-campus';
  select id into v_b from reference.facilities where research_key = 'fixture-hosted-cluster';

  ok := false;
  begin
    insert into reference.facility_relationships (from_facility_id, to_facility_id, relationship_type)
      values (v_a, v_a, 'same_campus');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a facility was related to itself'; end if;

  ok := false;
  begin
    insert into reference.facility_relationships (from_facility_id, to_facility_id, relationship_type)
      values (v_a, v_b, 'powered_by');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an inverse relationship type was accepted; edges are stored once, in the canonical direction'; end if;

  -- A symmetric type describes an unordered pair, so it cannot be stored twice.
  insert into reference.facility_relationships (from_facility_id, to_facility_id, relationship_type)
    values (v_a, v_b, 'same_campus');
  ok := false;
  begin
    insert into reference.facility_relationships (from_facility_id, to_facility_id, relationship_type)
      values (v_b, v_a, 'same_campus');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'one unordered pair was stored as two same_campus edges'; end if;
end $$;

-- --------------------------------------------------- facts need a source

do $$
declare ok boolean; v_id uuid; v_ev uuid;
begin
  select id into v_id from reference.facilities where research_key = 'fixture-host-campus';
  select id into v_ev from reference.facility_evidence where facility_id = v_id;

  -- The rule the facts table exists for.
  ok := false;
  begin
    insert into reference.facility_facts (facility_id, fact_key, numeric_value, unit)
      values (v_id, 'critical_it_capacity_mw', 400, 'MW');
  exception when not_null_violation then ok := true;
  end;
  if not ok then raise exception 'a megawatt figure was stored with no document behind it'; end if;

  ok := false;
  begin
    insert into reference.facility_facts (facility_id, fact_key, numeric_value, text_value, evidence_id)
      values (v_id, 'confused_fact', 400, 'four hundred', v_ev);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a fact carrying both a number and text was accepted'; end if;

  insert into reference.facility_facts (facility_id, fact_key, numeric_value, unit, evidence_id)
    values (v_id, 'critical_it_capacity_mw', 400, 'MW', v_ev);
end $$;

-- --------------------------------------------------- the power rule

do $$
declare ok boolean; v_power uuid; v_ev uuid;
begin
  -- A power station with no evidenced link to compute does not publish, however
  -- well sourced its own existence is.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date)
      values ('fixture-lonely-plant', 'Fixture Lonely Plant', 'power_infrastructure', 'high', 'published',
              41.0922705, -76.1479523, 'campus', current_date)
      returning id into v_power;
    insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
      values (v_power, 'Fixture Utility', 'Plant page', 'https://example.invalid/plant', 'company_facility_page')
      returning id into v_ev;
    insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
      values (v_ev, 'location', 'Salem Township');
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a power station was published with nothing tying it to compute'; end if;
  set constraints all deferred;
end $$;

do $$
declare ok boolean; v_power uuid; v_other uuid; v_ev uuid; n integer;
begin
  -- An edge into another power asset is a grid fact, not an AI-economy fact.
  ok := false;
  begin
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                      latitude, longitude, coordinate_precision, last_verified_date)
      values ('fixture-plant-a', 'Fixture Plant A', 'power_infrastructure', 'high', 'published',
              41.09, -76.14, 'campus', current_date)
      returning id into v_power;
    insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state)
      values ('fixture-plant-b', 'Fixture Plant B', 'power_infrastructure', 'high', 'research')
      returning id into v_other;
    insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
      values (v_power, 'Fixture Utility', 'Plant A page', 'https://example.invalid/plant-a', 'company_facility_page')
      returning id into v_ev;
    insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
      values (v_ev, 'location', 'Somewhere');
    insert into reference.facility_relationships (from_facility_id, to_facility_id, relationship_type, evidence_id)
      values (v_power, v_other, 'supplies_power_to', v_ev);
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a power station was published for supplying another power station'; end if;
  set constraints all deferred;
end $$;

do $$
declare v_power uuid; v_load uuid; v_ev uuid; ok boolean; n integer;
begin
  -- The shape that does publish: an evidenced supply edge into a data center.
  -- The load itself has no coordinates and is therefore a research record — the
  -- rule is about the relationship, not about whether the consumer is drawn.
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state)
    values ('fixture-powered-campus', 'Fixture Powered Campus', 'data_center', 'high', 'research')
    returning id into v_load;
  insert into reference.facilities (research_key, canonical_name, category, confidence, publication_state,
                                    latitude, longitude, coordinate_precision, last_verified_date)
    values ('fixture-linked-plant', 'Fixture Linked Plant', 'power_infrastructure', 'high', 'published',
            41.0922705, -76.1479523, 'campus', current_date)
    returning id into v_power;
  insert into reference.facility_evidence (facility_id, publisher, title, document_url, document_type)
    values (v_power, 'Fixture Utility', 'Powering data', 'https://example.invalid/powering-data', 'company_facility_page')
    returning id into v_ev;
  insert into reference.facility_evidence_claims (evidence_id, claim_field, statement) values
    (v_ev, 'location', 'Salem Township, Luzerne County'),
    (v_ev, 'compute_relationship', 'co-located data center campus powered by this station');
  insert into reference.facility_relationships (from_facility_id, to_facility_id, relationship_type, evidence_id)
    values (v_power, v_load, 'supplies_power_to', v_ev);
  set constraints all immediate;

  select count(*) into n from reference.facilities where research_key = 'fixture-linked-plant' and publication_state = 'published';
  if n <> 1 then raise exception 'an evidenced power link did not permit publication'; end if;

  -- And removing the link that justified it fails as loudly as never having had it.
  ok := false;
  begin
    delete from reference.facility_relationships where from_facility_id = v_power and to_facility_id = v_load;
    set constraints all immediate;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'the relationship justifying a publication was removed while the publication stood'; end if;
  set constraints all deferred;
end $$;

-- --------------------------------------------------- what the public read path selects

do $$
declare n integer;
begin
  -- The map-eligibility predicate the read path shares with the write gate.
  if reference.facility_is_map_eligible(40, -80, 'city') then
    raise exception 'a city centroid was judged map-eligible';
  end if;
  if reference.facility_is_map_eligible(null, null, 'campus') then
    raise exception 'a facility with no coordinates was judged map-eligible';
  end if;
  if not reference.facility_is_map_eligible(40, -80, 'campus') then
    raise exception 'a campus-precision position was judged ineligible';
  end if;

  if reference.facility_is_compute_category('power_infrastructure') then
    raise exception 'power infrastructure counts as compute for the power rule';
  end if;
  if not reference.facility_is_compute_category('gpu_compute_cluster') then
    raise exception 'a GPU compute cluster does not count as compute';
  end if;

  -- The research records written above are invisible to the published set.
  select count(*) into n from reference.facilities
   where publication_state = 'published'
     and reference.facility_is_map_eligible(latitude, longitude, coordinate_precision)
     and research_key in ('fixture-research-only', 'fixture-powered-campus');
  if n <> 0 then raise exception '% research record(s) reached the published, placed set', n; end if;

  raise notice 'map facility foundation: publication, position, provenance and the power rule hold';
end $$;

rollback;
