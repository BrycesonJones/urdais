-- Energy / Power is the second production news category: four approved feeds
-- across three publishers, its refusals recorded, and Compute and the Memory
-- research left exactly as they were.
begin;

do $$
declare
  ok boolean;
  n integer;
  doe uuid := '6f6f6f6f-0000-4000-8000-000000000014';
  pjm uuid := '6f6f6f6f-0000-4000-8000-000000000015';
  utility_dive uuid := '6f6f6f6f-0000-4000-8000-000000000018';
  eia uuid := '6f6f6f6f-0000-4000-8000-000000000019';
begin
  -- Four enabled sources, three publishers, every one production-approved.
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and ns.category = 'energy-power'
     and si.source_class = 'news_feed' and si.production_access_state = 'production_approved'
     and si.terms_review_state = 'permitted' and si.data_use_terms_state = 'permitted';
  if n <> 4 then raise exception 'expected 4 approved Energy / Power sources, found %', n; end if;
  select count(distinct si.provider_id) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and ns.category = 'energy-power';
  if n <> 3 then raise exception 'expected 3 Energy / Power publishers, found %', n; end if;

  -- Two rest on a public-domain grant rather than on ordinary feed syndication,
  -- which is a stronger basis and is recorded as its own kind rather than
  -- flattened into the weaker one.
  select count(*) into n from reference.news_sources
   where is_enabled and category = 'energy-power' and syndication_basis = 'public_domain';
  if n <> 1 then raise exception 'expected 1 public-domain Energy / Power source, found %', n; end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = doe and c->>'text' like '%public domain%';
  if n = 0 then raise exception 'the DOE public-domain clause was not retained'; end if;

  -- No Energy / Power source references an image, because none of these feeds
  -- attaches one. The allowlist constraint still holds for all of them.
  select count(*) into n from reference.news_sources
   where category = 'energy-power' and (image_policy <> 'none' or coalesce(array_length(image_hosts, 1), 0) <> 0);
  if n <> 0 then raise exception '% Energy / Power source(s) reference images', n; end if;
  select count(*) into n from reference.news_sources where category = 'energy-power' and image_evidence is null;
  if n <> 0 then raise exception '% Energy / Power source(s) recorded no image finding', n; end if;

  -- Every enabled source has a grant that covers syndication and not index use.
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and ns.category = 'energy-power'
     and not exists (select 1 from reference.permission_grants g
                      where g.source_interface_id = si.id
                        and g.covers_collection and g.covers_content_syndication and not g.covers_index_use);
  if n <> 0 then raise exception '% Energy / Power source(s) lack a syndication grant', n; end if;

  -- The refusals. Utility Dive is a terms refusal and is blocked; the rest were
  -- refused on relevance and stay review-pending, because their terms were
  -- never read and asserting a prohibition Urdais did not verify would be wrong.
  if (select terms_review_state from reference.source_interfaces where id = utility_dive) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = utility_dive) <> 'production_blocked' then
    raise exception 'Utility Dive is not recorded as blocked on the collection axis';
  end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = utility_dive and c->>'text' like '%data mining, robots or similar data gathering%';
  if n = 0 then raise exception 'the Utility Dive prohibition was not retained verbatim'; end if;

  -- EIA is the one refused on editorial scope while its rights are settled and
  -- favourable. Recording it as permitted on both axes is the point: the open
  -- question is relevance, and a later reader must not mistake it for a rights
  -- problem.
  if (select terms_review_state from reference.source_interfaces where id = eia) <> 'permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = eia) <> 'permitted'
     or (select production_access_state from reference.source_interfaces where id = eia) = 'production_approved' then
    raise exception 'EIA is not recorded as rights-permitted but unapproved';
  end if;
  if (select terms_evidence->>'refusal_kind' from reference.source_interfaces where id = eia) <> 'relevance' then
    raise exception 'the EIA refusal is not recorded as an editorial one';
  end if;
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id where si.id = eia;
  if n <> 0 then raise exception 'EIA was enabled despite being unapproved'; end if;

  -- A refused candidate cannot be enabled.
  ok := false;
  begin
    insert into reference.news_sources (source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes)
    values (utility_dive, 'utility-dive', 'energy-power', 'rss', 'publisher_feed_syndication', true, 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a refused Energy / Power candidate was enabled'; end if;

  -- Articles land under the right category and the right source.
  insert into pipeline.source_retrievals (
    id, source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
    response_status, response_hash, enumeration_assessment, retrieval_purpose, acquisition_mode, permission_grant_id
  ) values (
    'eeeeeeee-0000-4000-8000-000000000001', pjm, 'news:ep-test', now(), now(), 'GET',
    'https://insidelines.pjm.com/feed/', 200, repeat('a', 64), 'unknown', 'production', 'automated',
    '6e6e6e6e-0000-4000-8000-00000000000c'
  );
  insert into pipeline.news_articles (
    source_interface_id, retrieval_id, category, canonical_url, url_key, article_key, title,
    published_at, ingested_at
  ) values (
    pjm, 'eeeeeeee-0000-4000-8000-000000000001', 'energy-power',
    'https://insidelines.pjm.com/large-load', 'https://insidelines.pjm.com/large-load', 'p1',
    'PJM proposes reliability standards for large loads', now(), now()
  );
  select count(*) into n from pipeline.news_articles where category = 'energy-power';
  if n <> 1 then raise exception 'the Energy / Power article did not store under its category'; end if;
  select count(*) into n from pipeline.news_articles where category = 'compute';
  if n <> 0 then raise exception 'an Energy / Power article leaked into Compute'; end if;

  -- Compute and the Memory research are untouched.
  select count(*) into n from reference.news_sources where is_enabled and category = 'compute';
  if n <> 8 then raise exception 'expected 8 enabled Compute sources, found %', n; end if;
  if (select production_access_state from reference.source_interfaces where slug = 'skhynix-newsroom-feed') <> 'production_blocked' then
    raise exception 'the Memory research record was disturbed';
  end if;
  select count(*) into n from reference.news_sources where category in ('memory', 'photonics', 'ai-chips', 'crypto');
  if n <> 0 then raise exception 'a deferred category gained a source'; end if;

  raise notice 'news energy power: ok';
end $$;

rollback;
