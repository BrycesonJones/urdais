-- PD-4C: the three capacity sources this phase collects, and the rights recorded against them.
--
-- ERCOT, CAISO and ISO-NE were chosen because their V1 capability definitions are the cleanest,
-- not because they are the largest. What each actually publishes in a machine-readable form is
-- narrower than the research hoped, and the registry records that honestly: an interface exists
-- for each, with the rights determination its terms support, and the adapters ingest only what
-- the artifact states.

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface', 'catalog_price_interface', 'availability_interface',
    'product_reference_documentation', 'hardware_reference_documentation',
    'provider_terms_documentation', 'price_surface', 'news_feed', 'statistical_dataset',
    'exchange_rate_series', 'chain_data_interface', 'spot_price_interface',
    'usage_dataset_interface', 'benchmark_dataset_interface', 'regulatory_filing_repository',
    'equity_eod_price_interface', 'issuer_fundamentals_interface',
    'power_system_operational_data', 'power_system_planning_forecast',
    -- A dated capacity, adequacy or accreditation release: a CDR, an NQC list, an ICR summary.
    'power_system_capacity_assessment'
  ));

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('99000000-0000-4000-8000-000000000001', 'caiso', 'California Independent System Operator Corporation', 'grid_operator', 'https://www.caiso.com/')
on conflict (slug) do nothing;

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, terms_evidence, notes)
select v.id, p.id, v.slug, v.name, 'power_system_capacity_assessment', v.canonical_url, true,
       'public_unauthenticated', v.production_state, v.terms_state, v.data_use_state,
       v.production_state = 'production_blocked',
       jsonb_build_object('reviewed_on', '2026-09-20',
         'research', 'PD-4A deliverable capacity market research',
         'documents', jsonb_build_array(jsonb_build_object('title', v.terms_title, 'url', v.terms_url, 'note', v.terms_note))),
       v.notes
from (values
  ('99000000-0000-4000-8100-000000000001'::uuid, 'ercot-planning', 'ercot-capacity-demand-reserves',
   'ERCOT Capacity, Demand and Reserves Report',
   'https://www.ercot.com/gridinfo/resource',
   'production_review_pending', 'permitted', 'permitted',
   'ERCOT Terms of Use', 'https://www.ercot.com/help/terms',
   'Section 5 permits raw public data to be used, reproduced and redistributed in compilations, charts and analyses.',
   'The CDR Seasonal Summary states total capacity and firm peak load per season and forward year, at both the peak load hour and the peak net load hour. Reserve margin is published as a ratio and is not a capacity component.'),
  ('99000000-0000-4000-8100-000000000002'::uuid, 'caiso', 'caiso-net-qualifying-capacity',
   'CAISO Final Net Qualifying Capacity Report',
   'https://www.caiso.com/library/net-qualifying-capacity-nqc-and-effective-flexible-capacity-efc',
   'research_usable', 'under_review', 'under_review',
   'CAISO Privacy and Terms of Use', 'https://www.caiso.com/privacy-terms-of-use',
   'Website terms assert intellectual property in site content; no affirmative commercial reuse grant was found.',
   'Resource-level monthly NQC with deliverability status. The published value already reflects deliverability: energy-only resources carry zero. There is no area total in the workbook, so an area capability would be a summation Urdais performed, which PD-4A left behind a signed methodology.'),
  ('99000000-0000-4000-8100-000000000003'::uuid, 'iso-new-england', 'iso-ne-icr-related-values',
   'ISO-NE Summary of ICR and Related Values',
   'https://www.iso-ne.com/markets-operations/markets/forward-capacity-market/fcm-participation-guide/installed-capacity-requirement',
   'research_usable', 'under_review', 'under_review',
   'ISO-NE Legal and Privacy', 'https://www.iso-ne.com/legal-privacy',
   'Site content is copyrighted and duplication or non-personal use may violate that copyright.',
   'ICR, Net ICR, zonal requirements and the capacity transfer limits, per capacity commitment period and auction. Qualified Capacity is not in this artifact.')
) as v(id, provider_slug, slug, name, canonical_url, production_state, terms_state, data_use_state,
       terms_title, terms_url, terms_note, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- ERCOT's terms carry an affirmative grant; the other two do not, and stay ambiguous under the
-- Urdais policy that permits publication under founder-accepted risk while the question is open.
with policy (interface_slug, classification, internal_disposition, public_disposition,
             attribution_text, conditions, unresolved_issue, terms_url, note) as (values
  ('ercot-capacity-demand-reserves', 'reusable_with_attribution_or_conditions', 'permitted', 'permitted',
   'Source: Electric Reliability Council of Texas, Inc., Capacity, Demand and Reserves Report.',
   'Credit ERCOT as the source.',
   'Counsel to confirm that section 5 reaches numeric capacity values displayed in a commercial product.',
   'https://www.ercot.com/help/terms',
   'The only one of the three with an affirmative reuse grant.'),
  ('caiso-net-qualifying-capacity', 'ambiguous_requires_legal_review', 'not_established', 'not_established',
   'Source: California Independent System Operator Corporation, Net Qualifying Capacity Report.',
   'Attribute CAISO wherever a value from this source is displayed.',
   'The CAISO terms of use assert intellectual property in site content and are silent on republication of numeric values from the NQC report.',
   'https://www.caiso.com/privacy-terms-of-use',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.'),
  ('iso-ne-icr-related-values', 'ambiguous_requires_legal_review', 'not_established', 'not_established',
   'Source: ISO New England Inc., Summary of ICR and Related Values.',
   'Attribute ISO-NE and the capacity commitment period wherever a value from this source is displayed.',
   'ISO-NE asserts copyright in site content and warns that duplication or non-personal use may violate it. Counsel to determine whether that reaches individual cells of the ICR summary workbook.',
   'https://www.iso-ne.com/legal-privacy',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.')
)
insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, u.code, policy.classification,
       case when u.is_public then policy.public_disposition else policy.internal_disposition end,
       u.is_public and policy.attribution_text is not null,
       case when u.is_public then policy.attribution_text end,
       policy.conditions, policy.unresolved_issue, policy.terms_url,
       'Urdais research', date '2026-09-20', timestamptz '2026-09-20T00:00:00Z', policy.note
from policy
join reference.source_interfaces s on s.slug = policy.interface_slug
cross join reference.source_use_purposes u
where u.code in ('internal_retention', 'internal_calculation', 'grid_capacity_calculation',
                 'public_raw_grid_capacity_value_display', 'public_derived_deliverable_capacity_display');

-- A production retrieval must cite a permission basis. ERCOT's grant rests on its own terms; the
-- other two rest on the accepted-risk policy and say so rather than claiming a grant.
insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
   covers_internal_use, covers_storage, covers_historical_retention, covers_historical_reconstruction,
   rights_layer, attribution_required, attribution_text, effective_from, evidence, reviewed_by, reviewed_on)
select v.id, s.id, 'provider_terms', v.reference, true, false, true, true, true, true,
       'publisher', true, sup.attribution_text, timestamptz '2026-09-20T00:00:00Z',
       v.evidence, 'Urdais research', date '2026-09-20'
from (values
  ('99000000-0000-4000-8200-000000000001'::uuid, 'ercot-capacity-demand-reserves',
   'ERCOT Terms of Use section 5, reviewed 2026-09-20.',
   'ERCOT permits raw public data to be used, reproduced and redistributed in compilations, charts and analyses.'),
  ('99000000-0000-4000-8200-000000000002'::uuid, 'caiso-net-qualifying-capacity',
   'CAISO terms of use, reviewed 2026-09-20; no reuse grant established.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.'),
  ('99000000-0000-4000-8200-000000000003'::uuid, 'iso-ne-icr-related-values',
   'ISO-NE legal and privacy terms, reviewed 2026-09-20; copyright asserted.',
   'Site content is copyrighted. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.')
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
   and g.id::text like '99000000-0000-4000-8200-%';

-- ERCOT is approved outright; the other two under the accepted-risk state PD-3C introduced.
update reference.source_interfaces set production_access_state = 'production_approved'
 where slug = 'ercot-capacity-demand-reserves';
update reference.source_interfaces set production_access_state = 'production_approved_under_accepted_risk'
 where slug in ('caiso-net-qualifying-capacity', 'iso-ne-icr-related-values');

-- Currentness monitors, on the pattern PD-3D established.
insert into reference.planning_source_monitors
  (source_interface_id, grid_area_id, discovery_url, discovery_method, expected_cadence,
   check_interval, monitoring_state, notes)
select s.id, a.id, v.discovery_url, 'html_listing', v.cadence, interval '30 days', 'active', v.notes
from (values
  ('ercot-capacity-demand-reserves', 'ercot', 'https://www.ercot.com/gridinfo/resource', 'semiannual',
   'Anchored on the CDR artifact itself. ERCOT reissues a CDR under the same month when it corrects one, which is a correction of the same release rather than a new one.'),
  ('caiso-net-qualifying-capacity', 'caiso', 'https://www.caiso.com/library/net-qualifying-capacity-nqc-and-effective-flexible-capacity-efc', 'annual',
   'Anchored on the final NQC report for a compliance year. The preliminary list is not a release.'),
  ('iso-ne-icr-related-values', 'iso-ne', 'https://www.iso-ne.com/markets-operations/markets/forward-capacity-market/fcm-participation-guide/installed-capacity-requirement', 'annual',
   'Anchored on the ICR summary workbook, which ISO-NE restates as auctions and reconfiguration auctions settle.')
) as v(slug, market, discovery_url, cadence, notes)
join reference.source_interfaces s on s.slug = v.slug
join reference.grid_areas a on a.slug = v.market;

do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces where source_class = 'power_system_capacity_assessment';
  if n <> 3 then raise exception 'expected three capacity interfaces, found %', n; end if;
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'power_system_capacity_assessment';
  if n <> 15 then raise exception 'expected fifteen capacity source-use determinations, found %', n; end if;
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.source_class = 'power_system_capacity_assessment'
     and sup.rights_classification = 'ambiguous_requires_legal_review';
  if n <> 10 then raise exception 'CAISO and ISO-NE should hold ten ambiguous determinations, found %', n; end if;
end $$;

-- ------------------------- the use a capacity assessment interface is read for

-- Extends the definition planning ingestion left, adding one branch and changing nothing else.
--
-- Without it a capacity source falls to the trailing case, which demands covers_index_use: the
-- right to use a value as an input to a published index. A capacity, demand and reserves report
-- is not an index input and is not going to become one. What Urdais reads it for is retention and
-- analysis, which is what covers_internal_use says, and demanding the other right would be
-- demanding the wrong permission and then failing for want of it.
create or replace function pipeline.check_retrieval_permission()
returns trigger
language plpgsql
as $$
declare
  g record;
  iface record;
  needed boolean;
begin
  select source_class into iface from reference.source_interfaces where id = new.source_interface_id;

  if new.permission_grant_id is not null then
    select source_interface_id, effective_from, effective_to, covers_collection, covers_index_use,
           covers_content_syndication, covers_internal_use
      into g
      from reference.permission_grants where id = new.permission_grant_id;
    if g.source_interface_id <> new.source_interface_id then
      raise exception 'permission grant % belongs to a different source interface', new.permission_grant_id
        using errcode = 'check_violation';
    end if;
    if new.requested_at < g.effective_from or (g.effective_to is not null and new.requested_at >= g.effective_to) then
      raise exception 'permission grant % was not in force at %', new.permission_grant_id, new.requested_at
        using errcode = 'check_violation';
    end if;
    if new.retrieval_purpose <> 'research' then
      needed := case
        when iface.source_class = 'news_feed' then g.covers_collection and g.covers_content_syndication
        when iface.source_class = 'power_system_planning_forecast' then g.covers_collection and g.covers_internal_use
        when iface.source_class = 'power_system_capacity_assessment' then g.covers_collection and g.covers_internal_use
        else g.covers_collection and g.covers_index_use
      end;
      if not needed then
        raise exception 'permission grant % does not cover collection and the use a % interface is read for',
          new.permission_grant_id, iface.source_class
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.retrieval_purpose in ('production', 'validation') then
    if new.acquisition_mode is distinct from 'manual_verified' then
      select production_access_state, terms_review_state, data_use_terms_state into iface
        from reference.source_interfaces where id = new.source_interface_id;
      if iface.production_access_state not in ('production_approved', 'production_approved_under_accepted_risk') then
        raise exception '% retrieval from a source interface that is % (terms %, data use %)',
          new.retrieval_purpose, iface.production_access_state, iface.terms_review_state, iface.data_use_terms_state
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;
