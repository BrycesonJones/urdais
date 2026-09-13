-- Market-breadth amendment: record the two new draft methodology versions.
--
-- UCPI 0.1.1-draft resolves the participant-count publication rule above the
-- family's structural floor: a region with exactly two independent capacity
-- sources publishes with a mandatory market-breadth qualifier of Minimum, a
-- region with three or more publishes at Normal breadth, and the participant
-- count ceases to be a numerical gate. UCPI-H100-SXM 0.1.2-draft adopts that
-- rule in the child's terms and removes the participant count from its
-- numerical launch blockers, leaving three.
--
-- The markdown documents remain authoritative. These rows identify the
-- versions and record the SHA-256 of each document as amended. The earlier
-- versions stay in place for lineage; nothing is superseded, because nothing
-- was ever approved. Both new rows are drafts and carry no effective date.
--
-- No publication-layer table is created. The market-breadth qualifier is a
-- property of a published value and belongs to the Phase 6 publication layer,
-- not to reference.diagnostic_codes, whose rows describe properties of
-- observations. Nothing external changes: no provider, no source interface,
-- no classification, no observation.

insert into reference.methodology_versions (id, methodology_id, version, status, document_path, content_hash) values
  ('11111111-0000-4000-8000-000000000111',
   '11111111-0000-4000-8000-000000000001',
   '0.1.1-draft', 'draft', 'docs/methodology/ucpi.md',
   '98ceca9f581fa198949fb7a3d5ace40e43b1e0924ea18ae1db96bafd14bf177f');

insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('22222222-0000-4000-8000-000000000112',
   '22222222-0000-4000-8000-000000000001',
   '11111111-0000-4000-8000-000000000111',
   '0.1.2-draft', 'draft', 'docs/methodology/ucpi-h100-sxm.md',
   '54239de2193feb873dcf78b6c5f64ff268f606d3dc406491125e51a3064314eb');

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
