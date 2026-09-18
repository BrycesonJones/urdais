-- Public research facilities.
--
-- The state vocabulary does not change. `published` remains the fully approved
-- state, `research` remains a canonical record with verification work left,
-- and `review_required` remains blocked on a person. What changes is the read
-- policy: a research record may be shown, explicitly labelled Research, when
-- the public query can independently prove the same minimum map-safety facts.

comment on column reference.facilities.publication_state is
  'Verification/publication workflow: published is fully approved and public; research may be public only when the map read path proves its position, current check, live lifecycle and admissible provenance; review_required and withdrawn are not public. Research is never an infrastructure category.';

create index facilities_public_map_candidates_idx
  on reference.facilities (publication_state, category, last_verified_date desc)
  where publication_state in ('published', 'research');

-- Methodology 2.1.0 records the public-research read policy. Earlier versions
-- remain resolvable because the rows they approved continue to name them.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('5c000000-0000-4000-8000-000000000013', '5c000000-0000-4000-8000-000000000010',
   '2.1.0', 'approved', 'docs/methodology/map-facilities.md',
   'fc1860b250383f61e205f66fd7eed5c93a2089f396d7cf91811222ee8831ae25', date '2026-09-18')
on conflict (methodology_id, version) do nothing;

update reference.methodology_versions
   set status = 'superseded', effective_to = date '2026-09-18'
 where id = '5c000000-0000-4000-8000-000000000012'
   and status = 'approved';

do $$
declare v record; n integer;
begin
  select mv.version, mv.status into v
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.status = 'approved'
   order by mv.effective_from desc, mv.version desc
   limit 1;
  if v.version <> '2.1.0' then raise exception 'map-facilities resolves to % rather than 2.1.0', v.version; end if;

  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'map-facilities' and mv.status = 'approved';
  if n <> 1 then raise exception '% approved map-facilities versions', n; end if;
end $$;
