-- Open-weight vs Proprietary: methodology 1.0.1, a wording-only clarification of §8.
--
-- **Why a successor version for a change that alters no number.**
--
-- 1.0.0's `content_hash` pins `docs/methodology/open-weight-proprietary.md` as it stood when
-- that version was approved. Amending the document in place and re-pointing the hash would
-- leave no record that the approved text ever said anything else -- which is the one thing the
-- hash exists to prevent. The repository has settled this before: UBWI 1.0.0 was superseded
-- rather than rewritten, with the reasoning recorded in
-- `20260915000400_ubwi_chainlink_and_taiwan.sql`, and UTVI 1.0.0 was preserved when 1.1.0
-- changed the Market Share denominator. An approved version is immutable by convention, and
-- this follows it rather than making an exception for a small change.
--
-- **What changed.** §8 previously described all unlinked volume as "identity work Urdais has
-- not done". Production showed that to be wrong about a large part of it: an anonymous or
-- routing alias names no model to research, so it is not a backlog item and never becomes one.
-- The cause is now split into `unmapped` (researchable) and `unresolvable identity` (not).
-- §10 additionally records that each class's price sample is reported independently.
--
-- **What did not change.** The public classes, the fold, the denominator, the identity rules,
-- the capability rule and the Pareto price population are identical. No published figure
-- moves: the split is explanatory, and the derivation asserts that the causes still sum to the
-- same Unclassified total. This migration writes no observation and recomputes nothing.

update reference.methodology_versions
   set status = 'superseded', effective_to = date '2026-09-16'
 where id = '4a000000-0000-4000-8000-000000000011';

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('4a000000-0000-4000-8000-000000000012', '4a000000-0000-4000-8000-000000000010',
   '1.0.1', 'approved', 'docs/methodology/open-weight-proprietary.md',
   -- sha256 of docs/methodology/open-weight-proprietary.md at this commit.
   'ac1417245ba079b197045383043d96c7c406beed45db7cc2924a95625d201e0e', date '2026-09-16')
on conflict (methodology_id, version) do nothing;

do $$
declare
  n integer;
begin
  -- Exactly one approved version, and it is the new one. The read layer takes the newest row
  -- and refuses to publish unless it is approved, so two approved versions would make which
  -- one governs depend on insertion order.
  select count(*) into n from reference.methodology_versions v
    join reference.methodologies m on m.id = v.methodology_id
   where m.slug = 'open-weight-proprietary' and v.status = 'approved';
  if n <> 1 then raise exception 'expected exactly 1 approved open-weight methodology version, found %', n; end if;

  -- 1.0.0 is still on record. Losing it would defeat the reason this migration exists.
  if not exists (select 1 from reference.methodology_versions v
                  join reference.methodologies m on m.id = v.methodology_id
                 where m.slug = 'open-weight-proprietary' and v.version = '1.0.0'
                   and v.status = 'superseded' and v.effective_to is not null) then
    raise exception 'open-weight methodology 1.0.0 is not preserved as a superseded version';
  end if;
end $$;
