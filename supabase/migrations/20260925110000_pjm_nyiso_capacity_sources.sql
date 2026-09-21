-- PD-4D: the PJM and NYISO capacity sources, and the rights recorded against them.
--
-- PJM gets two interfaces rather than one because it publishes two releases about a delivery year
-- at two different times: the planning parameters before the auction, saying what is required, and
-- the results afterwards, saying what cleared. They are separate publications with separate
-- vintages and separate currentness, and folding them together would date one by the other.
--
-- Neither market's data is taken from PJM Data Miner, which requires an account and carries its
-- own terms; every artifact here is a file published openly on the operator's own site.

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, terms_evidence, notes)
select v.id, p.id, v.slug, v.name, 'power_system_capacity_assessment', v.canonical_url, v.machine_readable,
       'public_unauthenticated', 'research_usable', 'under_review', 'under_review', false,
       jsonb_build_object('reviewed_on', '2026-09-20',
         'research', 'PD-4A deliverable capacity market research',
         'documents', jsonb_build_array(jsonb_build_object('title', v.terms_title, 'url', v.terms_url, 'note', v.terms_note))),
       v.notes
from (values
  ('99000000-0000-4000-8100-000000000004'::uuid, 'pjm-interconnection', 'pjm-rpm-planning-parameters',
   'PJM RPM Base Residual Auction Planning Period Parameters',
   'https://www.pjm.com/markets-and-operations/rpm', true,
   'PJM Terms of Use', 'https://www.pjm.com/about-pjm/terms-of-use',
   'Site terms assert PJM ownership of site content and do not grant redistribution of data values.',
   'The planning parameters workbook states the reliability requirement for the RTO and every locational deliverability area, the transfer objective and transfer limit for all twenty-seven areas, and the reserve margin and pool requirement as proportions of forecast peak. Some transfer limits are printed as lower bounds rather than values.'),
  ('99000000-0000-4000-8100-000000000005'::uuid, 'pjm-interconnection', 'pjm-bra-results',
   'PJM Base Residual Auction Results',
   'https://www.pjm.com/markets-and-operations/rpm', true,
   'PJM Terms of Use', 'https://www.pjm.com/about-pjm/terms-of-use',
   'Site terms assert PJM ownership of site content and do not grant redistribution of data values.',
   'The auction results workbook states the unforced capacity that cleared in the RTO and in each modelled area. Capacity committed by Fixed Resource Requirement entities appears only in the narrative report and is not in any published table.'),
  ('99000000-0000-4000-8100-000000000006'::uuid, 'nyiso', 'nyiso-lcr-study',
   'NYISO Locational Minimum Installed Capacity Requirements Study',
   'https://www.nyiso.com/installed-capacity-market', false,
   'NYISO Terms of Use', 'https://www.nyiso.com/legal-notice',
   'NYISO asserts copyright in its materials and does not publish an affirmative reuse grant.',
   'The study states the NYCA installed reserve margin and each Locality requirement as a percentage of forecast peak, under both Triggering Resource cases. Its tables are raster images; the values ingested come from the report narrative, which is a real text layer.')
) as v(id, provider_slug, slug, name, canonical_url, machine_readable,
       terms_title, terms_url, terms_note, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- Neither operator grants reuse. Both stay ambiguous under the Urdais policy that permits
-- publication under founder-accepted risk while the question is open, and neither is relabelled.
with policy (interface_slug, attribution_text, conditions, unresolved_issue, terms_url, note) as (values
  ('pjm-rpm-planning-parameters',
   'Source: PJM Interconnection, L.L.C., RPM Base Residual Auction Planning Period Parameters.',
   'Attribute PJM and the delivery year wherever a value from this source is displayed.',
   'PJM asserts ownership of site content and publishes no reuse grant. Counsel to determine whether that reaches individual planning parameters published for market participants.',
   'https://www.pjm.com/about-pjm/terms-of-use',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),
  ('pjm-bra-results',
   'Source: PJM Interconnection, L.L.C., Base Residual Auction results.',
   'Attribute PJM and the delivery year wherever a value from this source is displayed.',
   'PJM asserts ownership of site content and publishes no reuse grant. Counsel to determine whether that reaches auction results PJM publishes for market transparency.',
   'https://www.pjm.com/about-pjm/terms-of-use',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),
  ('nyiso-lcr-study',
   'Source: New York Independent System Operator, Inc., Locational Minimum Installed Capacity Requirements Study.',
   'Attribute NYISO, the capability year and the Triggering Resource case wherever a value from this source is displayed. A requirement quoted without its case is ambiguous between two different numbers.',
   'NYISO asserts copyright in its materials and publishes no affirmative reuse grant. Counsel to determine whether that reaches requirement percentages stated in a public study.',
   'https://www.nyiso.com/legal-notice',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.')
)
insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, u.code, 'ambiguous_requires_legal_review', 'not_established',
       u.is_public, case when u.is_public then policy.attribution_text end,
       policy.conditions, policy.unresolved_issue, policy.terms_url,
       'Urdais research', date '2026-09-20', timestamptz '2026-09-20T00:00:00Z', policy.note
from policy
join reference.source_interfaces s on s.slug = policy.interface_slug
cross join reference.source_use_purposes u
where u.code in ('internal_retention', 'internal_calculation', 'grid_capacity_calculation',
                 'public_raw_grid_capacity_value_display', 'public_derived_deliverable_capacity_display');

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
   covers_internal_use, covers_storage, covers_historical_retention, covers_historical_reconstruction,
   rights_layer, attribution_required, attribution_text, effective_from, evidence, reviewed_by, reviewed_on)
select v.id, s.id, 'provider_terms', v.reference, true, false, true, true, true, true,
       'publisher', true, sup.attribution_text, timestamptz '2026-09-20T00:00:00Z',
       v.evidence, 'Urdais research', date '2026-09-20'
from (values
  ('99000000-0000-4000-8200-000000000004'::uuid, 'pjm-rpm-planning-parameters',
   'PJM Terms of Use, reviewed 2026-09-20; no reuse grant established.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review. No PJM Data Miner account is used.'),
  ('99000000-0000-4000-8200-000000000005'::uuid, 'pjm-bra-results',
   'PJM Terms of Use, reviewed 2026-09-20; no reuse grant established.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review. No PJM Data Miner account is used.'),
  ('99000000-0000-4000-8200-000000000006'::uuid, 'nyiso-lcr-study',
   'NYISO legal notice, reviewed 2026-09-20; copyright asserted.',
   'NYISO asserts copyright in its materials. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.')
) as v(id, slug, reference, evidence)
join reference.source_interfaces s on s.slug = v.slug
join lateral (select attribution_text from reference.source_use_permissions
               where source_interface_id = s.id and purpose_code = 'public_raw_grid_capacity_value_display' limit 1) sup on true
on conflict (id) do nothing;

update reference.source_use_permissions sup
   set permission_grant_id = g.id
  from reference.permission_grants g
 where g.source_interface_id = sup.source_interface_id
   and sup.permission_grant_id is null
   and g.id::text in ('99000000-0000-4000-8200-000000000004',
                      '99000000-0000-4000-8200-000000000005',
                      '99000000-0000-4000-8200-000000000006');

update reference.source_interfaces set production_access_state = 'production_approved_under_accepted_risk'
 where slug in ('pjm-rpm-planning-parameters', 'pjm-bra-results', 'nyiso-lcr-study');

-- Currentness monitors. A reissue of the same release and a new annual release are different
-- events, and each monitor says which one its anchor detects.
insert into reference.planning_source_monitors
  (source_interface_id, grid_area_id, discovery_url, discovery_method, expected_cadence,
   check_interval, monitoring_state, notes)
select s.id, a.id, v.discovery_url, 'html_listing', v.cadence, interval '30 days', 'active', v.notes
from (values
  ('pjm-rpm-planning-parameters', 'pjm', 'https://www.pjm.com/markets-and-operations/rpm', 'annual',
   'Anchored on the planning parameters workbook for a delivery year. PJM revises the same workbook in place and dates each revision in a note at the foot of the sheet, so a revision is a correction of the same release and a new delivery year is a new one.'),
  ('pjm-bra-results', 'pjm', 'https://www.pjm.com/markets-and-operations/rpm', 'annual',
   'Anchored on the Base Residual Auction results workbook for a delivery year. Incremental auctions later restate committed quantities and are separate releases this source does not cover.'),
  ('nyiso-lcr-study', 'nyiso', 'https://www.nyiso.com/installed-capacity-market', 'annual',
   'Anchored on the final LCR study for a capability year. NYISO issues the study once per capability year; a revision would be a correction of that same release.')
) as v(slug, market, discovery_url, cadence, notes)
join reference.source_interfaces s on s.slug = v.slug
join reference.grid_areas a on a.slug = v.market;

do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces where source_class = 'power_system_capacity_assessment';
  if n <> 6 then raise exception 'expected six capacity interfaces, found %', n; end if;
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'power_system_capacity_assessment';
  if n <> 30 then raise exception 'expected thirty capacity source-use determinations, found %', n; end if;
  -- ERCOT alone carries an affirmative grant; the other five remain ambiguous.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'power_system_capacity_assessment'
     and sup.rights_classification = 'ambiguous_requires_legal_review';
  if n <> 25 then raise exception 'expected twenty-five ambiguous capacity determinations, found %', n; end if;
  -- Nothing here may quietly register a source that needs an account.
  select count(*) into n from reference.source_interfaces
   where canonical_url ilike '%dataminer%' or slug ilike '%dataminer%';
  if n <> 0 then raise exception 'a PJM Data Miner interface was registered'; end if;
end $$;
