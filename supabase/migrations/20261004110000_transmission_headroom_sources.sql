-- Transmission Headroom TH-2: the two source interfaces and their rights, registered independently.
--
-- The point of registering these separately is that a publisher is not a licence. The
-- Interconnection Queue already holds determinations for NYISO and for ERCOT, and neither
-- transfers: the queue's NYISO row describes a public web page, and its ERCOT row describes the
-- GIS Report. These are different interfaces, read under different terms, and TH-1A reviewed both
-- from the publishers' own pages rather than inheriting anything.
--
-- The two outcomes are genuinely different, which is the whole argument for doing it this way.
-- ERCOT grants an affirmative right that covers exactly the intended use. NYISO grants nothing and
-- prohibits nothing for data, so it stays ambiguous and publishes under accepted risk.

-- ---------------------------------------------------------------- purposes

insert into reference.source_use_purposes (code, display_name, is_public, description) values
  ('transmission_headroom_retention', 'Transmission headroom retention', false,
   'Retain retrieved transmission flow and limit artifacts and the rows parsed from them.'),
  ('transmission_headroom_calculation', 'Transmission headroom calculation', false,
   'Derive margins internally from retained flow and limit observations.'),
  ('public_transmission_headroom_display', 'Public transmission headroom display', true,
   'Display a publisher''s own flow or limit value on a public Urdais surface.'),
  ('public_transmission_headroom_derived_metric_display', 'Public transmission headroom derived metric display', true,
   'Display an Urdais-derived margin on a public surface. Under ERCOT''s terms this is a compilation or analysis rather than republication.'),
  ('public_transmission_utilization_display', 'Public transmission utilization display', true,
   'Display a derived utilization percentage on a public surface.')
on conflict (code) do nothing;

-- ---------------------------------------------------------------- source interfaces

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   is_active, notes)
select v.id, p.id, v.slug, v.name, 'power_system_operational_data', v.canonical_url, true,
       'public_unauthenticated', v.production_access_state, v.terms_review_state, v.terms_review_state,
       true, v.notes
from (values
  ('99000000-0000-4000-8400-000000000001'::uuid, 'nyiso', 'nyiso-external-limits-flows',
   'NYISO External Limits and Flows',
   'https://mis.nyiso.com/public/csv/ExternalLimitsFlows/',
   'research_usable', 'under_review',
   'A CSV per day and a zip per month, no account. Each row is one interface at one instant with a signed flow and a directional limit pair. It is the only source retrieved in TH-1 that publishes a flow and its limit together as a standing series. Not a five-minute grid: off-grid timestamps and skipped slots occur daily, so it is an event series. +/-9999 is the publisher''s code for a direction it does not monitor, and the largest genuine limit in the archive is 9899.'),
  ('99000000-0000-4000-8400-000000000002'::uuid, 'ercot-planning', 'ercot-sced-binding-constraints',
   'ERCOT SCED Shadow Prices and Binding Transmission Constraints (NP6-86-CD)',
   'https://www.ercot.com/misapp/GetReports.do?reportTypeId=12302',
   'production_review_pending', 'permitted',
   'Hourly CSV-in-ZIP artifacts behind an opaque doclookupId, no account. Each row is one constraint in one SCED interval with a Limit and a Value (flow) and the contingency it protects against. The population is the constraints dispatch was actively tracking, never the ERCOT network. ERCOT displays seven days and offers no archive, so unretrieved history is permanently lost. ConstraintID is a per-run handle and is not identity.')
) as v(id, provider_slug, slug, name, canonical_url, production_access_state, terms_review_state, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- The verbatim evidence TH-1A read, with the date it was read. Recorded here rather than only in
-- the research document so the registry itself carries the basis for each determination.

update reference.source_interfaces set
  terms_artifact_url = 'https://www.nyiso.com/legal-notice',
  terms_retrieved_at = timestamptz '2026-09-21T00:00:00Z',
  terms_evidence = jsonb_build_object(
    'reviewed_on', '2026-09-21',
    'research', 'docs/research/transmission-headroom/th1a-rights-source-contract.md',
    'documents', jsonb_build_array(jsonb_build_object(
      'title', 'NYISO Legal Notice',
      'url', 'https://www.nyiso.com/legal-notice',
      'note', 'Asserts copyright and states that access confers no licence. Its only reproduction '
              || 'prohibition names images and video as stand-alone files; it is silent on data. '
              || 'No affirmative grant and no explicit prohibition, hence ambiguous. The MIS host '
              || 'carries no separate terms, the CSV files contain no disclaimer row and the HTTP '
              || 'response carries no licence header.')))
where slug = 'nyiso-external-limits-flows';

update reference.source_interfaces set
  terms_artifact_url = 'https://www.ercot.com/help/terms',
  terms_retrieved_at = timestamptz '2026-09-21T00:00:00Z',
  terms_evidence = jsonb_build_object(
    'reviewed_on', '2026-09-21',
    'research', 'docs/research/transmission-headroom/th1a-rights-source-contract.md',
    'documents', jsonb_build_array(jsonb_build_object(
      'title', 'ERCOT Terms of Use',
      'url', 'https://www.ercot.com/help/terms',
      'note', 'Grants that raw data in public portions of the website may be used, reproduced and '
              || 'redistributed in compilations, charts and analyses without maintaining notices, '
              || 'while verbatim content must be unmodified with its notices retained. Reviewed '
              || 'for NP6-86-CD specifically rather than inherited from the queue determination.')))
where slug = 'ercot-sced-binding-constraints';

-- ---------------------------------------------------------------- NYISO rights
--
-- Ambiguous, and recorded as ambiguous. NYISO asserts copyright and states that access confers no
-- licence, but its only reproduction prohibition is scoped explicitly to images and video. There is
-- no grant covering data and no prohibition on it. Under the standing Urdais policy that is
-- publishable under founder-accepted risk with the classification left visible, and the
-- classification is not relabelled as cleared.

insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, u.code, 'ambiguous_requires_legal_review', 'permitted',
       u.is_public,
       case when u.is_public then 'Source: New York Independent System Operator, Inc., External Limits and Flows.' end,
       case when u.is_public then
         'Attribute the operator wherever a flow, a limit or a derived margin is displayed. Never present an interface margin as network-wide headroom, and never present a direction NYISO does not monitor as zero.' end,
       'The NYISO legal notice asserts copyright and states that access confers no licence, but its reproduction prohibition names only images and video as stand-alone files and is silent on data. Counsel to determine whether that silence reaches CSV rows republished, or derived from, in a commercial product.',
       'https://www.nyiso.com/legal-notice',
       'Urdais research', date '2026-09-21', timestamptz '2026-09-21T00:00:00Z',
       'Published under the Urdais founder-accepted-risk policy while the question above is open. Determined by TH-1A first-hand review of the NYISO legal notice; the MIS host carries no separate terms, the CSV files contain no disclaimer row and the HTTP response carries no licence header. Not inherited from the NYISO Interconnection Queue determination.'
from reference.source_interfaces s
cross join reference.source_use_purposes u
where s.slug = 'nyiso-external-limits-flows'
  and u.code in ('internal_retention', 'transmission_headroom_retention',
                 'transmission_headroom_calculation',
                 'public_transmission_headroom_display',
                 'public_transmission_headroom_derived_metric_display',
                 'public_transmission_utilization_display')
on conflict do nothing;

-- ---------------------------------------------------------------- ERCOT rights
--
-- An affirmative grant, and an unusually well-shaped one: the terms are more permissive for derived
-- analytics than for verbatim republication. Raw data used in compilations, charts and analyses is
-- explicitly exempt from the notice requirement that applies to reproduced site content.

insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, u.code, 'reusable_with_attribution_or_conditions', 'permitted',
       u.is_public,
       case when u.is_public then 'Source: Electric Reliability Council of Texas, Inc., SCED Shadow Prices and Binding Transmission Constraints (NP6-86-CD).' end,
       case when u.is_public then
         'ERCOT grants that "Raw data provided in public portions of this website may be used, reproduced, and redistributed in compilations, charts, and analyses without maintaining such notices." Verbatim content must instead be unmodified with its notices retained. No ERCOT logo or trademark may be used. Always state that the population is the constraints ERCOT dispatch was tracking, not the ERCOT network.' end,
       'None for the grant itself. ERCOT reserves the right to change these terms at any time without notice, so the determination is re-verified periodically rather than assumed permanent.',
       'https://www.ercot.com/help/terms',
       'Urdais research', date '2026-09-21', timestamptz '2026-09-21T00:00:00Z',
       'Determined by TH-1A first-hand review of the ERCOT Terms of Use. Not inherited from the ERCOT Generator Interconnection Status Report determination, although the same site terms govern both.'
from reference.source_interfaces s
cross join reference.source_use_purposes u
where s.slug = 'ercot-sced-binding-constraints'
  and u.code in ('internal_retention', 'transmission_headroom_retention',
                 'transmission_headroom_calculation',
                 'public_transmission_headroom_display',
                 'public_transmission_headroom_derived_metric_display',
                 'public_transmission_utilization_display')
on conflict do nothing;

-- ---------------------------------------------------------------- currentness monitors
--
-- The two thresholds are set by different risks. NYISO keeps a twenty-year archive, so a missed day
-- is recoverable and staleness only needs to surface a broken feed. ERCOT displays seven days and
-- offers no archive, so staleness has to fire early enough to leave room to notice and re-run: at
-- 36 hours there are still five days of retrievable history left when the alert appears.

insert into reference.transmission_source_monitors
  (source_interface_id, expected_cadence, stale_after_hours, retention_hours, notes)
select s.id, v.cadence, v.stale_after, v.retention, v.notes
from (values
  ('nyiso-external-limits-flows', 'five_minute', 24, null::integer,
   'Publishes continuously through the day into a file named for that calendar day. Monthly zips go back to 2002, so a missed retrieval is recoverable and this threshold exists to surface a broken feed rather than to protect history.'),
  ('ercot-sced-binding-constraints', 'hourly', 36, 168,
   'Hourly when needed; ERCOT displays seven days and publishes no archive. Stale at 36 hours deliberately fires with roughly five days of retrievable history still left, because after the window the data is gone permanently.')
) as v(slug, cadence, stale_after, retention, notes)
join reference.source_interfaces s on s.slug = v.slug
on conflict (source_interface_id) do nothing;
