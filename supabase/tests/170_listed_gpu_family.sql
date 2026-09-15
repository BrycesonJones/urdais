-- The listed GPU family: four new proposed children with draft specs under the
-- UCPI family version, the H100 child re-parented at 0.1.2-draft, the reusable
-- specification recorded with its own hash, the quantity-tier diagnostic, and
-- seller legal identity recorded only where a services agreement names it.
begin;

do $$
declare
  n integer;
  family uuid := '11111111-0000-4000-8000-000000000112';
begin
  select count(*) into n from reference.instruments where symbol in ('UCPI-H200-SXM-LISTED', 'UCPI-B200-LISTED', 'UCPI-A100-SXM4-80GB-LISTED', 'UCPI-RTX-5090-LISTED') and lifecycle_status = 'proposed';
  if n <> 4 then raise exception 'expected four proposed listed children, found %', n; end if;
  select count(*) into n from reference.instrument_spec_versions sv join reference.instruments i on i.id = sv.instrument_id
   where i.symbol in ('UCPI-H200-SXM-LISTED', 'UCPI-B200-LISTED', 'UCPI-A100-SXM4-80GB-LISTED', 'UCPI-RTX-5090-LISTED')
     and sv.version = '0.1.0-draft' and sv.status = 'draft' and sv.methodology_version_id = family and sv.content_hash ~ '^[0-9a-f]{64}$';
  if n <> 4 then raise exception 'expected four child spec versions under UCPI 0.1.2-draft, found %', n; end if;
  select count(distinct content_hash) into n from reference.instrument_spec_versions;
  if n <> (select count(*) from reference.instrument_spec_versions) then raise exception 'two spec versions share a content hash'; end if;

  if not exists (select 1 from reference.instrument_spec_versions sv join reference.instruments i on i.id = sv.instrument_id
                  where i.symbol = 'UCPI-H100-SXM-LISTED' and sv.version = '0.1.2-draft' and sv.status = 'draft' and sv.methodology_version_id = family) then
    raise exception 'H100 listed 0.1.2-draft missing'; end if;
  select count(*) into n from reference.instrument_spec_versions sv join reference.instruments i on i.id = sv.instrument_id where i.symbol = 'UCPI-H100-SXM-LISTED';
  if n <> 3 then raise exception 'expected three H100 listed versions (0.1.0, 0.1.1, 0.1.2), found %', n; end if;

  if not exists (select 1 from reference.methodology_versions mv join reference.methodologies m on m.id = mv.methodology_id
                  where m.slug = 'ucpi-listed-gpu' and mv.version = '0.1.0-draft' and mv.status = 'draft' and mv.content_hash ~ '^[0-9a-f]{64}$') then
    raise exception 'UCPI-LISTED-GPU 0.1.0-draft missing'; end if;
  if not exists (select 1 from reference.diagnostic_codes where code = 'SELLER_PRICE_TIERED_BY_QUANTITY') then raise exception 'tier diagnostic missing'; end if;

  -- Legal identity: Verda evidenced from its Terms and Conditions; the others stay null with the evidence noted.
  if not exists (select 1 from reference.market_entities where slug = 'datacrunch' and legal_name = 'DataCrunch Oy' and notes like '%Terms and Conditions%') then raise exception 'Verda legal identity'; end if;
  select count(*) into n from reference.market_entities where slug in ('massedcompute', 'denvr', 'nebius', 'coreweave', 'azure', 'vast') and legal_name is not null;
  if n <> 0 then raise exception 'a legal name was asserted without a services agreement'; end if;

  -- Still nothing live, published or newly permitted.
  -- UBWI went live in methodology 1.2.0. No compute instrument has, which is what this
  -- file is about, so the assertion is narrowed by name rather than dropped.
  select count(*) into n from reference.instruments where lifecycle_status = 'live' and symbol <> 'UBWI'; if n <> 0 then raise exception 'an instrument other than UBWI is live'; end if;
  select count(*) into n from pipeline.regional_publications; if n <> 0 then raise exception 'a publication exists'; end if;
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved' and source_class <> 'news_feed';
  if n <> 1 then raise exception 'approved compute sources: %', n; end if;

  raise notice 'listed gpu family: ok';
end $$;

rollback;
