-- Crypto is the third production news category, and the last of News V1. Three
-- approved feeds across three publishers, eleven refusals recorded, and the
-- two categories that migrated before it left exactly as they were.
begin;

do $$
declare
  ok boolean;
  n integer;
  optech uuid := '6f6f6f6f-0000-4000-8000-00000000001d';
  theblock uuid := '6f6f6f6f-0000-4000-8000-00000000001e';
  ethereum uuid := '6f6f6f6f-0000-4000-8000-000000000025';
  coindesk uuid := '6f6f6f6f-0000-4000-8000-000000000020';
  sec uuid := '6f6f6f6f-0000-4000-8000-000000000029';
begin
  -- Three enabled sources, three publishers, all production-approved.
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and ns.category = 'crypto'
     and si.production_access_state = 'production_approved'
     and si.terms_review_state = 'permitted' and si.data_use_terms_state = 'permitted';
  if n <> 3 then raise exception 'expected 3 approved Crypto sources, found %', n; end if;
  select count(distinct si.provider_id) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and ns.category = 'crypto';
  if n <> 3 then raise exception 'expected 3 Crypto publishers, found %', n; end if;

  -- Each rests on a different kind of basis, which is the whole reason the
  -- roster survived a category where most publishers said no.
  select count(distinct syndication_basis) into n from reference.news_sources
   where is_enabled and category = 'crypto';
  if n <> 2 then raise exception 'expected 2 distinct Crypto syndication bases, found %', n; end if;
  if (select syndication_basis from reference.news_sources where slug = 'bitcoin-optech') <> 'open_licence' then
    raise exception 'the Optech open-licence basis was not recorded as one';
  end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = optech and c->>'text' like '%MIT license%';
  if n = 0 then raise exception 'the Optech MIT licence clause was not retained'; end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = theblock and c->>'text' like '%Content-Signal: search=yes%';
  if n = 0 then raise exception 'the The Block content signal was not retained verbatim'; end if;

  -- One source references images, on its publisher''s own host under one path.
  select count(*) into n from reference.news_sources
   where is_enabled and category = 'crypto' and image_policy = 'feed_media';
  if n <> 1 then raise exception 'expected 1 Crypto source referencing feed images, found %', n; end if;
  select count(*) into n from reference.news_sources
   where category = 'crypto' and image_policy = 'feed_media'
     and exists (select 1 from unnest(image_hosts) h where position('/' in h) = 0);
  if n <> 0 then raise exception 'a Crypto image allowlist names a bare host with no path prefix'; end if;
  select count(*) into n from reference.news_sources where category = 'crypto' and image_evidence is null;
  if n <> 0 then raise exception '% Crypto source(s) recorded no image finding', n; end if;

  -- Every enabled source carries a syndication grant that is not index permission.
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and ns.category = 'crypto'
     and not exists (select 1 from reference.permission_grants g
                      where g.source_interface_id = si.id
                        and g.covers_collection and g.covers_content_syndication and not g.covers_index_use);
  if n <> 0 then raise exception '% Crypto source(s) lack a syndication grant', n; end if;

  -- The refusals. Eight are terms refusals and are blocked, not merely pending.
  select count(*) into n from reference.source_interfaces
   where terms_evidence->>'refusal_kind' = 'terms' and source_class = 'news_feed'
     and production_access_state <> 'production_blocked';
  if n <> 0 then raise exception '% terms refusal(s) are not blocked', n; end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = coindesk and c->>'text' like '%personal, informational, and non-commercial purposes only%';
  if n = 0 then raise exception 'the CoinDesk prohibition was not retained verbatim'; end if;

  -- The Ethereum Foundation is the case the two axes exist for: content licensed
  -- openly, retrieval prohibited. Both states must survive intact, because
  -- collapsing them would lose the only reason the source is refused.
  if (select data_use_terms_state from reference.source_interfaces where id = ethereum) <> 'permitted'
     or (select terms_review_state from reference.source_interfaces where id = ethereum) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = ethereum) <> 'production_blocked' then
    raise exception 'the Ethereum Foundation split decision was flattened';
  end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = ethereum and c->>'text' like '%Creative Commons Attribution 4.0%';
  if n = 0 then raise exception 'the Ethereum Foundation content licence was not retained'; end if;

  -- SEC is the editorial refusal with settled, favourable rights, exactly as EIA
  -- is for Energy / Power.
  if (select terms_review_state from reference.source_interfaces where id = sec) <> 'permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = sec) <> 'permitted'
     or (select production_access_state from reference.source_interfaces where id = sec) = 'production_approved' then
    raise exception 'SEC is not recorded as rights-permitted but unapproved';
  end if;
  if (select terms_evidence->>'refusal_kind' from reference.source_interfaces where id = sec) <> 'relevance' then
    raise exception 'the SEC refusal is not recorded as an editorial one';
  end if;

  -- A refused candidate cannot be enabled.
  ok := false;
  begin
    insert into reference.news_sources (source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes)
    values (coindesk, 'coindesk', 'crypto', 'rss', 'publisher_feed_syndication', true, 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a refused Crypto candidate was enabled'; end if;

  -- News V1: three production categories, fifteen sources, and the three
  -- deferred rails still carrying nothing.
  select count(*) into n from reference.news_sources where is_enabled;
  if n <> 15 then raise exception 'expected 15 enabled news sources, found %', n; end if;
  select count(*) into n from reference.news_sources where is_enabled and category = 'compute';
  if n <> 8 then raise exception 'Compute changed: % enabled', n; end if;
  select count(*) into n from reference.news_sources where is_enabled and category = 'energy-power';
  if n <> 4 then raise exception 'Energy / Power changed: % enabled', n; end if;
  select count(*) into n from reference.news_sources where category in ('memory', 'photonics', 'ai-chips');
  if n <> 0 then raise exception 'a deferred category gained a source'; end if;
  if (select production_access_state from reference.source_interfaces where slug = 'skhynix-newsroom-feed') <> 'production_blocked' then
    raise exception 'the Memory research record was disturbed';
  end if;

  raise notice 'news crypto: ok';
end $$;

rollback;
