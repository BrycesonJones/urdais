-- IQ-5: the interconnection queue analytics methodology, registered as a draft.
--
-- Registered so that the version, its effective date and the exact bytes of the document that
-- defines it are recorded before any metric is computed against them. It is a *draft*: it
-- approves nothing for publication, and six gates listed in the document are still open.
--
-- The most consequential decision it records is a negative one. No quantity kind is published by
-- all seven markets -- the best-covered reaches four, and one of those four cannot be published
-- at all -- so there is no defensible seven-market queue MW total and none may be built.

insert into reference.methodologies (id, slug, name, document_path) values
  ('97000000-0000-4000-8000-000000000020', 'interconnection-queue-analytics',
   'Urdais Interconnection Queue Analytics',
   'docs/methodology/interconnection-queue-analytics.md')
on conflict (slug) do nothing;

-- No effective date: the schema refuses one on a draft, which is the point. A draft is not in
-- force, and a date would imply it was.
insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash)
values
  ('97000000-0000-4000-8000-000000000021', '97000000-0000-4000-8000-000000000020',
   '0.1.0-draft', 'draft', 'docs/methodology/interconnection-queue-analytics.md',
   'c7a35438a819414b7929351acfcc1c4889aae682da521751d6d0b8018c755243')
on conflict (methodology_id, version) do nothing;

do $$
declare n integer;
begin
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'interconnection-queue-analytics';
  if n <> 1 then raise exception 'expected one analytics methodology version, found %', n; end if;

  -- A draft approves nothing. Nothing may be published under it.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'interconnection-queue-analytics' and mv.status <> 'draft';
  if n <> 0 then raise exception 'the analytics methodology was registered as something other than a draft'; end if;

  -- A draft is not in force and carries no effective date.
  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug = 'interconnection-queue-analytics' and mv.effective_from is not null;
  if n <> 0 then raise exception 'the draft analytics methodology claims an effective date'; end if;

  -- No derived analytics table exists yet, and IQ-5 creates none.
  select count(*) into n from information_schema.tables
   where table_schema = 'pipeline'
     and table_name in ('interconnection_queue_metrics', 'interconnection_queue_calculations',
                        'interconnection_queue_publications');
  if n <> 0 then raise exception 'a derived analytics table exists; IQ-5 is methodology only'; end if;
end $$;
