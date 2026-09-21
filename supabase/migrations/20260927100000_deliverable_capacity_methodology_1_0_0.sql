-- PD-4F: the first approved deliverable capacity methodology.
--
-- Three of seven markets produce a result under it. That is the finding rather than a shortfall,
-- and the version is approved because what it claims is supported, not because seven markets were
-- wanted. ERCOT and PJM publish; MISO computes and retains internally because its terms were
-- reviewed and refused; CAISO, NYISO, ISO-NE and SPP produce nothing, each for a reason recorded
-- in the document and enforced in code.
--
-- The draft is marked superseded rather than edited. Its content hash still describes the
-- document as it stood when it was drafted, which is the point of recording a hash at all.

update reference.methodology_versions mv
   set status = 'superseded'
  from reference.methodologies m
 where m.id = mv.methodology_id
   and m.slug = 'deliverable-capacity'
   and mv.version = '0.1.0-draft';

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from)
values
  ('97000000-0000-4000-8000-000000000003',
   '97000000-0000-4000-8000-000000000001',
   '1.0.0', 'approved', 'docs/methodology/deliverable-capacity.md',
   '19f58dec83a752f6eab694f2324643f4244ee2e097674a37786d2ff56e5dcd2b', date '2026-09-21')
on conflict (methodology_id, version) do nothing;

do $$
declare n integer; h text;
begin
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.status = 'approved';
  if n <> 1 then raise exception 'expected exactly one approved deliverable capacity version, found %', n; end if;

  -- An approved version must carry the hash of the document it approved, and an effective date.
  select content_hash into h from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.version = '1.0.0';
  if h is null or h !~ '^[0-9a-f]{64}$' then
    raise exception 'the approved deliverable capacity version carries no document hash';
  end if;

  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'deliverable-capacity' and mv.version = '1.0.0' and mv.effective_from is null;
  if n <> 0 then raise exception 'the approved version has no effective date'; end if;

  -- Approving a methodology creates no results. They are calculated, not seeded.
  select count(*) into n from pipeline.deliverable_capacity_results;
  if n <> 0 then raise exception 'approving a methodology created % result(s)', n; end if;
end $$;
