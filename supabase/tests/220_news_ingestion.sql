-- News ingestion: the four Compute feeds are approved and enabled, the two that
-- were reviewed and refused are neither, a news grant is not index permission,
-- repeated ingestion cannot duplicate a story, and ingested metadata is never
-- rewritten. No article exists after rollback.
begin;

do $$
declare
  ok boolean;
  n integer;
  gc_infra uuid := '6f6f6f6f-0000-4000-8000-000000000001';
  azure    uuid := '6f6f6f6f-0000-4000-8000-000000000003';
  coreweave uuid := '6f6f6f6f-0000-4000-8000-000000000004';
  nvidia   uuid := '6f6f6f6f-0000-4000-8000-000000000005';
  aws      uuid := '6f6f6f6f-0000-4000-8000-000000000006';
  poc      uuid;
  grant_gc uuid := '6e6e6e6e-0000-4000-8000-000000000001';
  retrieval uuid := 'cccccccc-0000-4000-8000-000000000001';
  second    uuid := 'cccccccc-0000-4000-8000-000000000002';
  article   uuid;
begin
  -- Four Compute sources, enabled, each pointing at a production-approved feed.
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and ns.category = 'compute' and si.source_class = 'news_feed'
     and si.production_access_state = 'production_approved'
     and si.terms_review_state = 'permitted' and si.data_use_terms_state = 'permitted';
  -- Four in Phase 1A, eight once Phase 1B finished the category.
  if n <> 8 then raise exception 'expected 8 enabled Compute news sources, found %', n; end if;

  -- Every source this file is about is a Compute source. Other categories
  -- migrate on their own and are asserted in their own files; what matters here
  -- is that none of them is mixed into the Compute roster.
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.category = 'compute' and si.id not in (
     '6f6f6f6f-0000-4000-8000-000000000001', '6f6f6f6f-0000-4000-8000-000000000002',
     '6f6f6f6f-0000-4000-8000-000000000003', '6f6f6f6f-0000-4000-8000-000000000004',
     '6f6f6f6f-0000-4000-8000-000000000007', '6f6f6f6f-0000-4000-8000-000000000008',
     '6f6f6f6f-0000-4000-8000-000000000009', '6f6f6f6f-0000-4000-8000-00000000000a');
  if n <> 0 then raise exception '% unexpected source(s) registered under Compute', n; end if;
  -- Still no source for the categories that have not migrated.
  select count(*) into n from reference.news_sources
   where category in ('memory', 'photonics', 'ai-chips', 'crypto');
  if n <> 0 then raise exception 'a deferred category gained a news source'; end if;

  -- The two reviewed-and-refused feeds are recorded, unapproved, and not enabled.
  if (select production_access_state from reference.source_interfaces where id = nvidia) <> 'production_review_pending'
     or (select terms_review_state from reference.source_interfaces where id = nvidia) <> 'under_review' then
    raise exception 'the NVIDIA newsroom feed is not in the reviewed, unapproved state';
  end if;
  if (select terms_review_state from reference.source_interfaces where id = aws) <> 'under_review' then
    raise exception 'the AWS news blog feed is not in the reviewed, unapproved state';
  end if;
  select count(*) into n from reference.news_sources where source_interface_id in (nvidia, aws);
  if n <> 0 then raise exception 'a refused feed has a news source row'; end if;

  -- Every reviewed news feed carries verbatim evidence with a review date, the
  -- same standard the compute sources are held to.
  select count(*) into n from reference.source_interfaces
   where source_class = 'news_feed'
     and (terms_evidence is null or terms_evidence->>'reviewed_on' is null
       or jsonb_array_length(terms_evidence->'documents') = 0);
  if n <> 0 then raise exception '% news feed(s) approved or refused without evidence', n; end if;

  -- A news source cannot be enabled while its interface is not approved.
  ok := false;
  begin
    insert into reference.news_sources (source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes)
    values (nvidia, 'nvidia-newsroom', 'compute', 'rss', 'publisher_feed_syndication', true, 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a news source was enabled against an unapproved interface'; end if;

  -- Nor point at an interface that is not a news feed.
  select id into poc from reference.source_interfaces where slug = 'price-of-compute-prices';
  ok := false;
  begin
    insert into reference.news_sources (source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes)
    values (poc, 'not-a-feed', 'compute', 'rss', 'publisher_feed_syndication', false, 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a news source was pointed at a price interface'; end if;

  -- A news grant covers syndication, not index construction, and the gate asks
  -- the question that belongs to the source class.
  select count(*) into n from reference.permission_grants g
    join reference.source_interfaces si on si.id = g.source_interface_id
   where si.source_class = 'news_feed' and (g.covers_index_use or not g.covers_content_syndication);
  if n <> 0 then raise exception 'a news grant misstates what it covers'; end if;

  -- A production retrieval from a refused feed is refused by the database.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, completed_at,
      request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose,
      acquisition_mode, permission_grant_id)
    values (nvidia, 'news:nvidia', now(), now(), 'GET', 'https://nvidianews.nvidia.com/releases.xml',
            200, repeat('a', 64), 'complete', 'production', 'automated', grant_gc);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a production retrieval from a refused news feed was accepted'; end if;

  -- And one from an approved feed without any grant is refused too.
  ok := false;
  begin
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, completed_at,
      request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose)
    values (gc_infra, 'news:nogrant', now(), now(), 'GET', 'https://cloudblog.withgoogle.com/products/infrastructure/rss/',
            200, repeat('b', 64), 'complete', 'production');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a production news retrieval was accepted without a permission basis'; end if;

  -- A grant that covers only content syndication cannot authorize a price
  -- interface, which is what keeps the new column from weakening the old gate.
  ok := false;
  begin
    insert into reference.permission_grants (id, source_interface_id, grant_kind, reference, covers_collection,
      covers_index_use, covers_content_syndication, effective_from, evidence)
    values ('6e6e6e6e-0000-4000-8000-0000000000ff', poc, 'provider_terms', 'syndication only', true, false, true,
            '2026-09-01T00:00:00Z', 'test');
    insert into pipeline.source_retrievals (source_interface_id, idempotency_key, requested_at, completed_at,
      request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose,
      permission_grant_id)
    values (poc, 'price:syndication-only', now(), now(), 'GET', 'https://priceofcompute.com/api/v1/prices/h100-sxm',
            200, repeat('c', 64), 'complete', 'production', '6e6e6e6e-0000-4000-8000-0000000000ff');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a content-syndication grant authorized a price interface'; end if;

  -- The permitted path: an approved feed, its own grant, a retained artifact.
  insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, completed_at,
    request_method, request_url, request_parameters, response_status, response_content_type, response_hash,
    response_byte_length, response_body, record_count, enumeration_assessment, enumeration_evidence,
    collector_identity, retrieval_purpose, acquisition_mode, permission_grant_id)
  values (retrieval, gc_infra, 'news:gc-infra:1', now(), now(), 'GET',
          'https://cloudblog.withgoogle.com/products/infrastructure/rss/', '{"parserId":"news.rss.v1"}'::jsonb,
          200, 'application/xml', repeat('d', 64), 1024, '{"contentType":"application/xml","body":"<rss/>"}'::jsonb,
          3, 'complete', 'The feed returned its full published window.', 'news-ingest/google-cloud-infrastructure',
          'production', 'automated', grant_gc);

  insert into pipeline.news_articles (source_interface_id, retrieval_id, category, canonical_url, url_key,
    source_guid, article_key, title, summary, published_at, ingested_at)
  values (gc_infra, retrieval, 'compute', 'https://cloud.google.com/blog/products/infrastructure/one',
          'https://cloud.google.com/blog/products/infrastructure/one', 'guid-one', 'guid-one',
          'One', null, '2026-09-13T10:00:00Z', now())
  returning id into article;

  -- Re-running ingestion over the same feed inserts nothing new.
  ok := false;
  begin
    insert into pipeline.news_articles (source_interface_id, retrieval_id, category, canonical_url, url_key,
      source_guid, article_key, title, published_at, ingested_at)
    values (gc_infra, retrieval, 'compute', 'https://cloud.google.com/blog/products/infrastructure/one',
            'https://cloud.google.com/blog/products/infrastructure/one', 'guid-one', 'guid-one',
            'One, retitled', '2026-09-13T10:00:00Z', now());
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'the same article was stored twice for one source'; end if;

  -- And a story carried by a second approved feed is still one row, because the
  -- normalized canonical URL is unique across sources.
  insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, completed_at,
    request_method, request_url, response_status, response_hash, enumeration_assessment, retrieval_purpose,
    acquisition_mode, permission_grant_id)
  values (second, '6f6f6f6f-0000-4000-8000-000000000002', 'news:gc-compute:1', now(), now(), 'GET',
          'https://cloudblog.withgoogle.com/products/compute/rss/', 200, repeat('e', 64), 'complete',
          'production', 'automated', '6e6e6e6e-0000-4000-8000-000000000002');
  ok := false;
  begin
    insert into pipeline.news_articles (source_interface_id, retrieval_id, category, canonical_url, url_key,
      source_guid, article_key, title, published_at, ingested_at)
    values ('6f6f6f6f-0000-4000-8000-000000000002', second, 'compute',
            'https://cloud.google.com/blog/products/infrastructure/one',
            'https://cloud.google.com/blog/products/infrastructure/one', 'other-guid', 'other-guid',
            'One', '2026-09-13T10:00:00Z', now());
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'one story syndicated by two feeds was stored twice'; end if;

  -- Only https destinations, only the product's own categories, and a summary
  -- that is a snippet rather than a body.
  ok := false;
  begin
    insert into pipeline.news_articles (source_interface_id, retrieval_id, category, canonical_url, url_key,
      article_key, title, published_at, ingested_at)
    values (gc_infra, retrieval, 'compute', 'http://cloud.google.com/blog/two', 'k2', 'k2', 'Two', now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a non-https article destination was accepted'; end if;

  ok := false;
  begin
    insert into pipeline.news_articles (source_interface_id, retrieval_id, category, canonical_url, url_key,
      article_key, title, published_at, ingested_at)
    values (gc_infra, retrieval, 'quantum', 'https://cloud.google.com/blog/three', 'k3', 'k3', 'Three', now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an article outside the Urdais news taxonomy was accepted'; end if;

  ok := false;
  begin
    insert into pipeline.news_articles (source_interface_id, retrieval_id, category, canonical_url, url_key,
      article_key, title, summary, published_at, ingested_at)
    values (gc_infra, retrieval, 'compute', 'https://cloud.google.com/blog/four', 'k4', 'k4', 'Four',
            repeat('x', 501), now(), now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an article body-sized summary was accepted'; end if;

  -- Ingested metadata is never rewritten, and rows are never deleted.
  ok := false;
  begin
    update pipeline.news_articles set title = 'Rewritten' where id = article;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'an ingested headline was rewritten'; end if;

  ok := false;
  begin
    delete from pipeline.news_articles where id = article;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a news article was deleted'; end if;

  -- Withdrawal is the one permitted update, and once withdrawn the row is fixed.
  update pipeline.news_articles
     set withdrawn_at = now(), withdrawal_reason = 'Publisher requested removal.'
   where id = article;
  ok := false;
  begin
    update pipeline.news_articles set withdrawal_reason = 'changed my mind' where id = article;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a withdrawn article was edited'; end if;

  -- service_role holds no DELETE on the article table, trigger or no trigger.
  if has_table_privilege('service_role', 'pipeline.news_articles', 'DELETE') then
    raise exception 'service_role can DELETE news articles';
  end if;
  if not has_table_privilege('service_role', 'pipeline.news_articles', 'INSERT') then
    raise exception 'service_role cannot INSERT news articles';
  end if;

  raise notice 'news ingestion: ok';
end $$;

rollback;

-- Nothing survived.
do $$
declare n integer;
begin
  select count(*) into n from pipeline.news_articles;
  if n <> 0 then raise exception 'news articles survived rollback'; end if;
end $$;
