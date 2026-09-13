-- Calculation calendar: record UCPI 0.1.2-draft and UCPI-H100-SXM 0.1.4-draft.
--
-- The family now owns the daily timing convention: a calculation date is a UTC
-- calendar date with the half-open window [D 00:00:00Z, D+1 00:00:00Z), the
-- cutoff is the next midnight exclusive, Urdais's observation time controls
-- eligibility, the last complete reconfirmation before the cutoff is the
-- observation, publication follows validation with a deadline at the following
-- cutoff, and every calendar date is a calculation date. The family also
-- confirms that its fixed-selection alternative for seller reduction extends
-- to the quantity dimension. The child inherits the calendar unchanged and
-- withdraws both parent requests as answered.
--
-- The markdown remains authoritative; these rows identify the versions and
-- record the SHA-256 of each document as amended. Earlier versions stay for
-- lineage. Nothing external changes: no provider, no source interface, no
-- classification, no observation, no publication-layer table.

insert into reference.methodology_versions (id, methodology_id, version, status, document_path, content_hash) values
  ('11111111-0000-4000-8000-000000000112',
   '11111111-0000-4000-8000-000000000001',
   '0.1.2-draft', 'draft', 'docs/methodology/ucpi.md',
   '1aec0c9a3f1e764f599ade31f114c7ba853efbeaa3e56bb849f8a44c73c8f720');

insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('22222222-0000-4000-8000-000000000114',
   '22222222-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000112',
   '0.1.4-draft', 'draft', 'docs/methodology/ucpi-h100-sxm.md',
   '0a468166ae17b591fd2e76a726693bfd6a48f3b47e39b9a86f2e5309ef328833');

-- Guards. This migration records versions and must change nothing else.
do $$
declare
  n integer;
begin
  select count(*) into n from reference.instruments where symbol = 'UCPI-H100-SXM' and lifecycle_status = 'launch_blocked';
  if n <> 1 then raise exception 'UCPI-H100-SXM is no longer launch_blocked, which this migration must not cause'; end if;

  select count(*) into n from reference.methodology_versions where status <> 'draft';
  if n <> 0 then raise exception 'a non-draft methodology version exists'; end if;
  select count(*) into n from reference.instrument_spec_versions where status <> 'draft';
  if n <> 0 then raise exception 'a non-draft spec version exists'; end if;

  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source became production-approved, which this migration must never do'; end if;
  select count(*) into n from reference.source_interfaces
   where terms_review_state = 'permitted' and data_use_terms_state = 'permitted';
  if n <> 0 then raise exception 'a source is cleared on both terms axes, which this migration must not cause'; end if;

  if exists (select 1 from information_schema.tables where table_schema in ('reference', 'pipeline')
             and table_name ~ '(calculation|participant|publication|series|ucpi_observation)') then
    raise exception 'a publication-layer table exists ahead of Phase 6';
  end if;
end
$$;
