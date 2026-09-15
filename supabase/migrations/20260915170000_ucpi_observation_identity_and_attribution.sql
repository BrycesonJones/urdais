-- A normalized observation must be re-readable as what it was.
--
-- pipeline.normalized_observations stored the interpretation of an offer but not the
-- canonical hardware identity that interpretation established, nor the attribution the
-- source requires, nor the evidence strings behind tenancy and region. Nothing noticed
-- while the only consumer was an in-process pipeline that still had the objects in memory.
--
-- The scheduled job reads the day's observations back out and recalculates from them, and
-- at that point the gap is load-bearing: without vendor, model, form factor and memory,
-- every stored row fails identity on re-assessment with WRONG_HARDWARE, and the index can
-- never be calculated from storage. An observation that cannot be re-assessed from what was
-- written is not normalized; it is a number with a note attached.
--
-- Attribution is the other half and is a methodology requirement rather than a convenience:
-- UCPI-LISTED-GPU requires the source's attribution to be carried "on every observation,
-- every seller, capacity-source and regional record, and every public representation of the
-- value". It was carried everywhere except the observation.
--
-- These are additive and nullable. Existing rows are unaffected and no value changes; there
-- are no production compute observations to migrate.

alter table pipeline.normalized_observations
  add column gpu_vendor                     text,
  add column gpu_model                      text,
  add column form_factor                    text,
  add column gpu_memory_gb                  numeric,
  add column tenancy_evidence               text,
  add column region_mapping_evidence        text,
  add column source_attribution             text,
  add column seller_prices_by_quantity_tier boolean;

comment on column pipeline.normalized_observations.gpu_vendor is
  'Canonical accelerator vendor established by normalization. With model, form factor and memory this is the identity the instrument is matched on, and it must survive a round trip or the observation cannot be re-assessed.';
comment on column pipeline.normalized_observations.form_factor is
  'Canonical form factor. A different form factor of the same model is a different instrument and is never collapsed into a sibling.';
comment on column pipeline.normalized_observations.source_attribution is
  'The attribution the technical source requires, carried on the observation as the methodology requires, so that it travels with the row rather than being re-derived at the surface.';
comment on column pipeline.normalized_observations.seller_prices_by_quantity_tier is
  'True where the source supplies one provider-level figure for a seller that lists per-accelerator prices by instance quantity; carries the SELLER_PRICE_TIERED_BY_QUANTITY diagnostic. Disclosed, never excluded.';

-- Nothing is published and no observation was invented.
do $$
declare n integer;
begin
  select count(*) into n from pipeline.regional_publications;
  if n <> 0 then raise exception 'a publication exists; this column was added after a release'; end if;
end
$$;
