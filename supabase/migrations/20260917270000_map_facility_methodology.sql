-- The facility dataset's methodology, and the two evidence types the research
-- package already uses.
--
-- Facilities are not an index: nothing here is calculated, and there is no
-- level to publish under a version. What a facility methodology versions is the
-- *rules* — what counts as one of the four categories, what a coordinate
-- precision means, when a record may become a public dot, what a power asset
-- must show to appear at all. Those rules have been in the schema since the
-- foundation migration; this one names the version they belong to and makes a
-- published facility say which version governs it.
--
-- The link is one nullable column and one constraint rather than a batch table.
-- A facility is a slowly-changing reference record, not an observation in a
-- series: it is corrected in place and there is nothing to reprocess, so there
-- is no run to identify. What a reader needs is "under which rules was this dot
-- approved", and that is exactly what the column answers.

-- ---------------------------------------------------------------------------
-- Two evidence types the research package uses
-- ---------------------------------------------------------------------------

-- `economic_development` (a state or county development authority's own
-- announcement) and `financial_press`. The foundation migration's list was
-- drawn from the sample, which happened to contain neither. They are added
-- rather than mapped onto a neighbour: an economic-development authority
-- announcing an incentive is a government record of a different kind from a
-- permit, and the citation-class rules read the distinction.
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
    'financial_press'
  ));

-- The citation class, as one expression both SQL and the review tooling read.
--
-- It exists to hold a distinction that matters for rights: citing a fact from a
-- public primary or government document is ordinary attribution, and is not
-- what source-terms review is for. Redistributing the content of a commercial
-- data feed is, and that stays under reference.source_interfaces' existing
-- terms controls, which this function deliberately does not touch.
create or replace function reference.facility_evidence_citation_class(p_document_type text)
returns text
language sql
immutable
as $$
  select case
    when p_document_type in ('company_facility_page', 'company_press_release') then 'public_primary_evidence'
    when p_document_type in ('sec_filing', 'government_record', 'permit', 'planning', 'utility_filing', 'economic_development')
      then 'government_evidence'
    when p_document_type in ('industry_press', 'financial_press') then 'secondary_corroboration'
    else 'unclassified'
  end;
$$;

comment on function reference.facility_evidence_citation_class(text) is
  'Citation class of a facility evidence document: public primary, government, or secondary corroboration. Distinguishes ordinary factual citation from the content redistribution that source-terms review governs.';

-- ---------------------------------------------------------------------------
-- A precision may describe a location nobody has pinned
-- ---------------------------------------------------------------------------

-- The foundation migration allowed a coordinate precision without coordinates
-- only for `city`, because the sample's one such record was a city centroid.
-- The full research package shows the assumption was wrong: two records
-- (DataOne Vineland and the Nebius cluster inside it) carry `street` precision
-- with no latitude, because the researcher established the street and never
-- geocoded it. That is a true and useful thing to record — it says what is
-- known about the location and what is still missing — and refusing it would
-- force the projection to throw the precision away.
--
-- The invariant that matters is the other direction, and it stays: coordinates
-- must always carry a precision, so a pin can always be judged. Map eligibility
-- is unaffected, because it requires coordinates before it looks at precision.
alter table reference.facilities
  drop constraint facilities_precision_needs_coordinates_or_is_absent;

comment on column reference.facilities.coordinate_precision is
  'How precisely the location is known: building, campus, street or city. Present without coordinates where the location is known to that precision but no pin has been established; coordinates, however, always carry one.';

-- ---------------------------------------------------------------------------
-- The methodology
-- ---------------------------------------------------------------------------

insert into reference.methodologies (id, slug, name, document_path) values
  ('5c000000-0000-4000-8000-000000000010', 'map-facilities', 'Urdais Map Facilities',
   'docs/methodology/map-facilities.md')
on conflict (slug) do nothing;

comment on table reference.methodologies is
  'A methodology family owned by Urdais, e.g. the UCPI compute price index family, or the rules governing which physical facilities the map publishes. The document is authoritative; this row identifies it.';

-- 1.0.0, approved. It documents rules that are already implemented and already
-- enforced by constraints and triggers, which is the only kind of facility
-- methodology worth approving: an aspirational one would let the database and
-- the document disagree without either being wrong.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('5c000000-0000-4000-8000-000000000011', '5c000000-0000-4000-8000-000000000010',
   '1.0.0', 'approved', 'docs/methodology/map-facilities.md',
   -- sha256 of docs/methodology/map-facilities.md at this commit.
   'a3d2bacaf54a7089941828f959c3fa8866257483cf598ad9fde3a06f1ff6f4b4', date '2026-09-17')
on conflict (methodology_id, version) do nothing;

-- ---------------------------------------------------------------------------
-- The link
-- ---------------------------------------------------------------------------

alter table reference.facilities
  add column methodology_version_id uuid references reference.methodology_versions (id) on delete restrict;

comment on column reference.facilities.methodology_version_id is
  'The facility methodology version under whose rules this record was approved for publication. Required for a published record; null while a record is research or under review.';

-- A published dot says which rulebook admitted it. A research record does not
-- need one, because no rule has yet been applied to it.
alter table reference.facilities
  add constraint facilities_published_names_its_methodology
  check (publication_state <> 'published' or methodology_version_id is not null);

create index facilities_methodology_idx on reference.facilities (methodology_version_id);

do $$
declare n integer;
begin
  select count(*) into n from reference.methodology_versions v
    join reference.methodologies m on m.id = v.methodology_id
   where m.slug = 'map-facilities' and v.status = 'approved' and v.effective_from is not null;
  if n <> 1 then
    raise exception 'the map facilities methodology has % approved version(s) with an effective date, expected 1', n;
  end if;
end $$;
