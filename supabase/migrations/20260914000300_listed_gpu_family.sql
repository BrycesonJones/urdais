-- The UCPI LISTED GPU family: a reusable specification, four new listed GPU
-- children, the H100 child re-parented under it, one diagnostic, and the seller
-- evidence gathered on 14 September 2026 from the sellers' own public terms and
-- price surfaces (preserved under docs/research/providers).
--
-- Seller legal identity (the family counts sellers by contracting legal entity):
--   Verda: Terms and Conditions (verda.com/terms-and-conditions, last updated
--     30 September 2025, retrieved 2026-09-14) name "Verda (DataCrunch Oy)" as
--     the Supplier throughout, governed by the law of Finland, arbitration in
--     Helsinki. Recorded as legal_name 'DataCrunch Oy'.
--   Massed Compute: only a copyright notice ("© 2021–2026 Massed Compute, Inc.")
--     was retrievable; the Terms and Conditions body did not render. Not
--     recorded as a legal name; noted as probable and unevidenced.
--   Denvr: website Terms of Use (last updated 21 July 2023) are "entered into by
--     and between you and Denvr Dataworks Corp.", Alberta law. Website terms, not
--     a services agreement; not recorded as a legal name. Denvr sells the target
--     GPUs as eight-GPU nodes in any case.
--   Voltage Park: its site now states "Voltage Park has merged with Lightning
--     AI". The contracting entity for on-demand H100 was not re-verified tonight;
--     the existing evidence (Terms of Service naming Voltage Park, Inc.) stands
--     with this risk noted.
--
-- Nothing here changes any source permission state or any published value.

insert into reference.diagnostic_codes (code, description) values
  ('SELLER_PRICE_TIERED_BY_QUANTITY', 'The seller lists different per-accelerator prices by instance quantity and the technical source supplies one provider-level figure, which may be the seller''s median across quantities rather than the canonical single-accelerator price. Disclosed, never an exclusion.');

update reference.market_entities
   set legal_name = 'DataCrunch Oy',
       notes = 'Verda, formerly DataCrunch. Terms and Conditions (verda.com/terms-and-conditions, last updated 30 September 2025, retrieved 2026-09-14) name "Verda (DataCrunch Oy)" as the Supplier; governed by the law of Finland; arbitration seated in Helsinki. Price surface (retrieved 2026-09-14) lists 1x instances for H100 SXM5 80GB, H200 SXM5 141GB, B200 SXM6 180GB, A100 SXM4 80GB and A100 SXM4 40GB.'
 where slug = 'datacrunch' and legal_name is null;

update reference.market_entities
   set notes = 'Reseller of rented capacity per the dataset''s provider notes; operator undetermined. Only a copyright notice ("© 2021–2026 Massed Compute, Inc.") was retrievable on 2026-09-14; the Terms and Conditions body did not render, so no contracting entity is evidenced. Price surface (retrieved 2026-09-14): B200 SXM6 only as x8 (USD 43.46/hr for the node); A100 SXM4 (80GB) x1 USD 1.38/hr; H200 NVL (141GB) x1 USD 3.62/hr; H100 SXM5 (80GB) x1 USD 2.89/hr.'
 where slug = 'massedcompute';

update reference.market_entities
   set notes = 'Website Terms of Use (denvr.com, last updated 21 July 2023, retrieved 2026-09-14) are between the user and Denvr Dataworks Corp. under Alberta law; a services agreement naming the contracting entity was not found, so no legal name is recorded. Price surface (2026-09-14): H100 SXM, A100 SXM 80 GB and A100 SXM 40 GB sold as 8-GPU nodes.'
 where slug = 'denvr';

update reference.market_entities
   set notes = notes || ' Site notice retrieved 2026-09-14: "Voltage Park has merged with Lightning AI"; the contracting entity for on-demand H100 was not re-verified and is a recorded risk.'
 where slug = 'voltagepark';

-- The reusable listed-GPU specification is recorded as a methodology document with its own hash lineage.
-- Children keep the UCPI family methodology version as their methodology parent; this row records the shared text they cite.
insert into reference.methodologies (id, slug, name, document_path) values
  ('11111111-0000-4000-8000-000000000002', 'ucpi-listed-gpu', 'UCPI-LISTED-GPU family specification', 'docs/methodology/ucpi-listed-gpu.md');
insert into reference.methodology_versions (id, methodology_id, version, status, document_path, content_hash) values
  ('11111111-0000-4000-8000-000000000201', '11111111-0000-4000-8000-000000000002', '0.1.0-draft', 'draft', 'docs/methodology/ucpi-listed-gpu.md', '28e7586a9d3e4531418f1c347702821de101255416ac2832177976220acb9684');

-- H100 listed child re-parented under the family specification; no rule changed.
insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('22222222-0000-4000-8000-000000000203', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000112',
   '0.1.2-draft', 'draft', 'docs/methodology/ucpi-h100-sxm-listed.md', 'ab493329ab965a8b552fb63078ca7af7a4a66c77bbdfe0b837300c95bb00cdbc');

-- Four listed GPU children, proposed, with their first draft specifications.
insert into reference.instruments (id, symbol, name, category, methodology_id, output_unit, output_currency, lifecycle_status) values
  ('22222222-0000-4000-8000-000000000003', 'UCPI-H200-SXM-LISTED', 'UCPI-H200-SXM-LISTED', 'compute_price', '11111111-0000-4000-8000-000000000001', 'USD / H200 SXM accelerator-hour (listed)', 'USD', 'proposed'),
  ('22222222-0000-4000-8000-000000000004', 'UCPI-B200-LISTED', 'UCPI-B200-LISTED', 'compute_price', '11111111-0000-4000-8000-000000000001', 'USD / B200 accelerator-hour (listed)', 'USD', 'proposed'),
  ('22222222-0000-4000-8000-000000000005', 'UCPI-A100-SXM4-80GB-LISTED', 'UCPI-A100-SXM4-80GB-LISTED', 'compute_price', '11111111-0000-4000-8000-000000000001', 'USD / A100 SXM4 80GB accelerator-hour (listed)', 'USD', 'proposed'),
  ('22222222-0000-4000-8000-000000000006', 'UCPI-RTX-5090-LISTED', 'UCPI-RTX-5090-LISTED', 'compute_price', '11111111-0000-4000-8000-000000000001', 'USD / RTX 5090 accelerator-hour (listed)', 'USD', 'proposed');

insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('22222222-0000-4000-8000-000000000301', '22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000112', '0.1.0-draft', 'draft', 'docs/methodology/ucpi-h200-sxm-listed.md', '9addde9d580ccd6ff9a17f3aefce631e05cacf95ac05e50cc533f3567836998d'),
  ('22222222-0000-4000-8000-000000000401', '22222222-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000112', '0.1.0-draft', 'draft', 'docs/methodology/ucpi-b200-listed.md', '9b122754eb2efc3086299cc857b492a29c19e31b68b6595fc314318c47e76f4b'),
  ('22222222-0000-4000-8000-000000000501', '22222222-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000112', '0.1.0-draft', 'draft', 'docs/methodology/ucpi-a100-sxm4-80gb-listed.md', 'a8f1c67dd1d9b0017bcf2848deecfb7ccfa76d2f0261e08848c82f16b5833bdb'),
  ('22222222-0000-4000-8000-000000000601', '22222222-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000112', '0.1.0-draft', 'draft', 'docs/methodology/ucpi-rtx-5090-listed.md', 'd6656c2b44806b3a9ee620c2c2c14c505d5d99d11719b2ff2caee2d70f295414');

do $$
declare n integer;
begin
  select count(*) into n from reference.instruments where lifecycle_status = 'live';
  if n <> 0 then raise exception 'an instrument is live'; end if;
  select count(*) into n from reference.instrument_spec_versions where status <> 'draft';
  if n <> 0 then raise exception 'a spec version left draft status'; end if;
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 1 then raise exception 'expected exactly one production-approved source, found %', n; end if;
  if not exists (select 1 from reference.source_interfaces where slug = 'runpod-gpu-types' and production_access_state = 'production_blocked')
     or not exists (select 1 from reference.source_interfaces where slug = 'lambda-instance-types' and production_access_state = 'production_blocked')
     or not exists (select 1 from reference.source_interfaces where slug = 'vast-ai-offer-search' and production_access_state = 'production_blocked') then
    raise exception 'a direct interface state moved'; end if;
  select count(*) into n from pipeline.regional_publications;
  if n <> 0 then raise exception 'a publication exists'; end if;
  select count(*) into n from reference.market_entities where slug in ('massedcompute', 'denvr', 'nebius') and legal_name is not null;
  if n <> 0 then raise exception 'a legal name was asserted without a services agreement'; end if;
end
$$;
