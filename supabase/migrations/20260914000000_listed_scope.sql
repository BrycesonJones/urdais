-- Region scope on the publication layer.
--
-- The accessible child publishes country series and every row so far carries an
-- ISO country. The UCPI-H100-SXM-LISTED sibling publishes one series of listed
-- prices that sellers publish without regional differentiation; assigning a
-- country to such a price would fabricate an attribute. Seller-level,
-- capacity-source and regional rows therefore gain a scope: 'country' (region
-- required, as before) or 'listed_provider_wide' (region must be null). The
-- one-current-observation rule becomes one per instrument, scope and region key
-- per date. Nothing else changes and no row exists to migrate.

alter table pipeline.seller_observations
  alter column canonical_region_code drop not null,
  add column region_scope text not null default 'country'
    constraint seller_observations_scope_allowed check (region_scope in ('country', 'listed_provider_wide')),
  add constraint seller_observations_scope_region_consistent
    check ((region_scope = 'country' and canonical_region_code is not null) or (region_scope = 'listed_provider_wide' and canonical_region_code is null));
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'pipeline.seller_observations'::regclass and contype = 'u';
  execute format('alter table pipeline.seller_observations drop constraint %I', c);
end
$$;
create unique index seller_observations_one_per_cell_idx
  on pipeline.seller_observations (run_id, seller_entity_id, region_scope, coalesce(canonical_region_code, '--'));

alter table pipeline.capacity_source_observations
  alter column canonical_region_code drop not null,
  add column region_scope text not null default 'country'
    constraint capacity_source_scope_allowed check (region_scope in ('country', 'listed_provider_wide')),
  add constraint capacity_source_scope_region_consistent
    check ((region_scope = 'country' and canonical_region_code is not null) or (region_scope = 'listed_provider_wide' and canonical_region_code is null));
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'pipeline.capacity_source_observations'::regclass and contype = 'u';
  execute format('alter table pipeline.capacity_source_observations drop constraint %I', c);
end
$$;
create unique index capacity_source_one_per_cell_idx
  on pipeline.capacity_source_observations (run_id, capacity_source_entity_id, region_scope, coalesce(canonical_region_code, '--'));

alter table pipeline.regional_observations
  alter column canonical_region_code drop not null,
  add column region_scope text not null default 'country'
    constraint regional_observations_scope_allowed check (region_scope in ('country', 'listed_provider_wide')),
  add column source_attributions text[] not null default '{}',
  add constraint regional_observations_scope_region_consistent
    check ((region_scope = 'country' and canonical_region_code is not null) or (region_scope = 'listed_provider_wide' and canonical_region_code is null));
drop index pipeline.regional_observations_current_idx;
create unique index regional_observations_current_idx
  on pipeline.regional_observations (instrument_id, region_scope, coalesce(canonical_region_code, '--'), calculation_date)
  where superseded_by_id is null;
drop index pipeline.regional_observations_series_idx;
create index regional_observations_series_idx
  on pipeline.regional_observations (instrument_id, region_scope, canonical_region_code, calculation_date desc)
  where superseded_by_id is null;

comment on column pipeline.regional_observations.region_scope is
  'country: a regional series keyed by ISO country. listed_provider_wide: the LISTED sibling''s single series of list prices published without regional differentiation; canonical_region_code is null.';
comment on column pipeline.regional_observations.source_attributions is
  'Attribution lines required by the upstream sources behind this value, e.g. "Data: Price of Compute — priceofcompute.com". Must appear wherever the value is shown.';

do $$
begin
  if (select count(*) from pipeline.regional_observations) <> 0 then raise exception 'rows exist; scope migration expected an empty publication layer'; end if;
end
$$;
