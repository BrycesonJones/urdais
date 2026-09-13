-- Methodology and instrument lineage: seeds exist, spec references its parent,
-- drafts carry no effective date, and the parent check cannot be bypassed.
begin;

do $$
declare
  n integer;
  ok boolean;
begin
  select count(*) into n from reference.methodologies where slug = 'ucpi';
  if n <> 1 then raise exception 'expected exactly one UCPI methodology, found %', n; end if;

  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'ucpi' and mv.version = '0.1.0-draft' and mv.status = 'draft';
  if n <> 1 then raise exception 'expected UCPI 0.1.0-draft, found %', n; end if;

  select count(*) into n from reference.instruments where symbol = 'UCPI-H100-SXM' and lifecycle_status = 'launch_blocked';
  if n <> 1 then raise exception 'expected UCPI-H100-SXM in launch_blocked state, found %', n; end if;

  select count(*) into n from reference.instrument_spec_versions sv
    join reference.instruments i on i.id = sv.instrument_id
    join reference.methodology_versions mv on mv.id = sv.methodology_version_id
    join reference.methodologies m on m.id = mv.methodology_id
   where i.symbol = 'UCPI-H100-SXM' and sv.version = '0.1.1-draft' and sv.status = 'draft'
     and m.slug = 'ucpi' and mv.version = '0.1.0-draft';
  if n <> 1 then raise exception 'expected H100 0.1.1-draft referencing UCPI 0.1.0-draft, found %', n; end if;

  -- No draft anywhere carries an effective date.
  select count(*) into n from reference.methodology_versions where status = 'draft' and (effective_from is not null or effective_to is not null);
  if n <> 0 then raise exception 'a draft methodology version carries an effective date'; end if;
  select count(*) into n from reference.instrument_spec_versions where status = 'draft' and (effective_from is not null or effective_to is not null);
  if n <> 0 then raise exception 'a draft spec version carries an effective date'; end if;

  -- Content hashes are recorded for both seeded documents.
  select count(*) into n from reference.methodology_versions where content_hash is null;
  if n <> 0 then raise exception 'seeded methodology version lacks a content hash'; end if;
  select count(*) into n from reference.instrument_spec_versions where content_hash is null;
  if n <> 0 then raise exception 'seeded spec version lacks a content hash'; end if;

  -- A draft with an effective date is rejected.
  ok := false;
  begin
    insert into reference.methodology_versions (methodology_id, version, status, document_path, effective_from)
    values ('11111111-0000-4000-8000-000000000001', '9.9.9-draft', 'draft', 'x.md', date '2026-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'draft with effective_from was accepted'; end if;

  -- A spec version pointing at a version of a different methodology is rejected.
  insert into reference.methodologies (id, slug, name, document_path)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'other-family', 'Other', 'other.md');
  insert into reference.methodology_versions (id, methodology_id, version, status, document_path)
  values ('aaaaaaaa-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000001', '0.1.0-draft', 'draft', 'other.md');
  ok := false;
  begin
    insert into reference.instrument_spec_versions (instrument_id, methodology_version_id, version, status, document_path)
    values ('22222222-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000101', '9.9.9-draft', 'draft', 'x.md');
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'spec version referencing a foreign methodology version was accepted'; end if;

  -- A methodology with dependants cannot be deleted.
  ok := false;
  begin
    delete from reference.methodologies where slug = 'ucpi';
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'methodology with versions was deletable'; end if;

  raise notice 'lineage: ok';
end $$;

rollback;
