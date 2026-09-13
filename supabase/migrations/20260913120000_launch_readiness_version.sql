-- Launch-readiness closeout: record UCPI-H100-SXM 0.1.3-draft.
--
-- The child resolves every remaining methodology parameter that did not depend
-- on a provider's permission or on a source's own statement: the seller-level
-- reduction rule (canonical-quantity selection with the seller minimum within
-- it), the bundle-envelope level (an 80 GB host-memory floor per accelerator),
-- the freshness ages and carry limit (the calculation cycle, with no carry at
-- launch), and the three numerical gates (one closed by construction, two
-- published as diagnostics). The parent is unchanged at 0.1.1-draft and the
-- new child version references it.
--
-- The markdown remains authoritative; this row identifies the version and
-- records the SHA-256 of the document as amended. Earlier versions stay for
-- lineage. Nothing external changes: no provider, no source interface, no
-- classification, no observation, no publication-layer table.

insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('22222222-0000-4000-8000-000000000113',
   '22222222-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000111',
   '0.1.3-draft', 'draft', 'docs/methodology/ucpi-h100-sxm.md',
   'b6420a0e9f03eeb23c58ed1635af5043082911d04b3fb317408197d9368eb61a');

-- Guards. This migration records a version and must change nothing else.
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
