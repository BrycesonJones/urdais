-- UTVI methodology 1.0.0: approved for production on 16 September 2026, effective from
-- 1 January 2025, which is where the source's retained history and therefore the series begins.
--
-- This migration is the activation switch, and it is the only one. The publication trigger
-- added in 20260916000000 reads reference.methodology_versions.status and refuses any value
-- whose methodology is not approved; every one of the 621 backfilled dates was refused on
-- that basis. Promoting the version is therefore a governance act with a database effect,
-- which is exactly why it is a migration rather than a flag.
--
-- The substantive change from 0.1.1-draft is the observation universe, and it is a narrowing.
-- The draft described the universe as "public, non-hidden model traffic", which asserts
-- something the source's documentation does not say: OpenRouter documents that rankings-daily
-- covers "the top 50 public models per day" and documents nothing about bring-your-own-key
-- traffic or traffic from applications their owners have hidden. Urdais asked and has no
-- answer.
--
-- So 1.0.0 defers instead of asserting:
--
--   UTVI measures token volume exposed by OpenRouter's rankings-daily dataset for the traffic
--   included by that dataset. Urdais makes no claim about inclusion of BYOK or hidden/private
--   application traffic unless OpenRouter explicitly documents it.
--
-- The reason to prefer the narrower sentence is specific rather than fastidious. The universe
-- descriptor is frozen onto every published value, so a descriptor that later proves wrong
-- cannot be corrected without superseding every point that carries it. A claim that cannot
-- become false costs nothing and removes that risk entirely.
--
-- 0.1.1-draft is retired rather than superseded: nothing was ever published under it, so
-- there is no value whose lineage it holds and nothing for 1.0.0 to restate.
--
-- The effective date is 2025-01-01, not the approval date, and the distinction is deliberate.
-- A value is computed under the version in force on its own calculation date; the source
-- retains daily history from 2025-01-01, and UTVI has never had any other version. So 1.0.0
-- is in force for the whole series, which is a statement of fact rather than a backdating
-- convenience: there is no earlier version whose values would be restated, and no date in the
-- series was ever computed under anything else. The two dates are kept apart in the row --
-- `created_at` records when the version was approved, `effective_from` records the span it
-- governs -- so the record shows both.
--
-- Had the effective date been the approval date instead, every one of the 621 backfilled
-- dates would have been refused by the trigger's own effective-date check, and UTVI's public
-- series would have begun today with no history at all.

-- 0.1.1-draft published nothing, which the trigger guaranteed. Assert it rather than assume
-- it: if a value existed under the draft, retiring the draft would orphan its lineage.
do $$
declare
  n integer;
begin
  select count(*) into n
    from pipeline.utvi_publications p
    join pipeline.utvi_calculations c on c.id = p.calculation_id
    join reference.methodology_versions mv on mv.id = c.methodology_version_id
   where mv.version = '0.1.1-draft';
  if n <> 0 then
    raise exception 'UTVI 0.1.1-draft has % publication(s); it cannot be retired', n;
  end if;
end $$;

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('7c000000-0000-4000-8000-000000000020', '7c000000-0000-4000-8000-000000000010',
   '1.0.0', 'approved', 'docs/methodology/utvi.md',
   '66d9b3c0ab1362953720d9b43198a3af71a54685a73fb5bec008080584c50b77',
   date '2025-01-01')
on conflict (methodology_id, version) do nothing;

update reference.methodology_versions
   set status = 'retired'
 where id = '7c000000-0000-4000-8000-000000000011'
   and status = 'draft';

-- The instrument's specification version follows its methodology. UTVI has one instrument and
-- no children, so the spec version is the methodology document itself; its hash is that
-- file's, salted with the spec identity, as UBWI's is and for the same reason.
insert into reference.instrument_spec_versions
  (id, instrument_id, methodology_version_id, version, status, document_path, content_hash, effective_from) values
  ('7c000000-0000-4000-8000-000000000021', '7c000000-0000-4000-8000-000000000012',
   '7c000000-0000-4000-8000-000000000020', '1.0.0', 'approved', 'docs/methodology/utvi.md',
   '7ec2d0e3d03066d14903de9d2c0d59c45f8cb6420cd0bb4e5996fdd448cc96a6',
   date '2025-01-01')
on conflict (instrument_id, version) do nothing;

update reference.instrument_spec_versions
   set status = 'retired'
 where id = '7c000000-0000-4000-8000-000000000013'
   and status = 'draft';

-- The instrument goes live. It was launch_blocked because its methodology was a draft, which
-- is no longer true.
update reference.instruments
   set lifecycle_status = 'live'
 where symbol = 'UTVI' and lifecycle_status = 'launch_blocked';

-- The approval is only real if the gate now passes. Prove it here rather than discovering it
-- on the first production run: a run that cannot publish would otherwise look like an outage.
do $$
declare
  v record;
begin
  select status, effective_from into v
    from reference.methodology_versions where id = '7c000000-0000-4000-8000-000000000020';
  if v.status <> 'approved' or v.effective_from is null then
    raise exception 'UTVI 1.0.0 did not reach approved status with an effective date';
  end if;
  if not exists (select 1 from reference.instruments where symbol = 'UTVI' and lifecycle_status = 'live') then
    raise exception 'the UTVI instrument is not live';
  end if;
  if exists (select 1 from reference.methodology_versions
              where methodology_id = '7c000000-0000-4000-8000-000000000010'
                and status = 'draft') then
    raise exception 'a UTVI methodology draft is still active alongside the approved version';
  end if;
end $$;

comment on table pipeline.utvi_publications is
  'The release of one UTVI calculation, frozen at publication. The universe descriptor is frozen with the value because coverage is part of what was published, and under 1.0.0 that descriptor defers to the source rather than asserting what the source does not document. Corrections are supersessions, never edits.';
