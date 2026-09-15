-- Phase 1B: image use is its own recorded decision, the Compute roster is eight
-- publishers deep, and approving a publisher's news feed never approves the
-- compute interface the same publisher was refused on.
begin;

do $$
declare
  ok boolean;
  n integer;
  coreweave uuid := '6f6f6f6f-0000-4000-8000-000000000004';
  lambda_feed uuid := '6f6f6f6f-0000-4000-8000-000000000007';
  cloudflare uuid := '6f6f6f6f-0000-4000-8000-000000000009';
  digitalocean uuid := '6f6f6f6f-0000-4000-8000-00000000000a';
begin
  -- Eight enabled Compute sources across seven publishers. Two Google Cloud
  -- feeds share a provider; every other source is a distinct company, which is
  -- the concentration this phase was meant to fix.
  select count(*) into n from reference.news_sources where is_enabled;
  if n <> 8 then raise exception 'expected 8 enabled news sources, found %', n; end if;
  select count(distinct si.provider_id) into n
    from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled;
  if n <> 7 then raise exception 'expected 7 distinct publishers, found %', n; end if;

  -- The roster reads both feed formats.
  select count(*) into n from reference.news_sources where is_enabled and feed_mechanism = 'atom';
  if n < 1 then raise exception 'no Atom source is enabled, so that parser is untested in production'; end if;

  -- Image policy is recorded per source, and defaults to none.
  select count(*) into n from reference.news_sources where is_enabled and image_policy = 'feed_media';
  -- Both Google Cloud feeds, CoreWeave, Together AI and Cloudflare.
  if n <> 5 then raise exception 'expected 5 sources referencing feed images, found %', n; end if;
  select count(*) into n from reference.news_sources where is_enabled and image_evidence is null;
  if n <> 0 then raise exception '% source(s) recorded no image finding at all', n; end if;

  -- A feed_media source must name the hosts its images may come from.
  ok := false;
  begin
    update reference.news_sources set image_policy = 'feed_media', image_hosts = '{}'::text[]
     where id = (select id from reference.news_sources where slug = 'lambda-blog');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an image policy was enabled with no host allowlist'; end if;

  -- And a source that references no image may not carry an allowlist either.
  ok := false;
  begin
    update reference.news_sources set image_hosts = array['cdn.example.com/']
     where slug = 'lambda-blog';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a none-policy source was given an image allowlist'; end if;

  -- The allowlists are publisher-scoped, not host-wide: CoreWeave and Together
  -- AI publish from one CDN, and neither entry would admit the other's assets.
  select count(*) into n from reference.news_sources
   where image_policy = 'feed_media'
     and exists (select 1 from unnest(image_hosts) h where position('/' in h) = 0);
  if n <> 0 then raise exception 'an image allowlist names a bare host with no path prefix'; end if;
  if (select image_hosts[1] from reference.news_sources where slug = 'coreweave-blog')
     = (select image_hosts[1] from reference.news_sources where slug = 'together-ai-blog') then
    raise exception 'two publishers on one CDN share an image allowlist entry';
  end if;

  -- Approving a publisher's news feed approves nothing else it operates.
  if (select production_access_state from reference.source_interfaces where slug = 'lambda-instance-types')
     <> 'production_blocked' then
    raise exception 'the Lambda compute API changed state';
  end if;
  if (select production_access_state from reference.source_interfaces where slug = 'digitalocean-sizes')
     <> 'production_review_pending' then
    raise exception 'the DigitalOcean compute API changed state';
  end if;
  -- And the two refused feeds are still refused.
  select count(*) into n from reference.source_interfaces
   where slug in ('nvidia-newsroom-feed', 'aws-news-blog-feed')
     and (production_access_state = 'production_approved' or terms_review_state = 'permitted');
  if n <> 0 then raise exception 'a refused news feed was quietly approved'; end if;
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where si.slug in ('nvidia-newsroom-feed', 'aws-news-blog-feed');
  if n <> 0 then raise exception 'a refused feed gained a news source row'; end if;

  -- Every Phase 1B feed carries its own evidence and its own grant, and no
  -- news grant claims index permission.
  select count(*) into n from reference.source_interfaces si
   where si.source_class = 'news_feed'
     and (si.terms_evidence is null or si.terms_evidence->>'reviewed_on' is null
       or jsonb_array_length(si.terms_evidence->'documents') = 0);
  if n <> 0 then raise exception '% news feed(s) recorded without evidence', n; end if;
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled
     and not exists (select 1 from reference.permission_grants g
                      where g.source_interface_id = si.id
                        and g.covers_collection and g.covers_content_syndication and not g.covers_index_use);
  if n <> 0 then raise exception '% enabled source(s) lack a syndication grant', n; end if;

  -- The two publishers whose feed was approved while another of their
  -- interfaces was not must say why on the row, so the next reader does not
  -- read it as an inconsistency.
  select count(*) into n from reference.source_interfaces
   where id in (lambda_feed, digitalocean) and terms_evidence->>'relationship_to_existing_row' is null;
  if n <> 0 then raise exception '% feed(s) approved beside a refused interface without explaining why', n; end if;

  -- Cloudflare's basis is an express content signal, recorded verbatim.
  if (select terms_evidence::text from reference.source_interfaces where id = cloudflare)
     not like '%Content-Signal: ai-train=yes, search=yes, ai-input=yes%' then
    raise exception 'the Cloudflare content signal was not recorded verbatim';
  end if;

  -- An article may still be stored without an image, from any source.
  if (select image_policy from reference.news_sources where slug = 'coreweave-blog') <> 'feed_media' then
    raise exception 'CoreWeave images were not enabled';
  end if;
  insert into pipeline.source_retrievals (
    id, source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url,
    response_status, response_hash, enumeration_assessment, retrieval_purpose, acquisition_mode, permission_grant_id
  ) values (
    'dddddddd-0000-4000-8000-000000000001', coreweave, 'news:image-test', now(), now(), 'GET',
    'https://www.coreweave.com/blog/rss.xml', 200, repeat('a', 64), 'unknown', 'production', 'automated',
    '6e6e6e6e-0000-4000-8000-000000000004'
  );
  insert into pipeline.news_articles (
    source_interface_id, retrieval_id, category, canonical_url, url_key, article_key, title,
    image_url, published_at, ingested_at
  ) values (
    coreweave, 'dddddddd-0000-4000-8000-000000000001', 'compute',
    'https://www.coreweave.com/blog/with-image', 'https://www.coreweave.com/blog/with-image', 'k1', 'With image',
    'https://cdn.prod.website-files.com/62bc66d283fd9c34ffec780a/x.avif', now(), now()
  ), (
    coreweave, 'dddddddd-0000-4000-8000-000000000001', 'compute',
    'https://www.coreweave.com/blog/no-image', 'https://www.coreweave.com/blog/no-image', 'k2', 'No image',
    null, now(), now()
  );

  -- An insecure image destination is still refused by the column constraint.
  ok := false;
  begin
    insert into pipeline.news_articles (
      source_interface_id, retrieval_id, category, canonical_url, url_key, article_key, title,
      image_url, published_at, ingested_at
    ) values (
      coreweave, 'dddddddd-0000-4000-8000-000000000001', 'compute',
      'https://www.coreweave.com/blog/insecure', 'https://www.coreweave.com/blog/insecure', 'k3', 'Insecure',
      'http://cdn.prod.website-files.com/62bc66d283fd9c34ffec780a/x.avif', now(), now()
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an insecure image URL was stored'; end if;

  -- Phase 1A rows keep their null image: the table is insert-only and a
  -- thumbnail is not a reason to rewrite a stored record.
  ok := false;
  begin
    update pipeline.news_articles
       set image_url = 'https://cdn.prod.website-files.com/62bc66d283fd9c34ffec780a/y.avif'
     where article_key = 'k2';
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a stored article was rewritten to add a thumbnail'; end if;

  raise notice 'news image rights and wave 2: ok';
end $$;

rollback;
