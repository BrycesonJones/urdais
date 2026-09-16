-- Open-weight vs Proprietary: approve methodology 1.0.0.
--
-- Separated from the evidence migration on purpose. Publishing under a draft is prohibited, so
-- this row is the activation switch and nothing else is: with the classifications loaded and
-- verified but this version absent, the read layer returns null and the section states that no
-- comparison is published. That ordering is what lets production be populated and checked
-- before anything reaches a reader, which is the same discipline UTVI and Model Frontier use.

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash, effective_from) values
  ('4a000000-0000-4000-8000-000000000011', '4a000000-0000-4000-8000-000000000010',
   '1.0.0', 'approved', 'docs/methodology/open-weight-proprietary.md',
   -- sha256 of docs/methodology/open-weight-proprietary.md at this commit.
   '79067ac117dfcfd30035e3a1a846e402908025c25a0d3022b606424e5bb1a1c6', date '2026-09-16')
on conflict (methodology_id, version) do nothing;

do $$
begin
  if not exists (select 1 from reference.methodology_versions v
                  join reference.methodologies m on m.id = v.methodology_id
                 where m.slug = 'open-weight-proprietary' and v.status = 'approved'
                   and v.effective_from is not null) then
    raise exception 'Open-weight vs Proprietary has no approved methodology version with an effective date';
  end if;
end $$;
