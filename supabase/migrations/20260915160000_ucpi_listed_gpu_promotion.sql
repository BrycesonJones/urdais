-- UCPI-LISTED-GPU 1.0.0: approved, and the five listed children approved with it.
--
-- This is the first approved methodology anywhere in the UCPI family. Until now
-- every UCPI version was a draft, and the publication guard added in
-- 20260915040000 refuses to release a value computed under one. That guard is
-- the reason this migration is the whole of the decision: approving a version is
-- now the act that makes publication possible, and it is done here, once,
-- reviewably, rather than implied by a code path.
--
-- What is approved is the listed-price track only. UCPI-H100-SXM, the
-- accessible-offer child, is untouched and remains launch_blocked under its own
-- draft lineage. The two measure different economic objects and this migration
-- does not blur them.
--
-- Binding. Before this migration the five listed instruments declared the UCPI
-- family as their methodology, and their specification versions referenced UCPI
-- family versions, because UCPI-LISTED-GPU existed as a document row with no
-- children bound to it. reference.check_spec_version_parent() requires a spec
-- version to reference a version of the instrument's own methodology, so binding
-- the new specification versions to UCPI-LISTED-GPU 1.0.0 requires the five
-- instruments themselves to declare UCPI-LISTED-GPU. Both moves are made here,
-- in that order. This is a two-level binding -- instrument to specification --
-- and no third level is introduced: the UCPI family document remains the source
-- of the shared primitives the specification names, and is not a versioning
-- parent of these children.
--
-- The historical 0.1.x drafts are retained exactly as recorded. They are lineage,
-- they were never effective, and nothing is rewritten to conform them to the new
-- binding.

-- 1. The approved specification version.
insert into reference.methodology_versions (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('11111111-0000-4000-8000-000000000202', '11111111-0000-4000-8000-000000000002', '1.0.0', 'approved',
   'docs/methodology/ucpi-listed-gpu.md', '5a519f4a4b981895b50901689fc19b4dc478d36f25b007875bfe63d6e7fc3b37', date '2026-09-15');

-- 2. The five listed instruments declare UCPI-LISTED-GPU as their methodology.
update reference.instruments
   set methodology_id = '11111111-0000-4000-8000-000000000002'
 where symbol in ('UCPI-H100-SXM-LISTED', 'UCPI-H200-SXM-LISTED', 'UCPI-B200-LISTED',
                  'UCPI-A100-SXM4-80GB-LISTED', 'UCPI-RTX-5090-LISTED');

-- 3. The approved child specification versions, bound to UCPI-LISTED-GPU 1.0.0.
insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash, effective_from) values
  ('22222222-0000-4000-8000-000000000210', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000202', '1.0.0', 'approved',
   'docs/methodology/ucpi-h100-sxm-listed.md',       'c13a1aec335b099f72db3de19be446ba3bc2d052133a26b2fecf86b3631378b5', date '2026-09-15'),
  ('22222222-0000-4000-8000-000000000310', '22222222-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000202', '1.0.0', 'approved',
   'docs/methodology/ucpi-h200-sxm-listed.md',       '203109ee084843b31b421345fba1e395106c06b867316f25bf323679c57d7d61', date '2026-09-15'),
  ('22222222-0000-4000-8000-000000000410', '22222222-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000202', '1.0.0', 'approved',
   'docs/methodology/ucpi-b200-listed.md',           '217da5adcfa14a8e5259b1ddf6d4e3b37f6a824bb0c14c7812cb9319e732734a', date '2026-09-15'),
  ('22222222-0000-4000-8000-000000000510', '22222222-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000202', '1.0.0', 'approved',
   'docs/methodology/ucpi-a100-sxm4-80gb-listed.md', 'b6f9d626385ec009220745c6013b311cf99b1218a5ea2c86f4ab6a6213ce8226', date '2026-09-15'),
  ('22222222-0000-4000-8000-000000000610', '22222222-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000202', '1.0.0', 'approved',
   'docs/methodology/ucpi-rtx-5090-listed.md',       'ffbd0ded28666779ecc8c0beebf0b4c31c02dcb7da7b1e74603b4f9fd2e69bcb', date '2026-09-15');

-- 4. The seller-refusal exclusion.
--
-- Runpod refused Urdais, in writing on 14 September 2026, permission to use its
-- catalog and pricing data as an input to a commercial market-data product. That
-- refusal was recorded in 20260914050000 as a decision about the intended use
-- rather than the retrieval mechanism, in terms that name the route explicitly:
-- "no alternative endpoint, method, cache or intermediary cures it."
--
-- Runpod's listed price nonetheless arrives through Price of Compute, whose own
-- terms permit collection and data use. Those terms govern Urdais's use of the
-- Price of Compute dataset; they do not, and cannot, grant what Runpod withheld
-- about Runpod's own data. Admitting the row because it came by a different road
-- would make the aggregator a way around an answer Urdais asked for and got.
--
-- So the seller is excluded by every route. This costs breadth and it moves the
-- H100 listed value -- with Runpod the four-seller median is 3.74, without it the
-- three-seller median is 3.99 -- and the exclusion is recorded so that the cost
-- is visible rather than absorbed.
insert into reference.exclusion_reasons (code, stage, category, description) values
  ('SELLER_USE_REFUSED', 'P1', 'source',
   'The seller has refused Urdais, in writing, permission to use its price data for the intended use, as a decision about the use rather than the retrieval mechanism. Excluded by every route, including a permitted intermediary that redistributes the same price. Never counts toward breadth; disclosed as an excluded candidate.');

alter table reference.market_entities add column use_refused_evidence text;

comment on column reference.market_entities.use_refused_evidence is
  'Where the seller has refused Urdais the intended use in writing, the reference to that refusal; null otherwise. Set, the seller is excluded from every listed series by every route, an intermediary included, because what was refused was the use and not the road.';

update reference.market_entities
   set use_refused_evidence = 'Runpod Support, 2026-09-14: refused approval of systematic retrieval of catalog, pricing and availability data for the purpose of building a compilation, and of use of that data as an input to a commercial market-data product. Thread 1a09b4ce294d8be3, message 1a0a01a2456e600d, provider reference MM1GD7-PVV4K. Preserved in docs/architecture/sources/runpod-permission-denied.md.',
       notes = coalesce(notes || ' ', '') ||
       'Excluded from every UCPI listed series as SELLER_USE_REFUSED: Runpod refused Urdais permission on 2026-09-14 to use its catalog and pricing data as an input to a commercial market-data product, as a decision about the intended use rather than the retrieval mechanism. The refusal is not cured by receiving the same listed price through Price of Compute. Reopening requires a materially different intended use and a fresh written approval from Runpod.'
 where slug = 'runpod';

-- Nothing is published and nothing outside the listed track moved.
do $$
declare
  n integer;
begin
  select count(*) into n from pipeline.regional_publications;
  if n <> 0 then raise exception 'a UCPI publication exists before the first approved version'; end if;

  -- The five bind to UCPI-LISTED-GPU 1.0.0, approved and effective.
  select count(*) into n
    from reference.instrument_spec_versions sv
    join reference.instruments i on i.id = sv.instrument_id
    join reference.methodology_versions mv on mv.id = sv.methodology_version_id
    join reference.methodologies m on m.id = mv.methodology_id
   where sv.version = '1.0.0' and sv.status = 'approved' and sv.effective_from = date '2026-09-15'
     and m.slug = 'ucpi-listed-gpu' and mv.version = '1.0.0'
     and i.methodology_id = m.id;
  if n <> 5 then raise exception 'expected five approved listed children bound to ucpi-listed-gpu 1.0.0, found %', n; end if;

  -- The accessible child is untouched: still UCPI family, still draft, still blocked.
  select count(*) into n
    from reference.instruments i join reference.methodologies m on m.id = i.methodology_id
   where i.symbol = 'UCPI-H100-SXM' and m.slug = 'ucpi' and i.lifecycle_status = 'launch_blocked';
  if n <> 1 then raise exception 'UCPI-H100-SXM must remain a launch_blocked child of the UCPI family'; end if;
  select count(*) into n
    from reference.instrument_spec_versions sv join reference.instruments i on i.id = sv.instrument_id
   where i.symbol = 'UCPI-H100-SXM' and sv.status <> 'draft';
  if n <> 0 then raise exception 'an accessible-child specification version is no longer a draft'; end if;

  -- The UCPI family document itself is not approved by this migration.
  select count(*) into n
    from reference.methodology_versions mv join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'ucpi' and mv.status = 'approved';
  if n <> 0 then raise exception 'the UCPI family methodology was approved, which this migration must not do'; end if;

  -- Historical drafts are retained.
  select count(*) into n
    from reference.instrument_spec_versions sv join reference.instruments i on i.id = sv.instrument_id
   where i.symbol like 'UCPI%LISTED' and sv.status = 'draft';
  if n < 7 then raise exception 'listed draft lineage was removed, found % draft rows', n; end if;

  select count(*) into n from reference.exclusion_reasons where code = 'SELLER_USE_REFUSED';
  if n <> 1 then raise exception 'SELLER_USE_REFUSED was not recorded'; end if;
end
$$;
