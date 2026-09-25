-- UEPI-1: the Urdais Energy & Power Index foundation.
--
-- Registers the frozen specification, defines the seven benchmarks, records the rights
-- determination for each source, and creates the three-layer observation path plus its run ledger.
-- It ingests nothing. No adapter exists yet, no cron is scheduled, and no value is published.
--
-- Why this needs tables of its own, rather than reusing what Power Delivery already has.
--
--   `pipeline.power_observations` holds EIA-930 megawatts: `value_mw numeric not null check
--   (value_mw >= 0)`, keyed to `reference.power_metrics`, whose canonical unit is constrained to
--   'MW'. A UEPI observation is a signed price in dollars per megawatt-hour -- SPP's North Hub
--   daily mean was -$0.11/MWh on 12 April 2026 -- so the non-negativity that is right for load
--   would make this table unable to hold its own subject. Nothing in PD-2 can be widened to fit
--   without weakening a constraint that is correct where it stands.
--
--   The published daily value has no existing home either. Per-product publication tables are the
--   established convention here (`utvi_publications`, `ubwi_publications`, `umpi_publications`),
--   and UEPI's needs one field none of them has: the construct, because a $/MWh value that does
--   not say whether it includes congestion is not interpretable.
--
-- What is deliberately *not* created: per-market tables, a node dimension, an hourly public API
-- surface, a composite series, and anything to do with congestion, capacity or forecasting.
-- Specification: docs/research/uepi/uepi-v1-specification.md, frozen at 1.0.0.

-- --------------------------------------------------------------- the frozen specification

insert into reference.methodologies (id, slug, name, document_path) values
  ('9e000000-0000-4000-8000-000000000001'::uuid, 'uepi',
   'Urdais Energy & Power Index', 'docs/research/uepi/uepi-v1-specification.md')
on conflict (slug) do nothing;

-- The approved artefact for UEPI V1 is the specification itself. A public methodology page derived
-- from its section C will come later and will carry its own row and digest.
--
-- The digest binds the approved rules to the bytes that were approved. Authorisation reads this
-- row and never the file: `docs/` is absent from the serverless bundle, and a filesystem check is
-- what broke Transmission Headroom's first production cron.
insert into reference.methodology_versions
  (methodology_id, version, status, document_path, content_hash, effective_from)
select m.id, '1.0.0', 'approved', 'docs/research/uepi/uepi-v1-specification.md',
       '14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a',
       date '2026-09-24'
from reference.methodologies m where m.slug = 'uepi'
on conflict do nothing;

-- --------------------------------------------------------------- source registry

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
    'power_system_capacity_assessment', 'interconnection_queue',
    'official_statistical_series', 'official_trade_statistics',
    'official_classification_reference',
    -- A market operator's own cleared wholesale energy prices. Distinct from operational data:
    -- it is what the auction settled at, not what the system was doing.
    'wholesale_power_price_series'
  ));

-- The seven day-ahead price interfaces. Providers already exist from the Power Delivery and
-- Interconnection Queue work; a second provider row per ISO would be a second identity to keep
-- correct.
--
-- None is production-approved, and three are positively blocked. Production approval requires both
-- terms axes permitted; PJM, MISO and SPP each forbid the data-use axis, which the schema already
-- insists must mean `production_blocked`. That is the right word for them: Urdais may retain and
-- calculate internally, and the source may not enter the production path that ends in publication.
insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, terms_evidence, notes)
select v.id, p.id, v.slug, v.name, 'wholesale_power_price_series', v.canonical_url, true,
       v.access_class, v.production_state, v.terms_state, v.data_use_state,
       v.written_agreement, 
       jsonb_build_object(
         'reviewed_on', '2026-09-24',
         'research', 'UEPI phase 1 day-ahead benchmark study',
         'documents', jsonb_build_array(jsonb_build_object('title', v.terms_title, 'url', v.terms_url))),
       v.notes
from (values
  ('9e000000-0000-4000-8100-000000000001'::uuid, 'ercot-planning', 'ercot-emil-dam-settlement-point-prices',
   'ERCOT EMIL NP4-190-CD, DAM Settlement Point Prices',
   'https://www.ercot.com/mp/data-products/data-product-details?id=NP4-190-CD',
   'api_key', 'research_usable', 'permitted', 'permitted', false,
   'ERCOT Terms of Use', 'https://www.ercot.com/help/terms',
   'Hourly day-ahead settlement point prices. HB_HUBAVG is the UEPI benchmark, stored as published and never recomputed from the four regional hubs.'),
  ('9e000000-0000-4000-8100-000000000002'::uuid, 'pjm-interconnection', 'pjm-data-miner-da-hrl-lmps',
   'PJM Data Miner 2, da_hrl_lmps',
   'https://dataminer2.pjm.com/feed/da_hrl_lmps/definition',
   'api_key', 'production_blocked', 'permitted', 'not_permitted', true,
   'PJM Data Miner terms and data licence', 'https://www.pjm.com/markets-and-operations/etools/data-miner-2',
   'Day-ahead hourly LMPs. Redistribution of data contained in or derived from Data Miner requires an active PJM membership, so the derived series is internal only.'),
  ('9e000000-0000-4000-8100-000000000003'::uuid, 'caiso', 'caiso-oasis-prc-lmp',
   'CAISO OASIS PRC_LMP, day-ahead market',
   'https://oasis.caiso.com/oasisapi/SingleZip',
   'public_unauthenticated', 'research_usable', 'under_review', 'under_review', null,
   'CAISO privacy and terms of use', 'https://www.caiso.com/privacy-terms-of-use',
   'Five LMP component rows in the 2026 file, including a greenhouse-gas component. 31-day query cap; HTTP 429 observed on repeat calls.'),
  ('9e000000-0000-4000-8100-000000000004'::uuid, 'miso', 'miso-da-expost-lmp',
   'MISO day-ahead ex-post LMP daily report',
   'https://docs.misoenergy.org/marketreports/',
   'public_unauthenticated', 'production_blocked', 'under_review', 'not_permitted', true,
   'MISO legal and privacy', 'https://www.misoenergy.org/meet-miso/legal-and-privacy/',
   'Undocumented URL convention and no directory listing. The site terms forbid derivative works, so the derived series is internal only.'),
  ('9e000000-0000-4000-8100-000000000005'::uuid, 'iso-new-england', 'iso-ne-webservices-hourly-lmp-da-final',
   'ISO New England Web Services, final day-ahead hourly LMP',
   'https://webservices.iso-ne.com/docs/v1.1/',
   'account_authentication', 'research_usable', 'under_review', 'under_review', null,
   'ISO-NE legal and privacy', 'https://www.iso-ne.com/legal-privacy',
   'Basic authentication required; an anonymous call returned 401 and no payload has ever been observed. Field names come from a derived schema.'),
  ('9e000000-0000-4000-8100-000000000006'::uuid, 'nyiso', 'nyiso-mis-p-2a-dam-lbmp-zonal',
   'NYISO MIS report P-2A, day-ahead zonal LBMP',
   'http://mis.nyiso.com/public/P-2Alist.htm',
   'public_unauthenticated', 'research_usable', 'under_review', 'under_review', null,
   'NYISO legal notice', 'https://www.nyiso.com/legal-notice',
   'Fall-back days repeat the 01:00 timestamp with nothing to separate the two rows; source row order is the only discriminator.'),
  ('9e000000-0000-4000-8100-000000000007'::uuid, 'southwest-power-pool', 'spp-portal-da-lmp-by-settlement-location',
   'SPP Integrated Marketplace, day-ahead LMP by settlement location',
   'https://portal.spp.org/pages/da-lmp-by-settlement-location',
   'public_unauthenticated', 'production_blocked', 'permitted', 'not_permitted', true,
   'SPP portal terms of use', 'https://portal.spp.org/terms-of-use',
   'Commercial publication requires express written authorization from an SPP officer, so the derived series is internal only. The BAA column appeared between 8 March and 12 April 2026.')
) as v(id, provider_slug, slug, name, canonical_url, access_class, production_state, terms_state,
       data_use_state, written_agreement, terms_title, terms_url, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- --------------------------------------------------------------- use purposes

insert into reference.source_use_purposes (code, display_name, is_public, description) values
  ('uepi_retention', 'UEPI retention', false,
   'Holding retrieved day-ahead price artifacts and the normalized hourly observations derived from them.'),
  ('uepi_calculation', 'UEPI calculation', false,
   'Using retained hourly prices to calculate a daily UEPI value, without that value leaving Urdais.'),
  ('public_derived_uepi_value_display', 'Public display of a derived UEPI value', true,
   'A daily UEPI value Urdais derived from a market operator''s published prices may be shown publicly.'),
  ('public_raw_wholesale_price_display', 'Public display of source wholesale prices', true,
   'The market operator''s own hourly prices may be shown publicly, attributed to the operator.')
on conflict (code) do nothing;

-- --------------------------------------------------------------- rights determinations
--
-- One reviewed determination per source and purpose, effective-dated. The classification is the
-- reviewer's finding and is never rewritten: Urdais publishing an ambiguous source under
-- founder-accepted risk does not make that source cleared, and a later written permission is a new
-- row rather than an edit to this one.
--
-- Retention and public display are separated deliberately. PJM's terms permit internal use and
-- forbid redistribution of derived data; MISO's clause is broad enough that even internal
-- retention is unresolved. Those are different answers to different questions and the schema is
-- able to say so.

insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, decisive_clause, reviewed_by, reviewed_on, effective_from, notes)
select si.id, v.purpose, v.classification, v.disposition,
       v.attribution_required, v.attribution_text, v.conditions, v.unresolved_issue,
       v.terms_url, v.decisive_clause,
       'Urdais founder review, UEPI phase 1 rights study', date '2026-09-24',
       timestamptz '2026-09-24T00:00:00Z', v.notes
from (values
  -- ERCOT: the only affirmative grant in the set.
  ('ercot-emil-dam-settlement-point-prices', 'public_derived_uepi_value_display',
   'reusable_with_attribution_or_conditions', 'permitted', true,
   'Source: ERCOT. Urdais calculation; ERCOT does not guarantee the accuracy of derived compilations.',
   'Attribute ERCOT and do not present the daily mean as an ERCOT-published index.', null,
   'https://www.ercot.com/help/terms',
   'Raw data provided in public portions of this website may be used, reproduced, and redistributed in compilations, charts, and analyses without maintaining such notices. ERCOT does not guarantee the accuracy of any such compilations, charts, or analyses.',
   'Terms of Use section 5 is an affirmative grant for raw public data in compilations and analyses.'),
  ('ercot-emil-dam-settlement-point-prices', 'uepi_retention',
   'reusable_with_attribution_or_conditions', 'permitted', false, null,
   'Retain locally; the data access portal limits repeat downloads of the same report.', null,
   'https://www.ercot.com/help/terms',
   'The publicly available contents of this website may be used, reproduced, and redistributed, provided that the contents are not modified and that you maintain all copyright and other notices contained in the contents.',
   'Storage of public raw data is not forbidden by the terms.'),

  -- PJM: internal use allowed, derived publication named and prohibited.
  ('pjm-data-miner-da-hrl-lmps', 'public_derived_uepi_value_display',
   'unsuitable_without_permission', 'prohibited', false, null,
   'An active PJM membership, minimum Associate, is the condition PJM names.', null,
   'https://www.pjm.com/markets-and-operations/etools/data-miner-2',
   'Redistribution of information and or data contained in or derived from Data Miner is strictly prohibited without an active PJM Membership.',
   'The clause names derived data explicitly, so a daily mean of pricing node 1 is covered by it.'),
  ('pjm-data-miner-da-hrl-lmps', 'uepi_retention',
   'reusable_with_attribution_or_conditions', 'permitted', false, null,
   'Internal use only. Nothing derived from this source may be redistributed without membership.', null,
   'https://www.pjm.com/markets-and-operations/etools/data-miner-2',
   'Information and data contained in Data Miner is for internal use only.',
   'Internal use is the use the terms describe; publication is a separate determination and is prohibited.'),

  -- CAISO: the website terms and the API terms disagree, and the price pull is the API.
  ('caiso-oasis-prc-lmp', 'public_derived_uepi_value_display',
   'ambiguous_requires_legal_review', 'not_established', true,
   'Source: California ISO (OASIS). Urdais calculation.', null,
   'The website terms allow public-records use with credit, while the API terms reserve all right, title and interest in CAISO Data and grant none. The prices are obtained through the API.',
   'https://www.caiso.com/privacy-terms-of-use',
   'These terms grant you no right, title or interest in any intellectual property owned or licensed by CAISO, including without limitation the CAISO API and any CAISO Data.',
   'Published under founder-accepted legal risk with the unresolved issue attached to the value.'),
  ('caiso-oasis-prc-lmp', 'uepi_retention',
   'ambiguous_requires_legal_review', 'not_established', false, null, null,
   'The API terms do not clearly grant local retention of CAISO Data.',
   'https://www.caiso.com/privacy-terms-of-use',
   'CAISO owns all right, title and interest in and to the CAISO API and CAISO Data.',
   'Retained internally under the same founder-accepted risk as display.'),

  -- MISO: the broadest clause in the set. Even retention is unresolved.
  ('miso-da-expost-lmp', 'public_derived_uepi_value_display',
   'unsuitable_without_permission', 'prohibited', false, null,
   'A written permission from MISO, or a finding by counsel that the clause does not reach numeric market prices.', null,
   'https://www.misoenergy.org/meet-miso/legal-and-privacy/',
   'You are not permitted to modify, publish, transmit, participate in the transfer or sale of, reproduce, create derivative works of, distribute, publicly perform, publicly display or in any way exploit any of the materials or content on this Website.',
   'Creating derivative works is named, and a daily mean derived from the file is one.'),
  ('miso-da-expost-lmp', 'uepi_retention',
   'ambiguous_requires_legal_review', 'not_established', false, null, null,
   'The clause names reproduction and distribution generally, not only publication, so internal retention is not clearly permitted either. Counsel should answer the retention half separately.',
   'https://www.misoenergy.org/meet-miso/legal-and-privacy/',
   'Access to this Website does not confer any license.',
   'Retention proceeds under the platform rule for internal-only sources while the question is open.'),

  -- ISO-NE: ambiguous terms, and no observed payload. Posture blocks it regardless.
  ('iso-ne-webservices-hourly-lmp-da-final', 'public_derived_uepi_value_display',
   'ambiguous_requires_legal_review', 'not_established', true,
   'Source: ISO New England. Urdais calculation.', null,
   'The legal page asserts copyright in the content and warns that non-personal use may violate it, without granting or clearly forbidding reuse of numeric prices.',
   'https://www.iso-ne.com/legal-privacy',
   'Any duplication of the Content or non-personal use may violate copyright, trademark, and other laws.',
   'Publication is additionally blocked by readiness: no authenticated payload has been observed.'),
  ('iso-ne-webservices-hourly-lmp-da-final', 'uepi_retention',
   'ambiguous_requires_legal_review', 'not_established', false, null, null,
   'The legal page does not address retention as a licence question.',
   'https://www.iso-ne.com/legal-privacy',
   'The Content is protected by copyright under United States laws.',
   'No artifact has been retrieved at all; the determination exists so ingestion cannot begin without one.'),

  -- NYISO: no licence conferred, and no sentence reaching the numeric CSVs either.
  ('nyiso-mis-p-2a-dam-lbmp-zonal', 'public_derived_uepi_value_display',
   'ambiguous_requires_legal_review', 'not_established', true,
   'Source: NYISO. Urdais calculation.', null,
   'The legal notice confers no licence and reserves all intellectual property; its explicit republication ban names images and video rather than the public CSV data.',
   'https://www.nyiso.com/legal-notice',
   'Downloading, republishing, retransmitting, reproducing, or other use of any image or video on this website as a stand-alone file is strictly prohibited.',
   'Published under founder-accepted legal risk with the unresolved issue attached to the value.'),
  ('nyiso-mis-p-2a-dam-lbmp-zonal', 'uepi_retention',
   'ambiguous_requires_legal_review', 'not_established', false, null, null,
   'Access is stated to confer no licence, and retention is not separately addressed.',
   'https://www.nyiso.com/legal-notice',
   'Access to this website does not confer any license or ownership interest.',
   'Retained internally under the same founder-accepted risk as display.'),

  -- SPP: citation is enough for non-commercial copying, and a commercial page is not that.
  ('spp-portal-da-lmp-by-settlement-location', 'public_derived_uepi_value_display',
   'unsuitable_without_permission', 'prohibited', false, null,
   'Express written authorization from a duly authorized officer of SPP.', null,
   'https://portal.spp.org/terms-of-use',
   'Commercial use of any information contained on the Portal requires express written authorization from the author(s) or a duly authorized officer of SPP.',
   'A public Urdais page is a commercial publication, and citation alone does not satisfy the exception.'),
  ('spp-portal-da-lmp-by-settlement-location', 'uepi_retention',
   'ambiguous_requires_legal_review', 'not_established', false, null, null,
   'Copying with citation is implicitly permitted, and internal storage is neither the commercial-publication trigger nor an express grant.',
   'https://portal.spp.org/terms-of-use',
   'Permission is implicitly granted to copy and distribute the materials in whole or in part (with appropriate citation) EXCEPT when such materials will be used, in whole or in part, within a commercial publication.',
   'Retained internally; publication stays prohibited until an authorization exists.')
) as v(source_slug, purpose, classification, disposition, attribution_required, attribution_text,
       conditions, unresolved_issue, terms_url, decisive_clause, notes)
join reference.source_interfaces si on si.slug = v.source_slug
on conflict do nothing;

-- --------------------------------------------------------------- benchmark definitions

create table reference.power_price_benchmarks (
  id                     uuid primary key,
  slug                   text not null unique
                           constraint power_price_benchmarks_slug_format
                           check (slug ~ '^uepi-[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name           text not null,
  market_symbol          text not null unique,
  grid_area_id           uuid not null references reference.grid_areas (id) on delete restrict,
  source_interface_id    uuid not null references reference.source_interfaces (id) on delete restrict,
  -- What the price contains. Never flattened away: a delivered price and a system energy
  -- component are different economic objects that happen to share a unit.
  price_construct        text not null
                           constraint power_price_benchmarks_construct_allowed
                           check (price_construct in ('delivered_price', 'system_energy_component')),
  value_derivation       text not null
                           constraint power_price_benchmarks_derivation_allowed
                           check (value_derivation in ('published_column', 'derived_residual')),
  derivation_expression  text
                           constraint power_price_benchmarks_expression_when_derived
                           check ((value_derivation = 'derived_residual') = (derivation_expression is not null)),
  source_locator         text not null,
  -- IANA zone of the operating day. MISO's is a fixed offset, which is the substantive fact
  -- about it: it publishes Eastern Standard Time all year and never has a 23- or 25-hour day.
  operating_timezone     text not null,
  observes_dst           boolean not null,
  hour_convention        text not null
                           constraint power_price_benchmarks_hour_convention_allowed
                           check (hour_convention in ('hour_ending', 'hour_beginning', 'unresolved')),
  dst_evidence           text not null
                           constraint power_price_benchmarks_dst_evidence_allowed
                           check (dst_evidence in ('verified', 'expected_unverified', 'unresolved')),
  daily_aggregation      text not null default 'arithmetic_mean_of_valid_hours'
                           constraint power_price_benchmarks_aggregation_allowed
                           check (daily_aggregation = 'arithmetic_mean_of_valid_hours'),
  publication_posture    text not null
                           constraint power_price_benchmarks_posture_allowed
                           check (publication_posture in ('publishable', 'internal_only', 'not_built')),
  benchmark_definition   text not null,
  geographic_scope       text not null,
  -- What the construct leaves out, published verbatim beside the value.
  excluded_components    text[] not null default '{}',
  effective_from         timestamptz not null,
  effective_to           timestamptz,
  created_at             timestamptz not null default now(),
  constraint power_price_benchmarks_interval_ordered
    check (effective_to is null or effective_to > effective_from),
  -- A market that does not observe daylight saving cannot have unverified transition behaviour:
  -- there is no transition to have evidence about.
  constraint power_price_benchmarks_fixed_offset_is_verified
    check (observes_dst or dst_evidence = 'verified'),
  -- A series nobody may build must not claim a settled hour convention, and one that is ready to
  -- publish must have settled it.
  constraint power_price_benchmarks_unresolved_is_not_built
    check (hour_convention <> 'unresolved' or publication_posture = 'not_built')
);

comment on table reference.power_price_benchmarks is
  'One row per organized wholesale market: the UEPI series it publishes, the construct that series measures, and the operating-day rules it is read under. Identity is shared with reference.grid_areas; the price series is not the physical area.';

insert into reference.power_price_benchmarks
  (id, slug, display_name, market_symbol, grid_area_id, source_interface_id, price_construct,
   value_derivation, derivation_expression, source_locator, operating_timezone, observes_dst,
   hour_convention, dst_evidence, publication_posture, benchmark_definition, geographic_scope,
   excluded_components, effective_from)
select v.id, v.slug, v.display_name, v.market_symbol, ga.id, si.id, v.construct,
       v.derivation, v.expression, v.locator, v.timezone, v.observes_dst,
       v.hour_convention, v.dst_evidence, v.posture, v.definition, v.scope,
       v.excludes, timestamptz '2026-09-24T00:00:00Z'
from (values
  ('9e000000-0000-4000-8200-000000000001'::uuid, 'uepi-ercot', 'UEPI · ERCOT', 'ERCOT', 'ercot',
   'ercot-emil-dam-settlement-point-prices', 'delivered_price', 'published_column', null,
   'HB_HUBAVG', 'America/Chicago', true, 'hour_ending', 'expected_unverified', 'publishable',
   'Day-ahead settlement point price for the ERCOT Hub Average 345 kV Hub (HB_HUBAVG), as published by ERCOT.',
   'Four-hub 345 kV average of North, South, Houston and West. Panhandle and Lower Rio Grande Valley excluded.',
   '{}'::text[]),
  ('9e000000-0000-4000-8200-000000000002'::uuid, 'uepi-pjm', 'UEPI · PJM', 'PJM', 'pjm',
   'pjm-data-miner-da-hrl-lmps', 'delivered_price', 'published_column', null,
   '1', 'America/New_York', true, 'hour_beginning', 'expected_unverified', 'internal_only',
   'Day-ahead total LMP at PJM pricing node 1, the RTO aggregate, latest version only.',
   'PJM RTO aggregate zone, pricing node id 1. The display name differs between feeds, so the id is what identifies it.',
   '{}'::text[]),
  ('9e000000-0000-4000-8200-000000000003'::uuid, 'uepi-caiso', 'UEPI · CAISO', 'CAISO', 'caiso',
   'caiso-oasis-prc-lmp', 'system_energy_component', 'published_column', null,
   'TH_NP15_GEN-APND', 'America/Los_Angeles', true, 'hour_ending', 'expected_unverified', 'publishable',
   'Day-ahead Marginal Energy Cost (MCE), the component the CAISO tariff defines as the same throughout the balancing authority area.',
   'CAISO balancing-authority reference price. The trading-hub row is a carrier for reading the system component, not a location.',
   array['marginal congestion (MCC)', 'marginal losses (MCL)', 'the marginal greenhouse-gas component (MGHG)']),
  ('9e000000-0000-4000-8200-000000000004'::uuid, 'uepi-miso', 'UEPI · MISO', 'MISO', 'miso',
   'miso-da-expost-lmp', 'system_energy_component', 'derived_residual', 'LMP - MCC - MLC',
   'INDIANA.HUB', 'Etc/GMT+5', false, 'hour_ending', 'verified', 'internal_only',
   'Day-ahead ex-post system energy component, derived as LMP minus MCC minus MLC from the ex-post file. MISO publishes no MEC column.',
   'MISO system energy price. The carrier node is one of the eight official hubs; the residual is identical at every internal location.',
   array['marginal congestion (MCC)', 'marginal losses (MLC)']),
  ('9e000000-0000-4000-8200-000000000005'::uuid, 'uepi-iso-ne', 'UEPI · ISO-NE', 'ISO-NE', 'iso-ne',
   'iso-ne-webservices-hourly-lmp-da-final', 'delivered_price', 'published_column', null,
   '4000', 'America/New_York', true, 'unresolved', 'unresolved', 'not_built',
   'Final day-ahead Hub LMP at location 4000, which Market Rule 1 defines as the arithmetic average of the Hub''s nodes.',
   'ISO New England internal Hub, location id 4000.',
   '{}'::text[]),
  ('9e000000-0000-4000-8200-000000000006'::uuid, 'uepi-nyiso', 'UEPI · NYISO', 'NYISO', 'nyiso',
   'nyiso-mis-p-2a-dam-lbmp-zonal', 'system_energy_component', 'derived_residual',
   'LBMP - Marginal Cost Losses + Marginal Cost Congestion',
   '61752', 'America/New_York', true, 'hour_beginning', 'verified', 'publishable',
   'Day-ahead system marginal price at the NYCA reference bus, derived from one internal zone''s LBMP, losses and congestion.',
   'NYISO reference bus. The carrier is internal zone WEST (PTID 61752); external proxies are never used.',
   array['marginal losses', 'marginal congestion']),
  ('9e000000-0000-4000-8200-000000000007'::uuid, 'uepi-spp', 'UEPI · SPP', 'SPP', 'spp',
   'spp-portal-da-lmp-by-settlement-location', 'system_energy_component', 'published_column', null,
   'SPP', 'America/Chicago', true, 'hour_ending', 'verified', 'internal_only',
   'Day-ahead Marginal Energy Component (MEC) for balancing authority SPP, the published system energy price.',
   'SPP Integrated Marketplace (east). Balancing authority SWPW is excluded; participant hubs are not the system price.',
   array['marginal congestion (MCC)', 'marginal losses (MLC)'])
) as v(id, slug, display_name, market_symbol, grid_area_slug, source_slug, construct, derivation,
       expression, locator, timezone, observes_dst, hour_convention, dst_evidence, posture,
       definition, scope, excludes)
join reference.grid_areas ga on ga.slug = v.grid_area_slug
join reference.source_interfaces si on si.slug = v.source_slug;

-- --------------------------------------------------------------- layer A: raw evidence

create table pipeline.raw_uepi_price_records (
  id                     uuid primary key default gen_random_uuid(),
  retrieval_id           uuid not null references pipeline.source_retrievals (id) on delete restrict,
  benchmark_id           uuid not null references reference.power_price_benchmarks (id) on delete restrict,
  -- Source row order, and it is load-bearing rather than bookkeeping: on a NYISO fall-back day two
  -- rows print the same 01:00 timestamp with nothing else to tell them apart.
  row_ordinal            integer not null
                           constraint raw_uepi_price_records_ordinal_nonnegative check (row_ordinal >= 0),
  record_hash            text not null
                           constraint raw_uepi_price_records_hash_format check (record_hash ~ '^[0-9a-f]{64}$'),
  -- Exactly as printed. A price is text until the normalizer has seen it.
  native_operating_date  text not null,
  native_interval_label  text not null,
  -- The source's own UTC field where it has one; null for NYISO, MISO and the ERCOT display.
  native_interval_utc    timestamptz,
  native_value           text,
  native_components      jsonb not null default '{}'::jsonb,
  native_source_version  jsonb,
  raw_payload            jsonb not null,
  created_at             timestamptz not null default now(),
  unique (retrieval_id, row_ordinal),
  unique (retrieval_id, record_hash)
);

comment on table pipeline.raw_uepi_price_records is
  'One source row exactly as published, before interpretation. Append-only: raw evidence is never rewritten, and a correction is a new retrieval rather than an edit.';

-- --------------------------------------------------------------- layer B: normalized hours

create table pipeline.uepi_price_observations (
  id                       uuid primary key default gen_random_uuid(),
  raw_uepi_price_record_id uuid not null unique
                             references pipeline.raw_uepi_price_records (id) on delete restrict,
  benchmark_id             uuid not null references reference.power_price_benchmarks (id) on delete restrict,
  operating_date           date not null,
  interval_start           timestamptz not null,
  interval_end             timestamptz not null,
  hour_ordinal             smallint not null
                             constraint uepi_price_observations_ordinal_range
                             check (hour_ordinal between 1 and 25),
  -- Signed, and deliberately carrying no non-negativity constraint. A wholesale price that cannot
  -- be negative is not a wholesale price: SPP hourly MEC reached -$15.26 on 12 April 2026.
  price_usd_per_mwh        numeric not null
                             constraint uepi_price_observations_price_is_a_number
                             check (price_usd_per_mwh <> 'NaN'::numeric),
  price_construct          text not null
                             constraint uepi_price_observations_construct_allowed
                             check (price_construct in ('delivered_price', 'system_energy_component')),
  value_derivation         text not null
                             constraint uepi_price_observations_derivation_allowed
                             check (value_derivation in ('published_column', 'derived_residual')),
  derivation_expression    text,
  source_version           jsonb,
  source_published_at      timestamptz,
  retrieved_at             timestamptz not null,
  quality_status           text not null
                             constraint uepi_price_observations_quality_allowed
                             check (quality_status in ('accepted', 'suspect')),
  quality_notes            text[] not null default '{}',
  superseded_by_id         uuid references pipeline.uepi_price_observations (id) on delete restrict
                             deferrable initially deferred,
  superseded_at            timestamptz,
  supersession_reason      text,
  created_at               timestamptz not null default now(),
  constraint uepi_price_observations_one_hour check (interval_end = interval_start + interval '1 hour'),
  constraint uepi_price_observations_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  )
);

-- The key is the UTC instant, never the market-local label. That is what makes a repeated
-- fall-back hour representable at all: two rows printed "01:00" are two different instants.
create unique index uepi_price_observations_current_idx
  on pipeline.uepi_price_observations (benchmark_id, interval_start)
  where superseded_by_id is null;
create index uepi_price_observations_day_idx
  on pipeline.uepi_price_observations (benchmark_id, operating_date, interval_start);

comment on table pipeline.uepi_price_observations is
  'One normalized hourly benchmark price, keyed by UTC instant and signed. Superseded rather than updated: a source revision is a new row and the old one stays readable.';

create or replace function pipeline.check_uepi_price_observation()
returns trigger
language plpgsql
as $$
declare
  raw record;
  benchmark record;
begin
  select * into raw from pipeline.raw_uepi_price_records where id = new.raw_uepi_price_record_id;
  select * into benchmark from reference.power_price_benchmarks where id = new.benchmark_id;

  if raw.benchmark_id <> new.benchmark_id then
    raise exception 'observation claims benchmark % but its raw record is %', new.benchmark_id, raw.benchmark_id
      using errcode = 'check_violation';
  end if;
  -- The construct and derivation are the benchmark's, not the adapter's opinion of the moment.
  if benchmark.price_construct <> new.price_construct
     or benchmark.value_derivation <> new.value_derivation
     or benchmark.derivation_expression is distinct from new.derivation_expression then
    raise exception 'observation does not carry %''s construct and derivation', benchmark.slug
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger uepi_price_observations_check
  before insert on pipeline.uepi_price_observations
  for each row execute function pipeline.check_uepi_price_observation();
create trigger raw_uepi_price_records_append_only
  before update or delete on pipeline.raw_uepi_price_records
  for each row execute function pipeline.forbid_mutation();
create trigger uepi_price_observations_supersede_only
  before update or delete on pipeline.uepi_price_observations
  for each row execute function pipeline.allow_only_supersession();

-- --------------------------------------------------------------- layer C: released daily values

create table pipeline.uepi_daily_values (
  id                           uuid primary key default gen_random_uuid(),
  benchmark_id                 uuid not null references reference.power_price_benchmarks (id) on delete restrict,
  operating_date               date not null,
  value_usd_per_mwh            numeric not null
                                 constraint uepi_daily_values_value_is_a_number
                                 check (value_usd_per_mwh <> 'NaN'::numeric),
  observation_count            smallint not null,
  expected_observation_count   smallint not null
                                 constraint uepi_daily_values_expected_range
                                 check (expected_observation_count between 23 and 25),
  -- Completeness is exact, in the database as well as in the calculation. There is no threshold
  -- below 100%: a 23-hour spring day is complete at 23 hours and a 23-hour day in June is a hole.
  constraint uepi_daily_values_complete
    check (observation_count = expected_observation_count),
  hour_span_start              timestamptz not null,
  hour_span_end                timestamptz not null,
  -- SHA-256 over the specification version and the ordered (interval, price) pairs, so a
  -- recomputation can be checked rather than trusted.
  input_digest                 text not null
                                 constraint uepi_daily_values_digest_format check (input_digest ~ '^[0-9a-f]{64}$'),
  price_construct              text not null
                                 constraint uepi_daily_values_construct_allowed
                                 check (price_construct in ('delivered_price', 'system_energy_component')),
  methodology_version_id       uuid not null references reference.methodology_versions (id) on delete restrict,
  specification_digest         text not null
                                 constraint uepi_daily_values_spec_digest_format
                                 check (specification_digest ~ '^[0-9a-f]{64}$'),
  quality_checks               jsonb not null default '[]'::jsonb,
  released_at                  timestamptz not null,
  release_kind                 text not null
                                 constraint uepi_daily_values_release_kind_allowed
                                 check (release_kind in ('scheduled', 'backfill', 'operator')),
  revision_of_id               uuid references pipeline.uepi_daily_values (id) on delete restrict,
  superseded_by_id             uuid references pipeline.uepi_daily_values (id) on delete restrict
                                 deferrable initially deferred,
  superseded_at                timestamptz,
  supersession_reason          text,
  created_at                   timestamptz not null default now(),
  constraint uepi_daily_values_span_ordered check (hour_span_end > hour_span_start),
  constraint uepi_daily_values_supersession_together check (
    (superseded_by_id is null and superseded_at is null and supersession_reason is null) or
    (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)
  )
);

create unique index uepi_daily_values_current_idx
  on pipeline.uepi_daily_values (benchmark_id, operating_date)
  where superseded_by_id is null;
create index uepi_daily_values_history_idx
  on pipeline.uepi_daily_values (benchmark_id, operating_date desc, released_at desc);

comment on table pipeline.uepi_daily_values is
  'One released daily UEPI value. Append-only with supersession: a correction is a new row pointing at the one it replaces, so what was published and when both stay answerable.';

-- A released value must carry an approved specification, and the digest it claims must be the one
-- that version was approved with. Enforced here rather than in the application so a future caller
-- cannot reintroduce a draft-version release by mistake.
create or replace function pipeline.check_uepi_daily_value()
returns trigger
language plpgsql
as $$
declare
  version record;
  benchmark record;
begin
  select mv.status, mv.content_hash, m.slug
    into version
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where mv.id = new.methodology_version_id;

  if version.slug is distinct from 'uepi' then
    raise exception 'a UEPI value must reference a version of the UEPI specification, not %',
      coalesce(version.slug, 'an absent methodology') using errcode = 'check_violation';
  end if;
  if version.status is distinct from 'approved' then
    raise exception 'the specification version of this value is %, not approved', version.status
      using errcode = 'check_violation';
  end if;
  if version.content_hash is distinct from new.specification_digest then
    raise exception 'the value claims specification digest % but the registered digest is %',
      new.specification_digest, coalesce(version.content_hash, 'absent') using errcode = 'check_violation';
  end if;

  select * into benchmark from reference.power_price_benchmarks where id = new.benchmark_id;
  if benchmark.price_construct <> new.price_construct then
    raise exception 'a % value cannot be released for %, which measures %',
      new.price_construct, benchmark.slug, benchmark.price_construct using errcode = 'check_violation';
  end if;
  -- A series nobody may build yet cannot have a value at all.
  if benchmark.publication_posture = 'not_built' then
    raise exception '% has no verified source payload; no value may be released for it', benchmark.slug
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger uepi_daily_values_check
  before insert on pipeline.uepi_daily_values
  for each row execute function pipeline.check_uepi_daily_value();
create trigger uepi_daily_values_supersede_only
  before update or delete on pipeline.uepi_daily_values
  for each row execute function pipeline.allow_only_supersession();

-- --------------------------------------------------------------- operational ledger

create table pipeline.uepi_ingestion_runs (
  id                    uuid primary key default gen_random_uuid(),
  trigger_kind          text not null
                          constraint uepi_ingestion_runs_trigger_allowed
                          check (trigger_kind in ('scheduled', 'operator', 'backfill')),
  requested_start       date not null,
  requested_end         date not null,
  started_at            timestamptz not null,
  completed_at          timestamptz not null,
  outcome               text not null
                          constraint uepi_ingestion_runs_outcome_allowed
                          check (outcome in ('succeeded', 'partial', 'failed')),
  retrieval_count       integer not null default 0,
  raw_record_count      integer not null default 0,
  observation_inserts   integer not null default 0,
  days_released         integer not null default 0,
  days_withheld         integer not null default 0,
  days_superseded       integer not null default 0,
  -- Per-market outcomes and the reason each withheld day was withheld. A day held for a missing
  -- hour and a day held because a source forbids publication are different operational events.
  detail                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  constraint uepi_ingestion_runs_range_ordered check (requested_end >= requested_start),
  constraint uepi_ingestion_runs_time_ordered check (completed_at >= started_at)
);

comment on table pipeline.uepi_ingestion_runs is
  'One UEPI ingestion or release run. What the freshness monitor and the unattended-rollover closeout gate read.';

-- --------------------------------------------------------------- privileges

alter table reference.power_price_benchmarks   enable row level security;
alter table pipeline.raw_uepi_price_records    enable row level security;
alter table pipeline.uepi_price_observations   enable row level security;
alter table pipeline.uepi_daily_values         enable row level security;
alter table pipeline.uepi_ingestion_runs       enable row level security;
