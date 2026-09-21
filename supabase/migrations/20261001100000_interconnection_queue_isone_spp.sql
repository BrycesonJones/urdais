-- IQ-4: ISO-NE and SPP, and the two things that make them different from the other five.
--
-- ISO-NE's public queue is two thirds not-new-generation. 740 of its 1,751 rows are requests for
-- capacity network resource capability, which ISO-NE defines as an interconnection *service
-- right* — it answers "whether an initial interconnection analysis is required under FCM
-- qualification for a proposed increase in output from an existing generating capacity resource".
-- Those rows carry 161,736 MW of summer capability against 78,899 MW on every other row, and 89
-- of them report zero net MW to the grid against a large summer figure. Summing the column would
-- report a New England generation queue roughly three times its real size.
--
-- So a request now says what kind of request it is, and the database refuses to let a
-- capacity-rights row carry a new-generation quantity. Not a convention, not a filter somebody
-- remembers to apply: an insert that tries it fails.
--
-- SPP is the other case. Its terms permit copying "EXCEPT when such materials will be used in
-- commercial publication", which reaches everything Urdais would display. That is not the
-- ambiguity the founder-accepted-risk policy covers; it is a stated exclusion. SPP is registered
-- `unsuitable_without_permission` with its public purposes explicitly prohibited, and the
-- existing publication gate blocks it without any new code. No override is created for it.

-- ------------------------------------------------------------------ request subtype

create table reference.interconnection_request_subtypes (
  code        text primary key
                constraint interconnection_request_subtypes_code_lower
                check (code = lower(btrim(code)) and code <> ''),
  label       text not null
                constraint interconnection_request_subtypes_label_nonempty check (btrim(label) <> ''),
  /**
   * Whether a request of this kind proposes new physical capability on the system.
   *
   * This is the flag that keeps a queue total honest. It is false for capacity-rights requests,
   * which concern resources that already exist or are already queued under another id.
   */
  is_new_capability boolean not null,
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table reference.interconnection_request_subtypes is
  'What kind of interconnection request this is, where the publisher distinguishes. ISO-NE is the first market that does, and the distinction is load-bearing: two thirds of its published queue MW belongs to capacity-rights requests against existing resources.';

insert into reference.interconnection_request_subtypes (code, label, is_new_capability, notes) values
  ('new_generation', 'New generation', true,
   'A request to interconnect generating capability that does not yet exist on the system.'),
  ('capacity_rights', 'Capacity rights', false,
   'A request for interconnection service rights rather than for new plant. ISO-NE CNR and CNI: capability that lets an existing or already-queued resource qualify in the capacity market. Its MW describes a facility that is already counted somewhere else, or not new.'),
  ('elective_transmission_upgrade', 'Elective transmission upgrade', false,
   'A transmission upgrade requested outside the generator interconnection process. ISO-NE type ETU.'),
  ('transmission_service', 'Transmission service', false,
   'A request for transmission service rather than interconnection. ISO-NE type TS.'),
  ('not_distinguished', 'Not distinguished by the source', true,
   'The publisher does not separate request kinds, so every request in its queue is an ordinary interconnection request. The five markets ingested before IQ-4 are all of this kind.'),
  ('unknown', 'Unknown', false,
   'The publisher distinguishes request kinds and published one this pipeline has not mapped. Deliberately not counted as new capability, so an unmapped kind cannot inflate a total.');

alter table pipeline.interconnection_request_observations
  add column request_subtype text not null default 'not_distinguished'
    references reference.interconnection_request_subtypes (code) on delete restrict,
  -- The publisher's own words for it, always kept beside the normalized value.
  add column native_request_type text;

create index interconnection_observations_subtype_idx
  on pipeline.interconnection_request_observations (request_subtype) where is_latest;

-- ------------------------------------------------------------------ the quantity guard
--
-- A capacity-rights request may not carry a quantity that a new-generation total would pick up.
-- Its MW belongs under capacity_service_mw, which the vocabulary already defines as a service
-- right rather than accredited capacity.
create or replace function pipeline.check_interconnection_quantity_subtype()
returns trigger language plpgsql as $$
declare
  subtype text;
  new_capability boolean;
begin
  select o.request_subtype into subtype
    from pipeline.interconnection_request_observations o where o.id = new.observation_id;
  if subtype is null then return new; end if;

  select s.is_new_capability into new_capability
    from reference.interconnection_request_subtypes s where s.code = subtype;

  if not new_capability and new.quantity_kind in
       ('maximum_facility_output', 'net_mw_to_grid', 'summer_mw', 'winter_mw', 'in_service_mw') then
    raise exception
      'a % request may not carry the new-generation quantity %; its MW describes capability that is not new, and belongs under capacity_service_mw or other_mw',
      subtype, new.quantity_kind
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger interconnection_quantities_subtype_check
  before insert on pipeline.interconnection_request_quantities
  for each row execute function pipeline.check_interconnection_quantity_subtype();

comment on function pipeline.check_interconnection_quantity_subtype is
  'Refuses a new-generation quantity on a request that does not propose new capability. This is what stops ISO-NE capacity-rights rows entering a queue total by accident.';

-- The confirmation trigger must refuse silent edits to the two new evidence fields as well.
create or replace function pipeline.allow_only_interconnection_confirmation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'interconnection observations are append-only' using errcode = 'restrict_violation';
  end if;
  if new.request_id is distinct from old.request_id
     or new.observation_ordinal is distinct from old.observation_ordinal
     or new.observation_hash is distinct from old.observation_hash
     or new.first_snapshot_id is distinct from old.first_snapshot_id
     or new.first_raw_record_id is distinct from old.first_raw_record_id
     or new.lifecycle_stage is distinct from old.lifecycle_stage
     or new.native_status is distinct from old.native_status
     or new.requested_on is distinct from old.requested_on
     or new.actual_in_service_on is distinct from old.actual_in_service_on
     or new.withdrawn_on is distinct from old.withdrawn_on
     or new.native_end_use is distinct from old.native_end_use
     or new.load_end_use is distinct from old.load_end_use
     or new.request_subtype is distinct from old.request_subtype
     or new.native_request_type is distinct from old.native_request_type then
    raise exception 'an interconnection observation may not be edited; record a new observation'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ the two sources

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, terms_evidence, notes)
select v.id, p.id, v.slug, v.name, 'interconnection_queue', v.canonical_url, true,
       'public_unauthenticated', v.production_state, v.terms_state, v.data_use_state,
       v.production_state = 'production_blocked',
       jsonb_build_object('reviewed_on', '2026-09-21',
         'research', 'IQ-1 interconnection queue source reconnaissance',
         'documents', jsonb_build_array(jsonb_build_object('title', v.terms_title, 'url', v.terms_url, 'note', v.terms_note))),
       v.notes
from (values
  ('99000000-0000-4000-8300-000000000006'::uuid, 'iso-new-england', 'iso-ne-interconnection-queue',
   'ISO-NE Interconnection Request Queue',
   'https://irtt.iso-ne.com/reports/external',
   'research_usable', 'under_review', 'under_review',
   'ISO-NE Legal and Privacy', 'https://www.iso-ne.com/legal-privacy',
   'Site content is copyrighted and duplication or non-personal use may violate that copyright.',
   'The public view of the Interconnection Request Tracking Tool, served as a structured HTML table behind a cookie-detection redirect. Two thirds of its rows are capacity network resource requests, which ISO-NE defines as interconnection service rights for resources that already exist or are already queued, not as new generation. The queue publishes no battery and generator split for co-located projects, and flags administrative rows only in free text inside the project name.'),
  ('99000000-0000-4000-8300-000000000007'::uuid, 'southwest-power-pool', 'spp-generator-interconnection-queue',
   'SPP Generator Interconnection Active Request Listing',
   'https://opsportal.spp.org/Studies/GIActive',
   'production_blocked', 'not_permitted', 'not_permitted',
   'SPP Terms and Conditions', 'https://www.spp.org/terms-conditions/',
   'SPP grants permission to copy and distribute with citation EXCEPT when the materials will be used in commercial publication. Urdais is a commercial publication.',
   'A generated CSV behind a one-row preamble carrying the source update date. Six MW columns whose totals differ by roughly four times, and a status field that conflates the interconnection agreement with commercial operation: a third of the "active" listing is already operating. Retained internally under the rights policy; never published.')
) as v(id, provider_slug, slug, name, canonical_url, production_state, terms_state, data_use_state,
       terms_title, terms_url, terms_note, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- ISO-NE: ambiguous, so permitted throughout under founder-accepted risk with the open question
-- retained. SPP: unsuitable, so internal purposes are permitted and every public purpose is
-- prohibited outright. The difference between the two is the whole point of this block.
insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, u.code, policy.classification,
       case when u.is_public then policy.public_disposition else policy.internal_disposition end,
       u.is_public and policy.attribution_text is not null,
       case when u.is_public then policy.attribution_text end,
       case when u.is_public then policy.conditions end,
       policy.unresolved_issue, policy.terms_url,
       'Urdais research', date '2026-09-21', timestamptz '2026-09-21T00:00:00Z', policy.note
from (values
  ('iso-ne-interconnection-queue', 'ambiguous_requires_legal_review', 'permitted', 'permitted',
   'Source: ISO New England Inc., Interconnection Request Queue.',
   'Attribute ISO-NE wherever a queue value is displayed, never present a queue MW as available capacity, and never include capacity network resource requests in a new-generation total.',
   'ISO-NE asserts copyright in site content and warns that duplication or non-personal use may violate it. Counsel to determine whether that reaches individual queue rows republished in a commercial product.',
   'https://www.iso-ne.com/legal-privacy',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),
  ('spp-generator-interconnection-queue', 'unsuitable_without_permission', 'permitted', 'prohibited',
   null,
   null,
   'SPP grants copying and distribution with citation except for use in commercial publication. Urdais is a commercial publication, so the carve-out reaches every value Urdais would display. Publication requires a permission that has not been sought or obtained.',
   'https://www.spp.org/terms-conditions/',
   'Retained and calculated internally. Public display is prohibited and no founder-accepted-risk override exists for this source: the terms state an exclusion rather than leaving a question open.')
) as policy(interface_slug, classification, internal_disposition, public_disposition,
            attribution_text, conditions, unresolved_issue, terms_url, note)
join reference.source_interfaces s on s.slug = policy.interface_slug
cross join reference.source_use_purposes u
where u.code in ('internal_retention', 'interconnection_queue_retention',
                 'interconnection_queue_calculation',
                 'public_interconnection_queue_display',
                 'public_interconnection_queue_derived_metric_display');

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
   covers_internal_use, covers_storage, covers_historical_retention, covers_historical_reconstruction,
   rights_layer, attribution_required, attribution_text, effective_from, evidence, reviewed_by, reviewed_on)
select v.id, s.id, 'provider_terms', v.reference, true, false, true, true, true, true,
       'publisher', v.attribution_required, v.attribution_text, timestamptz '2026-09-21T00:00:00Z',
       v.evidence, 'Urdais research', date '2026-09-21'
from (values
  ('99000000-0000-4000-8400-000000000006'::uuid, 'iso-ne-interconnection-queue',
   'ISO-NE legal and privacy terms, reviewed 2026-09-21; copyright asserted, no reuse grant established.',
   true, 'Source: ISO New England Inc., Interconnection Request Queue.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.'),
  ('99000000-0000-4000-8400-000000000007'::uuid, 'spp-generator-interconnection-queue',
   'SPP Terms and Conditions, reviewed 2026-09-21; commercial publication expressly excluded.',
   false, null,
   'SPP permits copying and distribution with citation except for use in commercial publication. Collection for internal retention and calculation proceeds; publication does not, and this grant confers no publication right.')
) as v(id, slug, reference, attribution_required, attribution_text, evidence)
join reference.source_interfaces s on s.slug = v.slug
on conflict (id) do nothing;

update reference.source_use_permissions sup
   set permission_grant_id = g.id
  from reference.permission_grants g
 where g.source_interface_id = sup.source_interface_id
   and sup.permission_grant_id is null
   and g.id in ('99000000-0000-4000-8400-000000000006', '99000000-0000-4000-8400-000000000007');

-- ISO-NE regenerates its view continuously; SPP stamps a weekly update date in the file.
insert into reference.interconnection_source_monitors
  (source_interface_id, expected_cadence, stale_after_hours, rationale)
select s.id, v.cadence, v.hours, v.rationale
from (values
  ('iso-ne-interconnection-queue', 'daily', 72,
   'ISO-NE describes the queue as a dynamic database that can change from day to day, and publishes no release key. Three days allows for a weekend before the view itself is suspect.'),
  ('spp-generator-interconnection-queue', 'weekly', 336,
   'SPP stamps a Last Updated On date in the file preamble and refreshes roughly weekly. Two weeks is one missed cycle plus slack, which is the first real signal that the listing has stopped moving.')
) as v(slug, cadence, hours, rationale)
join reference.source_interfaces s on s.slug = v.slug
on conflict (source_interface_id) do nothing;

-- ------------------------------------------------------------------ assertions

do $$
declare n integer;
begin
  select count(*) into n from pipeline.interconnection_domain_violations();
  if n <> 0 then raise exception 'the queue domain is wired to the capacity domain'; end if;

  select count(*) into n from reference.source_interfaces where source_class = 'interconnection_queue';
  if n <> 7 then raise exception 'expected seven queue interfaces, found %', n; end if;

  -- SPP is blocked from every public purpose, and nothing marks it otherwise.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
    join reference.source_use_purposes u on u.code = sup.purpose_code
   where s.slug = 'spp-generator-interconnection-queue'
     and u.is_public and sup.disposition <> 'prohibited';
  if n <> 0 then raise exception 'an SPP public purpose is not prohibited'; end if;

  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.slug = 'spp-generator-interconnection-queue'
     and sup.rights_classification <> 'unsuitable_without_permission';
  if n <> 0 then raise exception 'SPP was recorded as something other than unsuitable'; end if;

  -- ISO-NE stays ambiguous and keeps its open question.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.slug = 'iso-ne-interconnection-queue'
     and (sup.rights_classification <> 'ambiguous_requires_legal_review' or sup.unresolved_issue is null);
  if n <> 0 then raise exception 'the ISO-NE queue source lost its classification or its open question'; end if;

  select count(*) into n from reference.interconnection_request_subtypes where not is_new_capability;
  if n <> 4 then raise exception 'expected four subtypes that are not new capability, found %', n; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline' and table_name like 'interconnection%'
     and column_name in ('capacity_mw', 'queue_mw', 'mw');
  if n <> 0 then raise exception 'a generic MW column exists in the queue domain'; end if;
end $$;

alter table reference.interconnection_request_subtypes enable row level security;
