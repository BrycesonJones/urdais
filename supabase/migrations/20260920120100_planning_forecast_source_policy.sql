-- PD-3B: the seven planning sources and the rights determination recorded against each.
--
-- These rows encode the V1 policy as data, so that no frontend component and no API route ever
-- decides for itself whether an ISO forecast may be shown. The classifications are the PD-3
-- research findings of 19 September 2026 (docs/research/power-delivery/phase-3-planning-demand.md)
-- and are reproduced here unchanged. Urdais's decision to publish under an ambiguous
-- classification is expressed by the publication policy, never by editing the classification.
--
-- Nothing here approves ingestion. Every interface is registered at the access state its terms
-- review actually supports, and PD-3B retrieves nothing.

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('94000000-0000-4000-8000-000000000001', 'ercot-planning', 'Electric Reliability Council of Texas, Inc.', 'grid_operator', 'https://www.ercot.com/'),
  ('94000000-0000-4000-8000-000000000002', 'pjm-interconnection', 'PJM Interconnection, L.L.C.', 'grid_operator', 'https://www.pjm.com/'),
  ('94000000-0000-4000-8000-000000000003', 'california-energy-commission', 'California Energy Commission', 'government_agency', 'https://www.energy.ca.gov/'),
  ('94000000-0000-4000-8000-000000000004', 'nyiso', 'New York Independent System Operator, Inc.', 'grid_operator', 'https://www.nyiso.com/'),
  ('94000000-0000-4000-8000-000000000005', 'iso-new-england', 'ISO New England Inc.', 'grid_operator', 'https://www.iso-ne.com/'),
  ('94000000-0000-4000-8000-000000000006', 'southwest-power-pool', 'Southwest Power Pool, Inc.', 'grid_operator', 'https://www.spp.org/'),
  ('94000000-0000-4000-8000-000000000007', 'miso', 'Midcontinent Independent System Operator, Inc.', 'grid_operator', 'https://www.misoenergy.org/')
on conflict (slug) do nothing;

-- Access state follows the terms review and nothing else. ERCOT's terms were reviewed and found
-- permissive, so it is review-pending rather than blocked; it is not production-approved because
-- PD-3B builds no collection path. The four ambiguous sources are research-usable while their
-- terms remain under review. SPP and MISO carry terms that positively forbid the public use, so
-- the registry's own constraint forces them to production_blocked, which is correct.

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, terms_evidence, notes)
select v.id, p.id, v.slug, v.name, 'power_system_planning_forecast', v.canonical_url, v.machine_readable,
       'public_unauthenticated', v.production_state, v.terms_state, v.data_use_state,
       v.production_state = 'production_blocked',
       jsonb_build_object(
         'reviewed_on', '2026-09-19',
         'research', 'docs/research/power-delivery/phase-3-planning-demand.md',
         'documents', jsonb_build_array(jsonb_build_object(
           'title', v.terms_title, 'url', v.terms_url, 'note', v.terms_note))),
       v.notes
from (values
  ('94000000-0000-4000-8100-000000000001'::uuid, 'ercot-planning', 'ercot-long-term-load-forecast',
   'ERCOT Long-Term Demand and Energy Forecast',
   'https://www.ercot.com/gridinfo/load/forecast', true,
   'production_review_pending', 'permitted', 'permitted',
   'ERCOT Terms of Use', 'https://www.ercot.com/help/terms',
   'Section 5 permits raw public data to be used, reproduced and redistributed in compilations, charts and analyses without maintaining notices.',
   'Hourly XLSB by weather zone plus seasonal peak and energy XLSX. The public series is frozen on the April 2025 Adjusted Forecast until a finalised 2026 LTLF exists.'),
  ('94000000-0000-4000-8100-000000000002'::uuid, 'pjm-interconnection', 'pjm-load-forecast-report',
   'PJM Load Forecast Report',
   'https://www.pjm.com/planning/resource-adequacy-planning/load-forecast-dev-process', true,
   'research_usable', 'under_review', 'under_review',
   'PJM website legal terms', 'https://www.pjm.com/',
   'Website copyright applies to pjm.com content; no affirmative reuse grant was found. The Data Miner 2 derived-data ban governs a different interface.',
   'Independent PJM staff twenty-year zonal, LDA and RTO forecast published on pjm.com. Data Miner 2 is a different interface with a derived-data ban and is out of scope for PD-3.'),
  ('94000000-0000-4000-8100-000000000003'::uuid, 'california-energy-commission', 'cec-california-energy-demand-forecast',
   'CEC California Energy Demand forecast (IEPR)',
   'https://www.energy.ca.gov/data-reports/california-energy-planning-library/forecasts-and-system-planning/demand-side-3', true,
   'research_usable', 'under_review', 'under_review',
   'CEC Conditions of Use', 'https://www.energy.ca.gov/conditions-of-use',
   'Public-service use with credit, alongside: "Use or modification of these materials or information for commercial or profit-making purposes is prohibited".',
   'The source of record for CAISO planning demand, including CAISO-BAA hourly files. CAISO''s own seasonal assessment restates CEC numbers and does not originate the forecast.'),
  ('94000000-0000-4000-8100-000000000004'::uuid, 'nyiso', 'nyiso-gold-book',
   'NYISO Load and Capacity Data Report (Gold Book)',
   'https://www.nyiso.com/load-capacity-data-report-gold-book-', true,
   'research_usable', 'under_review', 'under_review',
   'NYISO Legal Notice', 'https://www.nyiso.com/legal-notice',
   'Access confers no licence and intellectual property is reserved; the notice is silent on republication of Gold Book values.',
   'Annual baseline, higher-demand and lower-demand cases with weather percentiles, Excel-backed and aligned to the NYIS footprint.'),
  ('94000000-0000-4000-8100-000000000005'::uuid, 'iso-new-england', 'iso-ne-celt-report',
   'ISO New England CELT Report and Forecast Data',
   'https://www.iso-ne.com/celt', true,
   'research_usable', 'under_review', 'under_review',
   'ISO-NE Legal and Privacy', 'https://www.iso-ne.com/legal-privacy',
   'Site content is copyrighted and duplication or non-personal use may violate that copyright.',
   'Annual 50/50 and 90/10 forecasts net of behind-the-meter PV, with component detail. Near-term large-load contribution is zero by ISO-NE''s construction screen.'),
  ('94000000-0000-4000-8100-000000000006'::uuid, 'southwest-power-pool', 'spp-resource-adequacy-report',
   'SPP Seasonal Resource Adequacy Report',
   'https://spp.org/documents/76932/2026%20spp%20summer%20resource%20adequacy%20report.pdf', false,
   'production_blocked', 'not_permitted', 'not_permitted',
   'SPP Terms of Use', 'https://portal.spp.org/terms-of-use',
   'Commercial publication, and quoting SPP in commercial materials, requires express written authorization.',
   'Load-responsible-entity submitted Net Peak Demand in a six-year report, not an independent SPP long-term load forecast. Commercial publication requires express written authorization.'),
  ('94000000-0000-4000-8100-000000000007'::uuid, 'miso', 'miso-long-term-load-forecast',
   'MISO Long-Term Load Forecast whitepaper',
   'https://www.misoenergy.org/planning/', false,
   'production_blocked', 'not_permitted', 'not_permitted',
   'MISO Legal and Privacy', 'https://www.misoenergy.org/meet-miso/legal-and-privacy/',
   'Publishing, distributing and making derivative works of website content is forbidden.',
   'Blocked on two independent grounds. The website terms forbid publication, distribution and derivative works; and the public artifact is a set of CAGR trajectories rather than a vintaged year-by-year MW series, so there is no defensible PD-3 quantity to ingest even if the rights were cleared.')
) as v(id, provider_slug, slug, name, canonical_url, machine_readable, production_state,
        terms_state, data_use_state, terms_title, terms_url, terms_note, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- One determination per source and purpose. Internal purposes and public purposes are decided
-- separately because that is how the terms decide them: every one of these publishers tolerates
-- an engineering copy, and they diverge entirely on public display.

with policy (interface_slug, classification, internal_disposition, public_disposition,
             attribution_text, conditions, unresolved_issue, terms_url, note) as (values
  ('ercot-long-term-load-forecast', 'reusable_with_attribution_or_conditions', 'permitted', 'permitted',
   'Source: Electric Reliability Council of Texas, Inc., Long-Term Demand and Energy Forecast.',
   'Credit ERCOT as the source. ERCOT.com terms of use section 5 permit raw public data to be used, reproduced and redistributed in compilations, charts and analyses without maintaining notices.',
   'Counsel to confirm that section 5 reaches numeric long-term forecast values displayed in a commercial product, and that it covers file downloads as well as the public API.',
   'https://www.ercot.com/help/terms',
   'The only one of the seven that is both first-party at hourly grain and carries an affirmative reuse grant.'),

  ('pjm-load-forecast-report', 'ambiguous_requires_legal_review', 'not_established', 'not_established',
   'Source: PJM Interconnection, L.L.C., Load Forecast Report.',
   'Attribute PJM and the report date wherever a value from this source is displayed.',
   'Does the pjm.com website copyright bar republication of Load Forecast numeric tables in a commercial product? The Data Miner 2 derived-data ban is a separate and sharper prohibition that does not, by its own words, attach to pjm.com planning files.',
   'https://www.pjm.com/',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),

  ('cec-california-energy-demand-forecast', 'ambiguous_requires_legal_review', 'not_established', 'not_established',
   'Source: California Energy Commission, California Energy Demand forecast.',
   'Credit the CEC wherever a value from this source is displayed.',
   'The CEC conditions of use pair a Public Records Act style public-use paragraph with the sentence "Use or modification of these materials or information for commercial or profit-making purposes is prohibited". Counsel to scope that sentence against the CED workbooks. This question gates every public CAISO planning value.',
   'https://www.energy.ca.gov/conditions-of-use',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),

  ('nyiso-gold-book', 'ambiguous_requires_legal_review', 'not_established', 'not_established',
   'Source: New York Independent System Operator, Inc., Load and Capacity Data Report.',
   'Attribute NYISO and the Gold Book year wherever a value from this source is displayed.',
   'The NYISO legal notice states that access confers no licence and reserves intellectual property, and is silent on republication of numeric values from the Gold Book workbook.',
   'https://www.nyiso.com/legal-notice',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),

  ('iso-ne-celt-report', 'ambiguous_requires_legal_review', 'not_established', 'not_established',
   'Source: ISO New England Inc., CELT Report.',
   'Attribute ISO-NE and the CELT year wherever a value from this source is displayed.',
   'ISO-NE asserts copyright in site content and warns that duplication or non-personal use may violate it. Counsel to determine whether that reaches individual cells of the CELT Forecast Data workbook.',
   'https://www.iso-ne.com/legal-privacy',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),

  ('spp-resource-adequacy-report', 'unsuitable_without_permission', 'not_established', 'prohibited',
   null,
   'Citation is permitted for a non-commercial copy only.',
   'SPP terms require express written authorization before commercial publication or before quoting SPP in commercial materials. Whether the portal clause also governs engineering PDFs on spp.org is unconfirmed; the source is treated as hostile to commercial display until it is cleared.',
   'https://portal.spp.org/terms-of-use',
   'Retained internally with caution. Public display requires an express written permission that Urdais does not hold.'),

  ('miso-long-term-load-forecast', 'unsuitable_without_permission', 'not_established', 'prohibited',
   null,
   null,
   'The MISO terms of use forbid publishing, distributing and making derivative works of website content, and it is unconfirmed whether that reaches PDF whitepapers and Engage files. Separately, no public first-party vintaged MW demand series exists at balancing-authority grain.',
   'https://www.misoenergy.org/meet-miso/legal-and-privacy/',
   'Blocked on rights and, independently, on methodology. Recorded so that clearing the rights alone does not read as clearing the source.')
)
insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select
  s.id, u.code, policy.classification,
  case when u.is_public then policy.public_disposition else policy.internal_disposition end,
  u.is_public and policy.attribution_text is not null,
  case when u.is_public then policy.attribution_text end,
  policy.conditions, policy.unresolved_issue, policy.terms_url,
  'Urdais research', date '2026-09-19', timestamptz '2026-09-19T00:00:00Z', policy.note
from policy
join reference.source_interfaces s on s.slug = policy.interface_slug
cross join reference.source_use_purposes u;

-- Bootstrap assertions. Seven planning interfaces, twenty-eight determinations, and no planning
-- source that has quietly acquired an operational identity.
do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces where source_class = 'power_system_planning_forecast';
  if n <> 7 then raise exception 'expected seven PD-3 planning interfaces, found %', n; end if;

  select count(*) into n
    from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'power_system_planning_forecast';
  if n <> 28 then raise exception 'expected 28 planning source-use determinations, found %', n; end if;

  select count(*) into n
    from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
    join reference.source_use_purposes u on u.code = sup.purpose_code
   where s.source_class = 'power_system_planning_forecast'
     and u.is_public and sup.disposition = 'prohibited';
  if n <> 4 then raise exception 'expected SPP and MISO to be prohibited on both public purposes, found % rows', n; end if;

  if exists (select 1 from reference.power_metrics where code like 'planning%') then
    raise exception 'a planning metric was added to the PD-2 operational metric vocabulary';
  end if;
end $$;
