-- PD-4E: the MISO and SPP capacity sources, registered as internal-only.
--
-- Both operators' terms were reviewed and refused in PD-3B, and nothing found since changes that.
-- So these three interfaces are registered exactly as their planning counterparts were: blocked
-- for production, unsuitable without permission for every purpose, and public display prohibited
-- rather than merely undetermined.
--
-- No permission grant is created for any of them. That is deliberate and is the strongest part of
-- this migration: the accepted-risk policy that lets an ambiguous source be collected has no
-- application to a source whose terms were reviewed and refused, and with no grant in existence
-- there is nothing a later change could cite to authorise production collection by accident.
-- Collection happens under the research purpose, which carries no grant and publishes nothing.

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, terms_evidence, notes)
select v.id, p.id, v.slug, v.name, 'power_system_capacity_assessment', v.canonical_url, false,
       'public_unauthenticated', 'production_blocked', 'not_permitted', 'not_permitted', true,
       jsonb_build_object('reviewed_on', '2026-09-20',
         'research', 'PD-4A deliverable capacity market research; terms position carried from PD-3B',
         'documents', jsonb_build_array(jsonb_build_object('title', v.terms_title, 'url', v.terms_url, 'note', v.terms_note))),
       v.notes
from (values
  ('99000000-0000-4000-8100-000000000007'::uuid, 'miso', 'miso-lole-study',
   'MISO Planning Year Loss of Load Expectation Study Report',
   'https://www.misoenergy.org/planning/',
   'MISO Website Terms of Use', 'https://www.misoenergy.org/legal/',
   'MISO website terms forbid publication, distribution and the preparation of derivative works.',
   'States the system reserve margin requirement and each Local Resource Zone reliability requirement for four seasons, with the installed and unforced capacity they were measured against. It is not the Planning Resource Auction, so it states no committed seasonal accredited capacity.'),
  ('99000000-0000-4000-8100-000000000008'::uuid, 'miso', 'miso-cil-cel-results',
   'MISO Planning Year Capacity Import and Export Limit Results',
   'https://www.misoenergy.org/stakeholder-engagement/committees/',
   'MISO Website Terms of Use', 'https://www.misoenergy.org/legal/',
   'MISO website terms forbid publication, distribution and the preparation of derivative works.',
   'States the capacity import and export limit for each Local Resource Zone in each season, beside the zonal transfer ability the study measured. The deck states each ability twice and the two tables disagree in one place by a megawatt.'),
  ('99000000-0000-4000-8100-000000000009'::uuid, 'southwest-power-pool', 'spp-summer-resource-adequacy',
   'SPP Summer Season Resource Adequacy Report',
   'https://spp.org/engineering/resource-adequacy/',
   'SPP Terms of Use', 'https://spp.org/terms-of-use/',
   'SPP prohibits public display of its data without express written authorization, which Urdais does not hold.',
   'Covers the SPP East Balancing Authority Area only. States the accredited capacity planning reserve margin in prose; its capacity totals and aggregate requirement are raster images and cannot be read. Net Peak Demand already nets out controllable and dispatchable demand response.')
) as v(id, provider_slug, slug, name, canonical_url, terms_title, terms_url, terms_note, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- Every purpose is unsuitable without permission. The public purposes are prohibited outright,
-- which is a stronger statement than "not established": there is a determination, and it is no.
with policy (interface_slug, attribution_text, unresolved_issue, terms_url) as (values
  ('miso-lole-study',
   'Source: Midcontinent Independent System Operator, Inc., Loss of Load Expectation Study Report.',
   'MISO website terms forbid publication, distribution and derivative works. Public display requires express written permission from MISO, which Urdais has not sought or obtained.',
   'https://www.misoenergy.org/legal/'),
  ('miso-cil-cel-results',
   'Source: Midcontinent Independent System Operator, Inc., Capacity Import and Export Limit Results.',
   'MISO website terms forbid publication, distribution and derivative works. Public display requires express written permission from MISO, which Urdais has not sought or obtained.',
   'https://www.misoenergy.org/legal/'),
  ('spp-summer-resource-adequacy',
   'Source: Southwest Power Pool, Inc., Summer Season Resource Adequacy Report.',
   'SPP prohibits public display of its data without express written authorization. Urdais holds no such authorization, and the founder-accepted-risk policy does not reach a source whose terms were reviewed and refused.',
   'https://spp.org/terms-of-use/')
)
insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, u.code, 'unsuitable_without_permission',
       case when u.is_public then 'prohibited' else 'not_established' end,
       u.is_public, case when u.is_public then policy.attribution_text end,
       'Internal retention and calculation only. No value from this source reaches a public surface.',
       policy.unresolved_issue, policy.terms_url,
       'Urdais research', date '2026-09-20', timestamptz '2026-09-20T00:00:00Z',
       'Registered internal-only. No permission grant exists for this interface and none may be created without written permission from the operator.'
from policy
join reference.source_interfaces s on s.slug = policy.interface_slug
cross join reference.source_use_purposes u
where u.code in ('internal_retention', 'internal_calculation', 'grid_capacity_calculation',
                 'public_raw_grid_capacity_value_display', 'public_derived_deliverable_capacity_display');

-- Currentness monitors. A source being blocked for public display is not the same thing as a
-- source being stale, and a monitor on an internal-only release still reports whether it is
-- current internally.
insert into reference.planning_source_monitors
  (source_interface_id, grid_area_id, discovery_url, discovery_method, expected_cadence,
   check_interval, monitoring_state, notes)
select s.id, a.id, v.discovery_url, 'html_listing', v.cadence, interval '30 days', 'active', v.notes
from (values
  ('miso-lole-study', 'miso', 'https://www.misoenergy.org/planning/', 'annual',
   'Anchored on the Loss of Load Expectation study for a planning year. MISO issues one per planning year; a repost would be a correction of that release.'),
  ('miso-cil-cel-results', 'miso', 'https://www.misoenergy.org/stakeholder-engagement/committees/', 'annual',
   'Anchored on the final capacity import and export limit results for a planning year. The deck itself records that it was reposted, so a correction of the same release is an expected event and not a new one.'),
  ('spp-summer-resource-adequacy', 'spp', 'https://spp.org/engineering/resource-adequacy/', 'annual',
   'Anchored on the summer season resource adequacy report. SPP publishes one each June for the season then beginning; the winter season report is a separate release this source does not cover.')
) as v(slug, market, discovery_url, cadence, notes)
join reference.source_interfaces s on s.slug = v.slug
join reference.grid_areas a on a.slug = v.market;

do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces where source_class = 'power_system_capacity_assessment';
  if n <> 9 then raise exception 'expected nine capacity interfaces, found %', n; end if;

  -- The three added here are blocked, refused and grantless, and every one of those matters.
  select count(*) into n from reference.source_interfaces
   where slug in ('miso-lole-study', 'miso-cil-cel-results', 'spp-summer-resource-adequacy')
     and (production_access_state <> 'production_blocked'
          or terms_review_state <> 'not_permitted'
          or data_use_terms_state <> 'not_permitted');
  if n <> 0 then raise exception '% MISO/SPP capacity interface(s) are not registered as blocked', n; end if;

  select count(*) into n from reference.permission_grants g
    join reference.source_interfaces s on s.id = g.source_interface_id
   where s.slug in ('miso-lole-study', 'miso-cil-cel-results', 'spp-summer-resource-adequacy');
  if n <> 0 then raise exception '% permission grant(s) exist for a refused source', n; end if;

  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
    join reference.source_use_purposes u on u.code = sup.purpose_code
   where s.slug in ('miso-lole-study', 'miso-cil-cel-results', 'spp-summer-resource-adequacy')
     and (sup.rights_classification <> 'unsuitable_without_permission'
          or (u.is_public and sup.disposition <> 'prohibited'));
  if n <> 0 then raise exception '% MISO/SPP determination(s) are not unsuitable-and-prohibited', n; end if;
end $$;
