-- UEPI authenticated-market recovery: source evidence, recorded.
--
-- This migration changes what Urdais has *observed*, and nothing about what Urdais may publish. No
-- rights classification, permission, disposition or attribution is touched by it, and no value is
-- written or removed.
--
-- Three benchmark rows carry a field describing how well their daylight-saving behaviour is known,
-- and one carries a posture that said no adapter could exist. Both were honest when they were
-- written and are now out of date, because the files have been read:
--
--   ERCOT   -- the authenticated NP4-190-CD payload returns 23 rows on spring forward, omitting the
--              hour-ending label, and 25 in autumn with the repeated 02:00 separated by DSTFlag.
--   CAISO   -- UEPI-2 captured and committed both transition days: 23 hours in spring with the
--              label omitted, and 25 in autumn with the repeat filed as OPR_HR 25 between hours 2
--              and 3. The evidence landed; this row was not updated at the time, which left a
--              release gate refusing days the repository already has proof for.
--   ISO-NE  -- the authenticated payload has now been observed for an ordinary day and both
--              transition days. `BeginDate` states each hour's start with an explicit offset, which
--              settles the hour convention the specification recorded as unresolved.
--
-- ISO-NE's posture moves from `not_built` to `internal_only`, which is the narrow change the
-- evidence supports: the series may be ingested, calculated and stored, and it may not be
-- displayed. `internal_only` is refused by the publication gate exactly as PJM, MISO and SPP are.
-- Publication additionally waits on the legal review the frozen specification names in §J.3, and
-- that review is a founder decision, not a consequence of a credential working.

update reference.power_price_benchmarks
   set dst_evidence = 'verified'
 where slug in ('uepi-ercot', 'uepi-caiso')
   and dst_evidence = 'expected_unverified';

update reference.power_price_benchmarks
   set hour_convention = 'hour_beginning',
       dst_evidence = 'verified',
       publication_posture = 'internal_only'
 where slug = 'uepi-iso-ne';

-- The posture must not have become publishable by accident, and no other market may have moved.
do $$
declare
  publishable integer;
  internal integer;
  not_built integer;
begin
  select count(*) into publishable from reference.power_price_benchmarks where publication_posture = 'publishable';
  select count(*) into internal    from reference.power_price_benchmarks where publication_posture = 'internal_only';
  select count(*) into not_built   from reference.power_price_benchmarks where publication_posture = 'not_built';
  if publishable <> 3 or internal <> 4 or not_built <> 0 then
    raise exception 'unexpected posture distribution after the evidence update: % publishable, % internal, % not built',
      publishable, internal, not_built using errcode = 'check_violation';
  end if;
  if exists (select 1 from reference.power_price_benchmarks where slug = 'uepi-iso-ne' and publication_posture <> 'internal_only') then
    raise exception 'ISO-NE must be internal_only: evidence of a readable source is not a right to publish'
      using errcode = 'check_violation';
  end if;
end $$;
