-- Map Facilities 2.0.0: the data-centre universe opens, and AI becomes
-- enrichment rather than a gate.
--
-- Until now a data centre was on this map because it mattered to AI. That was
-- the right first cut — it produced a high-signal set from a standing start —
-- and it is the wrong long-run rule, for a reason the first pass made obvious:
-- it makes the map a picture of *what Urdais already knows about AI* rather
-- than of the physical layer AI is built on. A conventional colocation hall
-- that converts to GPUs next year was invisible until the day it converted, and
-- then appeared as if it had been built overnight.
--
-- So the inclusion criterion becomes existence, and AI relevance becomes a
-- separately evidenced property of a facility that is already on the map.
--
-- Three things follow, and each needs the database's help.
--
--   1. **Knowing nothing has two shapes.** "We looked and the sources say
--      nothing about AI" and "nobody has looked" are different facts, and a
--      single nullable flag would collapse them. Four states, and a trigger
--      insisting that the two positive ones are backed by a cited claim.
--
--   2. **Finding the world means using directories.** A global data-centre
--      inventory cannot be built from operator pages alone; directories are how
--      you discover that a facility exists. They are also stale, duplicated and
--      occasionally wrong about where a building is. So documents get tiers,
--      and a directory may propose a facility while never, by itself, placing a
--      public dot.
--
--   3. **Nothing else broadens.** GPU clusters, fabs and power infrastructure
--      keep exactly the rules they had. The power rule in particular is
--      untouched: generation is on this map because of what it powers.
--
-- No facility row is rewritten by this migration. The 78 researched records
-- keep their data and their publication states, and the ones published under
-- 1.0.0 keep saying so until an import re-approves them under the new rules.

-- ---------------------------------------------------------------------------
-- Two document types, and the tiers
-- ---------------------------------------------------------------------------

alter table reference.facility_evidence
  drop constraint facility_evidence_type_allowed;

alter table reference.facility_evidence
  add constraint facility_evidence_type_allowed check (document_type in (
    'company_facility_page',
    'company_press_release',
    'sec_filing',
    'government_record',
    'permit',
    'planning',
    'utility_filing',
    'economic_development',
    'industry_press',
    'financial_press',
    -- Added in 2.0.0 for broad data-centre research.
    'property_record',
    'facility_directory'
  ));

-- How much weight a document carries on its own.
--   1  the operator, the owner or the state saying so
--   2  a publication or a property record reporting it
--   3  a structured aggregator: a data-centre directory, a peering database
create or replace function reference.facility_evidence_source_tier(p_document_type text)
returns smallint
language sql
immutable
as $$
  select case
    when p_document_type in ('company_facility_page', 'company_press_release', 'sec_filing',
                             'government_record', 'permit', 'planning', 'utility_filing',
                             'economic_development') then 1::smallint
    when p_document_type in ('industry_press', 'financial_press', 'property_record') then 2::smallint
    when p_document_type in ('facility_directory') then 3::smallint
    else 3::smallint
  end;
$$;

comment on function reference.facility_evidence_source_tier(text) is
  'Evidential weight of a facility document: 1 primary/authoritative, 2 strong corroboration, 3 structured directory. An unknown type is treated as tier 3, which is the cautious direction.';

create or replace function reference.facility_evidence_citation_class(p_document_type text)
returns text
language sql
immutable
as $$
  select case
    when p_document_type in ('company_facility_page', 'company_press_release') then 'public_primary_evidence'
    when p_document_type in ('sec_filing', 'government_record', 'permit', 'planning', 'utility_filing', 'economic_development')
      then 'government_evidence'
    when p_document_type in ('industry_press', 'financial_press', 'property_record') then 'secondary_corroboration'
    when p_document_type in ('facility_directory') then 'structured_directory'
    else 'unclassified'
  end;
$$;

-- ---------------------------------------------------------------------------
-- The claim fields AI relevance and capability stand on
-- ---------------------------------------------------------------------------

alter table reference.facility_evidence_claims
  drop constraint facility_evidence_claims_field_allowed;

alter table reference.facility_evidence_claims
  add constraint facility_evidence_claims_field_allowed check (claim_field in (
    'identity',
    'location',
    'coordinates',
    'owner',
    'operator',
    'lifecycle_status',
    'dates',
    'capacity',
    'compute_hardware',
    'power',
    'compute_relationship',
    'contact',
    -- Added in 2.0.0.
    'ai_relevance',
    'cooling'
  ));

comment on column reference.facility_evidence_claims.claim_field is
  'Which part of the facility record this document supports. ai_relevance is what a positive AI classification stands on: a named GPU deployment, an AI tenant, an AI-cloud contract, or marketed high-density or liquid-cooled capability.';

-- ---------------------------------------------------------------------------
-- AI relevance
-- ---------------------------------------------------------------------------

alter table reference.facilities
  add column ai_relevance text not null default 'unknown'
    constraint facilities_ai_relevance_allowed
    check (ai_relevance in ('documented_ai', 'ai_capable_or_high_density', 'no_documented_ai', 'unknown'));

comment on column reference.facilities.ai_relevance is
  'What Urdais knows about this facility''s relationship to AI. Enrichment, never an inclusion criterion. no_documented_ai means the sources reviewed say nothing about AI — it does not mean the facility cannot run AI, and size is never evidence of capability. unknown means nobody has looked.';

create index facilities_ai_relevance_idx on reference.facilities (ai_relevance)
  where ai_relevance <> 'unknown';

-- A positive classification is a claim about the world and needs a document,
-- exactly as a megawatt figure does. The negative and the unresearched states
-- need none, because neither asserts anything about the facility.
create or replace function reference.assert_facility_ai_relevance(p_facility_id uuid)
returns void
language plpgsql
as $$
declare
  f record;
  n integer;
begin
  select * into f from reference.facilities where id = p_facility_id;
  if f is null or f.ai_relevance not in ('documented_ai', 'ai_capable_or_high_density') then return; end if;

  select count(*) into n
    from reference.facility_evidence e
    join reference.facility_evidence_claims c on c.evidence_id = e.id
   where e.facility_id = f.id
     and c.claim_field = 'ai_relevance';
  if n = 0 then
    raise exception 'facility % claims AI relevance "%" with no source that states it',
      f.research_key, f.ai_relevance
      using errcode = 'restrict_violation';
  end if;
end;
$$;

comment on function reference.assert_facility_ai_relevance(uuid) is
  'A documented_ai or ai_capable_or_high_density classification requires at least one cited ai_relevance claim. The negative and unknown states assert nothing and need nothing.';

create or replace function reference.facilities_ai_relevance_guard()
returns trigger
language plpgsql
as $$
begin
  perform reference.assert_facility_ai_relevance(new.id);
  return null;
end;
$$;

create or replace function reference.facility_claim_ai_relevance_guard()
returns trigger
language plpgsql
as $$
declare v_facility uuid;
begin
  select facility_id into v_facility from reference.facility_evidence
   where id = coalesce(new.evidence_id, old.evidence_id);
  if v_facility is not null then perform reference.assert_facility_ai_relevance(v_facility); end if;
  return null;
end;
$$;

create constraint trigger facilities_ai_relevance_rules
  after insert or update on reference.facilities
  deferrable initially deferred
  for each row execute function reference.facilities_ai_relevance_guard();

create constraint trigger facility_evidence_claims_ai_relevance_rules
  after insert or update or delete on reference.facility_evidence_claims
  deferrable initially deferred
  for each row execute function reference.facility_claim_ai_relevance_guard();

-- ---------------------------------------------------------------------------
-- What may place a public dot
-- ---------------------------------------------------------------------------

-- Version 1.0.0 required a published facility to carry some location or
-- coordinates claim. 2.0.0 keeps that and adds the tier rule, because the
-- universe now includes facilities found through directories:
--
--   one Tier 1 or Tier 2 document placing it, OR two Tier 3 documents from
--   *different publishers* placing it.
--
-- Two directories are required rather than two rows because directories copy
-- from each other; one lead wearing two names is still one lead. A single
-- directory entry is enough to record a facility and never enough to draw it.
create or replace function reference.assert_facility_publishable(p_facility_id uuid)
returns void
language plpgsql
as $$
declare
  f record;
  n integer;
  strong integer;
  directories integer;
begin
  select * into f from reference.facilities where id = p_facility_id;
  -- Gone, or never published: there is nothing to defend.
  if f is null or f.publication_state <> 'published' then return; end if;

  -- A published facility stands on cited documents.
  select count(*) into n from reference.facility_evidence where facility_id = f.id;
  if n = 0 then
    raise exception 'facility % is published with no evidence', f.research_key
      using errcode = 'restrict_violation';
  end if;

  -- And on a document that placed it. A dot is a positional claim.
  select count(*) filter (where reference.facility_evidence_source_tier(e.document_type) <= 2),
         count(distinct lower(btrim(e.publisher))) filter (where reference.facility_evidence_source_tier(e.document_type) = 3)
    into strong, directories
    from reference.facility_evidence e
    join reference.facility_evidence_claims c on c.evidence_id = e.id
   where e.facility_id = f.id
     and c.claim_field in ('location', 'coordinates');

  if strong = 0 and directories = 0 then
    raise exception 'facility % is published with no source for its location', f.research_key
      using errcode = 'restrict_violation';
  end if;
  if strong = 0 and directories < 2 then
    raise exception
      'facility % is placed only by a single directory; a directory entry is a lead, and a public dot needs a primary or corroborating source, or two independent directories',
      f.research_key
      using errcode = 'restrict_violation';
  end if;

  -- The power rule, unchanged by 2.0.0. Generation is on this map only where a
  -- document ties it to compute; a large plant near a data center is not
  -- evidence of one.
  if f.category = 'power_infrastructure' then
    select count(*) into n
      from reference.facility_relationships r
      join reference.facilities t on t.id = r.to_facility_id
     where r.from_facility_id = f.id
       and r.relationship_type = 'supplies_power_to'
       and r.evidence_id is not null
       and reference.facility_is_compute_category(t.category);
    if n = 0 then
      raise exception
        'power infrastructure % is published without an evidenced supplies_power_to relationship to a compute facility',
        f.research_key
        using errcode = 'restrict_violation';
    end if;
  end if;
end;
$$;

comment on function reference.assert_facility_publishable(uuid) is
  'Commit-time publication gates that span rows: a published facility has evidence; it has admissible positioning evidence (one tier 1-2 document, or two independent directories); and - when it is power infrastructure - an evidenced supply relationship into compute. AI relevance is never among them.';

-- ---------------------------------------------------------------------------
-- Methodology 2.0.0
-- ---------------------------------------------------------------------------

-- Assert what 1.0.0 currently governs before superseding it. If something had
-- already restamped these rows, superseding 1.0.0 would orphan records that
-- claim it.
do $$
declare n integer;
begin
  select count(*) into n
    from reference.facilities f
    join reference.methodology_versions v on v.id = f.methodology_version_id
    join reference.methodologies m on m.id = v.methodology_id
   where m.slug = 'map-facilities' and v.version <> '1.0.0';
  if n <> 0 then
    raise exception '% facility row(s) already name a map-facilities version other than 1.0.0', n;
  end if;
end $$;

-- A major version, because the inclusion universe changes. Under 1.0.0 a data
-- centre belonged on the map if it mattered to AI; under 2.0.0 it belongs if it
-- exists. That is not an amendment to how a rule is applied, it is a different
-- population, and a minor version would understate it.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('5c000000-0000-4000-8000-000000000012', '5c000000-0000-4000-8000-000000000010',
   '2.0.0', 'approved', 'docs/methodology/map-facilities.md',
   -- sha256 of docs/methodology/map-facilities.md at this commit.
   '6eafdee0c6ff55ba0945fe5dac96b29a39809663f286b67706a249c3fcc514b7', date '2026-09-17')
on conflict (methodology_id, version) do nothing;

-- 1.0.0 is superseded, not retired: it is the version the first 29 published
-- facilities were approved under, and retiring a version that live records
-- still claim would misdescribe them as withdrawn. Its content hash is left
-- exactly as it was, so the bytes it was approved from stay identifiable.
update reference.methodology_versions
   set status = 'superseded', effective_to = date '2026-09-17'
 where id = '5c000000-0000-4000-8000-000000000011'
   and status = 'approved';

do $$
declare v record; n integer;
begin
  -- The importer resolves the newest approved version by effective date; prove
  -- that resolves to 2.0.0 rather than discovering it on the next run.
  select mv.version, mv.status into v
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.status = 'approved' and mv.effective_from is not null
   order by mv.effective_from desc, mv.version desc
   limit 1;
  if v.version <> '2.0.0' then raise exception 'map-facilities resolves to % rather than 2.0.0', v.version; end if;

  -- Exactly one approved version, so "the rules in force" is never ambiguous.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.status = 'approved';
  if n <> 1 then raise exception '% approved map-facilities versions', n; end if;

  -- And 1.0.0 stays resolvable, with its own hash and its own interval.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.version = '1.0.0'
     and mv.status = 'superseded' and mv.content_hash is not null and mv.effective_to is not null;
  if n <> 1 then raise exception '1.0.0 is no longer identifiable as a superseded version with its own hash'; end if;
end $$;
