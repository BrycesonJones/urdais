-- Memory news qualification: the pass is recorded, nothing from it is enabled,
-- and Compute is exactly as Phase 1B left it.
begin;

do $$
declare
  ok boolean;
  n integer;
  skhynix uuid := '6f6f6f6f-0000-4000-8000-00000000000b';
begin
  -- The result of the pass: Memory has no ingestable source, so the rail stays
  -- on mock. This is the assertion that must not quietly flip.
  select count(*) into n from reference.news_sources where category = 'memory';
  if n <> 0 then raise exception 'a Memory news source exists; the qualification pass approved none'; end if;

  -- The pass itself is recorded. Nine candidates whose feeds actually work.
  select count(*) into n from reference.source_interfaces
   where source_class = 'news_feed' and production_access_state <> 'production_approved';
  if n < 11 then raise exception 'expected at least 11 recorded-but-unapproved news feeds, found %', n; end if;

  -- Every recorded candidate names why it was refused, in a kind that says
  -- what would have to change for it to be reconsidered.
  select count(*) into n from reference.source_interfaces
   where source_class = 'news_feed' and production_access_state <> 'production_approved'
     and terms_evidence->>'refusal_kind' is not null
     and terms_evidence->>'refusal_kind' not in ('terms', 'abandoned', 'unusable', 'relevance');
  if n <> 0 then raise exception '% candidate(s) carry a refusal kind outside the four recorded kinds', n; end if;
  select count(*) into n from reference.source_interfaces
   where slug in ('skhynix-newsroom-feed', 'samsung-newsroom-memory-tag-feed', 'jedec-standards-feed',
                  'dramexchange-weekly-research-feed', 'blocks-and-files-feed', 'trendforce-news-feed',
                  'rambus-feed', 'snia-feed', 'cxl-consortium-feed')
     and terms_evidence->>'refusal_kind' is null;
  if n <> 0 then raise exception '% Memory candidate(s) recorded without a refusal kind', n; end if;

  -- SK hynix is the rights refusal, and is blocked rather than merely pending.
  -- Its terms were read; an unreviewed source is review-pending, and conflating
  -- the two would lose the distinction the registry exists to keep.
  if (select terms_review_state from reference.source_interfaces where id = skhynix) <> 'not_permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = skhynix) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = skhynix) <> 'production_blocked' then
    raise exception 'SK hynix is not recorded as blocked on both axes';
  end if;
  if (select written_agreement_required from reference.source_interfaces where id = skhynix) is not true then
    raise exception 'SK hynix does not record that written permission is the remedy';
  end if;
  -- The three clauses that decided it are retained verbatim.
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = skhynix and c->>'text' like '%non-commercial use only%';
  if n = 0 then raise exception 'SK hynix evidence lost the non-commercial clause'; end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = skhynix and c->>'text' like '%robot, spider, or other automatic device%';
  if n = 0 then raise exception 'SK hynix evidence lost the automated-access clause'; end if;

  -- The candidates refused on staleness, an unusable feed or relevance are NOT
  -- blocked: their terms were never read, and recording an unread source as
  -- prohibited would assert something Urdais does not know.
  select count(*) into n from reference.source_interfaces
   where slug in ('samsung-newsroom-memory-tag-feed', 'jedec-standards-feed',
                  'dramexchange-weekly-research-feed', 'blocks-and-files-feed', 'trendforce-news-feed',
                  'rambus-feed', 'snia-feed', 'cxl-consortium-feed')
     and (production_access_state <> 'production_review_pending'
       or terms_review_state <> 'not_reviewed' or data_use_terms_state <> 'not_reviewed');
  if n <> 0 then raise exception '% non-terms refusal(s) misrecorded as a terms decision', n; end if;

  -- A refused candidate cannot be enabled, which the existing trigger enforces.
  ok := false;
  begin
    insert into reference.news_sources (source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes)
    values (skhynix, 'skhynix-newsroom', 'memory', 'rss', 'publisher_feed_syndication', true, 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a refused Memory candidate was enabled'; end if;

  -- Compute is untouched: eight sources, seven publishers, five with images.
  select count(*) into n from reference.news_sources where is_enabled and category = 'compute';
  if n <> 8 then raise exception 'expected 8 enabled Compute sources, found %', n; end if;
  select count(*) into n from reference.news_sources where is_enabled;
  if n <> 8 then raise exception 'something outside Compute is enabled; % enabled in total', n; end if;
  select count(distinct si.provider_id) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id where ns.is_enabled;
  if n <> 7 then raise exception 'expected 7 enabled Compute publishers, found %', n; end if;
  select count(*) into n from reference.news_sources where is_enabled and image_policy = 'feed_media';
  if n <> 5 then raise exception 'expected 5 Compute sources referencing feed images, found %', n; end if;

  -- And a research migration writes no articles.
  select count(*) into n from pipeline.news_articles;
  if n <> 0 then raise exception 'news articles were seeded'; end if;

  raise notice 'news memory research: ok';
end $$;

rollback;
