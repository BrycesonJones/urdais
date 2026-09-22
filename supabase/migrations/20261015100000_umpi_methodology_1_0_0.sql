-- UMPI Phase 6: approve methodology 1.0.0 for public use.
--
-- The founder approved the UMPI-KR DRAM methodology for publication on 22 September 2026. This
-- records that decision through the registry's ordinary lifecycle: a new approved, effective
-- version, with the draft retained as its superseded predecessor.
--
-- **What approval does not do.** It does not change a source's rights. The Bank of Korea
-- determinations stay `ambiguous_requires_legal_review` with their founder-accepted-risk marker,
-- and the assertion at the foot of this migration enforces that — an approved methodology says
-- Urdais may publish this measurement, not that a question about a source credential has been
-- answered. It also approves only the two series this document defines: not the deferred spot
-- architecture, not chip quotes, not HBM, not a composite, not the export price index.
--
-- **Why the draft's calculations are not relabelled.** Methodology version is part of a
-- calculation's identity — it is inside every publication's `inputs_digest`. Repointing a column
-- would make the lineage of an already-computed value assert a methodology that was not in force
-- when it was produced. Pointing the series at 1.0.0 changes the digest of every derived point,
-- so the next derivation supersedes the draft's rows by recalculation from the same inputs. The
-- draft rows stay for audit. No row is edited here.

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from)
values
  ('98000000-0000-4000-8000-000000000022', '98000000-0000-4000-8000-000000000020',
   '1.0.0', 'approved', 'docs/methodology/umpi-kr-dram.md',
   'fe0ea889d2f783703bf98a5dbe9818ffbf54e893baaecbacb520ff6691f1dacb', date '2026-09-22')
on conflict (methodology_id, version) do nothing;

-- The draft becomes the predecessor. It is retained rather than deleted: it is what governed the
-- internal records Phase 5 produced, and those records stay readable.
update reference.methodology_versions
   set status = 'superseded', effective_to = date '2026-09-22'
 where methodology_id = '98000000-0000-4000-8000-000000000020'
   and version = '0.1.0-draft';

-- Both series now derive and publish under the approved version.
update reference.umpi_series
   set methodology_version_id = '98000000-0000-4000-8000-000000000022';

do $$
declare n integer; s text; d date;
begin
  select mv.status, mv.effective_from into s, d
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.version = '1.0.0';
  if s is distinct from 'approved' then raise exception 'UMPI 1.0.0 is %, expected approved', s; end if;
  if d is distinct from date '2026-09-22' then raise exception 'UMPI 1.0.0 is effective %, expected 2026-09-22', d; end if;

  -- Exactly one approved version, and the draft preserved beside it.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.status = 'approved';
  if n <> 1 then raise exception 'expected exactly one approved UMPI version, found %', n; end if;
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi-kr-dram' and mv.version = '0.1.0-draft' and mv.status = 'superseded';
  if n <> 1 then raise exception 'the 0.1.0-draft predecessor was not preserved as superseded'; end if;

  -- Both series point at the approved version.
  select count(*) into n from reference.umpi_series
   where methodology_version_id <> '98000000-0000-4000-8000-000000000022';
  if n <> 0 then raise exception '% UMPI series still reference a non-approved methodology', n; end if;

  -- The deferred spot methodology is untouched and stays unapproved.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'umpi' and mv.status = 'approved';
  if n <> 0 then raise exception 'the deferred spot methodology was approved by this migration'; end if;

  -- Rights are unchanged. Approval is not a rights finding.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces si on si.id = sup.source_interface_id
   where si.slug = 'bok-ecos-producer-price-commodity'
     and sup.effective_to is null
     and sup.rights_classification = 'ambiguous_requires_legal_review'
     and sup.notes = 'founder_accepted_risk';
  if n <> 4 then raise exception 'the BOK founder-accepted ambiguity was disturbed by approval, found %', n; end if;

  -- No publication is promoted by this migration; recalculation under 1.0.0 does that.
  select count(*) into n from pipeline.umpi_publications where publication_state = 'published';
  if n <> 0 then raise exception 'this migration published % row(s)', n; end if;
end $$;
