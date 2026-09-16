-- UTVI methodology 1.1.0: the derived-breakdown amendment, approved 16 September 2026 and
-- effective from 1 January 2025. This is the version under which Market Share publishes.
--
-- What changes, and what deliberately does not.
--
-- 1.1.0 amends §13-§14, which govern the *derived breakdowns*, and nothing else. It changes no
-- UTVI value: the level, its unit, its universe, its aggregation, its coverage states, its
-- settlement lag, its deduplication rule and its attribution requirement are all untouched.
-- Every value published under 1.0.0 remains published under 1.0.0 -- `methodology_version` is
-- frozen onto each publication row, so this migration cannot and does not rewrite history.
--
-- The substantive change is the denominator. 1.0.0 §13 required a share to be stated as a
-- share of *attributed* tokens and never of the total. That rule existed to stop the residuals
-- being quietly deleted from a breakdown, and it does stop that -- but building the breakdown
-- exposed a failure of its own. Under an attributed-only denominator a lab table sums to 100 %
-- while the source's `other` row sits outside it, so the reader is shown a complete-looking
-- decomposition of a quantity that is not the published total, with no row anywhere indicating
-- the difference. That is a share of *some* observed traffic wearing the shape of a share of
-- *the* observed traffic.
--
-- Under 1.1.0 both residuals are ordinary rows against one total-observed denominator, the
-- table sums to 100 %, and the quantity being decomposed is the one UTVI publishes. The
-- protection 1.0.0 reached for is preserved and strengthened rather than dropped.
--
-- Why the effective date is 2025-01-01 and not today.
--
-- The publication trigger added in 20260916000000 refuses any calculation whose date precedes
-- its methodology version's effective date. Dating 1.1.0 from today would therefore break every
-- future *revision* of a historical date: `resolveLineage` reads the newest spec version, so a
-- re-publication of, say, 2026-05-01 would resolve to 1.1.0 and then be refused for preceding
-- it. Since 1.1.0 changes no value, there is no earlier value for it to restate, and every
-- level it governs is bit-identical to the level 1.0.0 governed. So it governs the whole series,
-- which is a statement of fact rather than a backdating convenience -- the same reasoning, and
-- the same conclusion, as 1.0.0's own effective date.
--
-- Market Share itself gets no methodology row. It is the §14 breakdown, it introduces no source,
-- no ingestion and no version of its own, and it is versioned here. Its public document at
-- docs/methodology/market-share.md states the rules in full and declares this governance.

-- 1.0.0 must still be the version every existing publication carries. Assert it rather than
-- assume it: if this migration ran twice, or if something had already rewritten a publication's
-- frozen version string, superseding 1.0.0 would silently orphan values that claim it.
do $$
declare
  n integer;
begin
  select count(*) into n from pipeline.utvi_publications where methodology_version <> '1.0.0';
  if n <> 0 then
    raise exception 'expected every existing UTVI publication to carry 1.0.0; % do not', n;
  end if;
end $$;

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('7c000000-0000-4000-8000-000000000022', '7c000000-0000-4000-8000-000000000010',
   '1.1.0', 'approved', 'docs/methodology/utvi.md',
   -- sha256 of docs/methodology/utvi.md at this commit.
   'fcd04ca84680afb901ec578a189f6f3eeca79dfe51bf407eacb7d4c2c73651a4',
   date '2025-01-01')
on conflict (methodology_id, version) do nothing;

-- 1.0.0 is superseded, not retired. It holds the lineage of 621 published values, and retiring
-- a version that values still claim would misdescribe them as withdrawn.
update reference.methodology_versions
   set status = 'superseded', effective_to = date '2026-09-16'
 where id = '7c000000-0000-4000-8000-000000000020'
   and status = 'approved';

-- The instrument's specification version follows its methodology. The spec hash is the
-- document's, salted with the spec identity: sha256('UTVI-1.1.0:' || <document sha256>).
insert into reference.instrument_spec_versions
  (id, instrument_id, methodology_version_id, version, status, document_path, content_hash, effective_from) values
  ('7c000000-0000-4000-8000-000000000023', '7c000000-0000-4000-8000-000000000012',
   '7c000000-0000-4000-8000-000000000022', '1.1.0', 'approved', 'docs/methodology/utvi.md',
   '7816ddd3f3d35ff9d863354ef4ea7c87a9d642bbec4f3803fd3778bf1612fced',
   date '2025-01-01')
on conflict (instrument_id, version) do nothing;

update reference.instrument_spec_versions
   set status = 'superseded', effective_to = date '2026-09-16'
 where id = '7c000000-0000-4000-8000-000000000021'
   and status = 'approved';

-- The amendment is only real if the pipeline will now resolve to it and publish under it. Prove
-- both here rather than discovering them on the first production run.
do $$
declare
  resolved record;
begin
  -- This is exactly the query resolveLineage runs: newest spec version for the instrument.
  select mv.version, mv.status, mv.effective_from
    into resolved
    from reference.instruments i
    join reference.instrument_spec_versions sv on sv.instrument_id = i.id
    join reference.methodology_versions mv on mv.id = sv.methodology_version_id
   where i.symbol = 'UTVI'
   order by sv.created_at desc
   limit 1;

  if resolved.version <> '1.1.0' then
    raise exception 'UTVI resolves to methodology %, not 1.1.0', resolved.version;
  end if;
  if resolved.status <> 'approved' then
    raise exception 'UTVI 1.1.0 did not reach approved status (is %)', resolved.status;
  end if;
  if resolved.effective_from <> date '2025-01-01' then
    raise exception 'UTVI 1.1.0 is effective from %, which would refuse revisions of earlier dates',
      resolved.effective_from;
  end if;
  if not exists (select 1 from reference.instruments where symbol = 'UTVI' and lifecycle_status = 'live') then
    raise exception 'the UTVI instrument is not live';
  end if;
  -- The 621 already-published values keep their own frozen version. The amendment changed no
  -- value, so nothing about them may have moved.
  if exists (select 1 from pipeline.utvi_publications where methodology_version <> '1.0.0') then
    raise exception 'an existing UTVI publication no longer carries 1.0.0';
  end if;
end $$;

comment on table pipeline.utvi_model_observations is
  'One model row of one daily snapshot, with the lab Urdais attributes it to or an explicit refusal to. Under methodology 1.1.0 these rows are also the sole basis of Market Share, which is derived from them at read time against the published daily total -- there is no second copy and no derived share table. Lab identity comes from reference data, never from the namespace.';
