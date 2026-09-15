-- News ingestion foundation: the production path behind the homepage Compute
-- rail, built on the registry that already exists rather than beside it.
--
-- Reuse:
--   reference.providers          the publisher, its display name and homepage
--   reference.source_interfaces  one feed Urdais reads, with the two-axis terms
--                                review and the production-approval state
--   reference.permission_grants  the basis a production retrieval is made under
--   pipeline.source_retrievals   one fetch of one feed, retained as evidence
--
-- New:
--   reference.news_sources       the narrow qualification row: which Urdais
--                                category a feed serves, how it is read, and
--                                whether it is enabled for ingestion
--   pipeline.news_articles       normalized article metadata. Never a body.
--
-- Not created: a second source registry, a second taxonomy, a news-specific
-- retrieval table, or any table holding article text.
--
-- Two axes, read for what this source class actually does ----------------------
--
-- `terms_review_state` asks the same question it always has: may Urdais
-- retrieve this interface automatically. `data_use_terms_state` asks whether
-- the use Urdais makes of the retrieved data is permitted, and the use is set
-- by the interface's source class. For a price interface that use is index
-- construction, which is what every existing row was reviewed against and what
-- its comment describes. For a news feed it is displaying the feed's own
-- headline metadata with attribution and a link back to the publisher — the
-- use the feed format exists to serve. No existing row's meaning changes:
-- every interface reviewed before this migration is a price interface.

alter table reference.source_interfaces
  drop constraint source_interfaces_class_allowed,
  add constraint source_interfaces_class_allowed check (source_class in (
    'offer_interface',
    'catalog_price_interface',
    'availability_interface',
    'product_reference_documentation',
    'hardware_reference_documentation',
    'provider_terms_documentation',
    'price_surface',
    'news_feed'
  ));

comment on column reference.source_interfaces.data_use_terms_state is
  'Whether the use Urdais makes of data retrieved from this interface is permitted. The use is set by source_class: for price interfaces it is constructing, calculating, publishing or maintaining an index or benchmark; for a news_feed it is displaying the feed''s own headline metadata with attribution and a link to the publisher. Technically collectible, permitted to automate, and permitted to use are three different things.';

-- A grant covers a use, and a news feed's use is not index construction -------
--
-- The gate has always required a non-research retrieval's grant to cover both
-- collection and index use. Approving a news feed under that rule would mean
-- recording covers_index_use on a grant that says nothing about indices, which
-- is a false statement in the one place the system is supposed to be exact.
-- The coverage question is therefore split the same way the terms review was:
-- a third explicit column, and a gate that asks the question belonging to the
-- interface's source class. Price interfaces are unaffected — for them the
-- required coverage is still collection plus index use, and a grant that only
-- covers content syndication cannot authorize one.

alter table reference.permission_grants
  add column covers_content_syndication boolean not null default false;

comment on column reference.permission_grants.covers_index_use is
  'Whether this basis covers using the retrieved data to construct, calculate, publish or maintain an index or benchmark. Required for a non-research retrieval from any interface that is not a news feed.';
comment on column reference.permission_grants.covers_content_syndication is
  'Whether this basis covers displaying the source''s own published headline metadata with attribution and a link to the publisher. Required for a non-research retrieval from a news_feed interface. It is not index permission and never substitutes for it.';

create or replace function pipeline.check_retrieval_permission()
returns trigger
language plpgsql
as $$
declare
  g record;
  iface record;
  needed boolean;
begin
  select source_class into iface from reference.source_interfaces where id = new.source_interface_id;

  if new.permission_grant_id is not null then
    select source_interface_id, effective_from, effective_to, covers_collection, covers_index_use,
           covers_content_syndication
      into g
      from reference.permission_grants where id = new.permission_grant_id;
    if g.source_interface_id <> new.source_interface_id then
      raise exception 'permission grant % belongs to a different source interface', new.permission_grant_id
        using errcode = 'check_violation';
    end if;
    if new.requested_at < g.effective_from or (g.effective_to is not null and new.requested_at >= g.effective_to) then
      raise exception 'permission grant % was not in force at %', new.permission_grant_id, new.requested_at
        using errcode = 'check_violation';
    end if;
    if new.retrieval_purpose <> 'research' then
      -- The use the grant has to cover is the use this source class is read for.
      needed := case
        when iface.source_class = 'news_feed' then g.covers_collection and g.covers_content_syndication
        else g.covers_collection and g.covers_index_use
      end;
      if not needed then
        raise exception 'permission grant % does not cover collection and the use a % interface is read for',
          new.permission_grant_id, iface.source_class
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if new.retrieval_purpose in ('production', 'validation') then
    -- A manually verified reading of a first-party published page is a fact a
    -- person checked, not an automated collection. The interface's production
    -- state is untouched and is not consulted; an automated retrieval from the
    -- same interface still falls to the branch below and is still refused.
    if new.acquisition_mode is distinct from 'manual_verified' then
      select production_access_state, terms_review_state, data_use_terms_state into iface
        from reference.source_interfaces where id = new.source_interface_id;
      if iface.production_access_state <> 'production_approved' then
        raise exception '% retrieval from a source interface that is % (terms %, data use %)',
          new.retrieval_purpose, iface.production_access_state, iface.terms_review_state, iface.data_use_terms_state
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function pipeline.check_retrieval_permission() is
  'Refuses a production or validation retrieval whose permission grant does not cover collection plus the use its source class is read for (index use for price interfaces, content syndication for news feeds), whose grant belongs to another interface or is out of force, or whose interface is not production_approved. A manual_verified acquisition is a person reading a published page and is never automated collection permission.';

-- The qualification layer ------------------------------------------------------

create table reference.news_sources (
  id                   uuid primary key default gen_random_uuid(),
  source_interface_id  uuid not null unique references reference.source_interfaces (id) on delete restrict,
  slug                 text not null unique
                         constraint news_sources_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category             text not null
                         constraint news_sources_category_allowed check (category in (
                           'compute', 'memory', 'photonics', 'energy-power', 'ai-chips', 'crypto'
                         )),
  feed_mechanism       text not null
                         constraint news_sources_mechanism_allowed
                         check (feed_mechanism in ('rss', 'atom', 'json_feed', 'official_api')),
  -- How Urdais concluded it may publish this source's headline metadata. Never
  -- buried in JSON, because it is the decision, not a detail of one.
  syndication_basis    text not null
                         constraint news_sources_basis_allowed check (syndication_basis in (
                           'publisher_feed_syndication',
                           'official_api_terms',
                           'written_permission'
                         )),
  is_enabled           boolean not null default false,
  notes                text not null
                         constraint news_sources_notes_nonempty check (btrim(notes) <> ''),
  created_at           timestamptz not null default now()
);

comment on table reference.news_sources is
  'One approved news feed: the Urdais category it serves, how it is read, the basis on which its headline metadata may be displayed, and whether ingestion is enabled. The identity, canonical URL and terms state live on the source interface it points at; this table never restates them.';
comment on column reference.news_sources.syndication_basis is
  'publisher_feed_syndication: the publisher offers a machine-readable feed of headline metadata and neither its terms nor its robots rules restrict reading it. This is a reasonable operational interpretation of ordinary feed syndication, not a written grant. official_api_terms: an API whose own terms address the use. written_permission: a grant addressed to Urdais.';
comment on column reference.news_sources.category is
  'The single Urdais news category this source serves. The ids are the product''s own category ids; there is exactly one news taxonomy.';

create index news_sources_category_idx on reference.news_sources (category) where is_enabled;

-- Enabling a source is the same decision as approving it for production, so it
-- cannot be made in one table and contradicted in the other.
create or replace function reference.check_news_source_enabled()
returns trigger
language plpgsql
as $$
declare
  iface record;
begin
  select source_class, production_access_state into iface
    from reference.source_interfaces where id = new.source_interface_id;
  if iface.source_class <> 'news_feed' then
    raise exception 'news source % points at a % interface', new.slug, iface.source_class
      using errcode = 'check_violation';
  end if;
  if new.is_enabled and iface.production_access_state <> 'production_approved' then
    raise exception 'news source % is enabled but its interface is %', new.slug, iface.production_access_state
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function reference.check_news_source_enabled() is
  'A news source must point at a news_feed interface, and may only be enabled while that interface is production_approved, which the registry already conditions on both terms axes.';

create trigger news_sources_enabled_check
  before insert or update on reference.news_sources
  for each row execute function reference.check_news_source_enabled();

-- Article metadata -------------------------------------------------------------
--
-- Urdais is a discovery layer. This table holds what is needed to show a story
-- and reach the publisher's own page, and deliberately has no column an article
-- body could be written to.

create table pipeline.news_articles (
  id                   uuid primary key default gen_random_uuid(),
  source_interface_id  uuid not null references reference.source_interfaces (id) on delete restrict,
  -- Which fetch this record came from. Provenance runs article -> retrieval ->
  -- source interface -> provider, exactly as it does for a price observation.
  retrieval_id         uuid not null references pipeline.source_retrievals (id) on delete restrict,
  category             text not null
                         constraint news_articles_category_allowed check (category in (
                           'compute', 'memory', 'photonics', 'energy-power', 'ai-chips', 'crypto'
                         )),

  -- Identity. article_key is the deterministic identity: the publisher's own
  -- stable id where it gives one, the normalized URL otherwise. url_key is the
  -- normalized canonical URL and is unique across every source, so one story
  -- carried by two feeds is stored once.
  canonical_url        text not null
                         constraint news_articles_canonical_url_https check (canonical_url ~ '^https://[^[:space:]]+$'),
  url_key              text not null
                         constraint news_articles_url_key_nonempty check (btrim(url_key) <> ''),
  source_guid          text
                         constraint news_articles_guid_nonempty check (source_guid is null or btrim(source_guid) <> ''),
  article_key          text not null
                         constraint news_articles_article_key_nonempty check (btrim(article_key) <> ''),

  -- Presentation metadata, as the publisher expressed it.
  title                text not null
                         constraint news_articles_title_shape check (btrim(title) <> '' and length(title) <= 400),
  -- The publisher's own snippet. NULL where the feed supplies none, and NULL
  -- where the feed's description field carries the article body instead of a
  -- snippet: Urdais publishes no description rather than an excerpt of a body.
  summary              text
                         constraint news_articles_summary_shape
                         check (summary is null or (btrim(summary) <> '' and length(summary) <= 500)),
  -- A thumbnail the feed itself supplied, referenced by URL. Urdais never
  -- stores publisher image bytes.
  image_url            text
                         constraint news_articles_image_https
                         check (image_url is null or image_url ~ '^https://[^[:space:]]+$'),

  published_at         timestamptz not null,
  ingested_at          timestamptz not null,

  -- A published surface needs a way to stop showing a story: a publisher
  -- request, or a record ingested in error. Withdrawal is the only permitted
  -- update; the metadata itself is never rewritten.
  withdrawn_at         timestamptz,
  withdrawal_reason    text,

  created_at           timestamptz not null default now(),

  constraint news_articles_withdrawal_is_paired
    check ((withdrawn_at is null) = (withdrawal_reason is null)),
  constraint news_articles_withdrawal_reason_nonempty
    check (withdrawal_reason is null or btrim(withdrawal_reason) <> ''),
  -- Re-running ingestion over the same feed inserts nothing new.
  unique (source_interface_id, article_key)
);

comment on table pipeline.news_articles is
  'Normalized external article metadata: headline, publisher snippet where one is offered, canonical URL, publication time, category and provenance. Never an article body, reconstructed text, paywalled content or a generated summary. Insert-only; the one permitted update withdraws a row from publication.';
comment on column pipeline.news_articles.article_key is
  'Deterministic identity within a source: the publisher''s stable GUID where the feed supplies one, otherwise the normalized URL. Headline similarity is never an identity signal.';
comment on column pipeline.news_articles.url_key is
  'The canonical URL after normalization: lowercased scheme and host, tracking parameters removed, fragment dropped. Unique across sources so a story syndicated by two feeds is one row.';
comment on column pipeline.news_articles.summary is
  'The publisher''s own short description. NULL when the feed supplies none and when its description field carries the article body, which Urdais does not store or excerpt.';
comment on column pipeline.news_articles.image_url is
  'A thumbnail URL the feed itself supplied for syndication. A reference only; Urdais stores no publisher image bytes and scrapes no article page for one.';

create unique index news_articles_url_key_idx on pipeline.news_articles (url_key);

-- The homepage read: newest publishable stories in one category.
create index news_articles_category_published_idx
  on pipeline.news_articles (category, published_at desc)
  where withdrawn_at is null;

create index news_articles_retrieval_idx on pipeline.news_articles (retrieval_id);

create or replace function pipeline.allow_only_news_withdrawal()
returns trigger
language plpgsql
as $$
declare
  old_json jsonb;
  new_json jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'news article rows are not deleted: withdraw them instead'
      using errcode = 'restrict_violation';
  end if;
  if old.withdrawn_at is not null then
    raise exception 'news article % is already withdrawn and is immutable', old.id
      using errcode = 'restrict_violation';
  end if;
  if new.withdrawn_at is null or new.withdrawal_reason is null then
    raise exception 'the only permitted update on pipeline.news_articles sets withdrawn_at and withdrawal_reason together'
      using errcode = 'restrict_violation';
  end if;
  old_json := to_jsonb(old) - 'withdrawn_at' - 'withdrawal_reason';
  new_json := to_jsonb(new) - 'withdrawn_at' - 'withdrawal_reason';
  if old_json <> new_json then
    raise exception 'update on pipeline.news_articles changed columns other than the withdrawal columns'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

comment on function pipeline.allow_only_news_withdrawal() is
  'Trigger for pipeline.news_articles: permits exactly one kind of update, withdrawing a row from publication, and rejects every delete. Ingested metadata is never rewritten, which is what makes repeated ingestion safe.';

create trigger news_articles_withdrawal_only
  before update or delete on pipeline.news_articles
  for each row execute function pipeline.allow_only_news_withdrawal();

revoke delete, truncate on pipeline.news_articles from service_role;

alter table reference.news_sources   enable row level security;
alter table pipeline.news_articles   enable row level security;

-- Reviewed publishers -----------------------------------------------------------
--
-- Microsoft Azure already has a provider row from the Phase 4A terms review; a
-- provider is a company, not an interface, so its blog feed hangs off the row
-- that is already there. Google Cloud is added rather than folded into the
-- existing `google` row, which is the Gemini Developer API publisher and a
-- different surface with different terms.

insert into reference.providers (id, slug, name, provider_kind, website) values
  ('66666666-0000-4000-8000-000000000001', 'google-cloud', 'Google Cloud',      'cloud_provider',  'https://cloud.google.com'),
  ('66666666-0000-4000-8000-000000000002', 'coreweave',    'CoreWeave',         'cloud_provider',  'https://www.coreweave.com'),
  ('66666666-0000-4000-8000-000000000003', 'nvidia',       'NVIDIA',            'hardware_vendor', 'https://www.nvidia.com')
on conflict (slug) do nothing;

-- Approved feeds ----------------------------------------------------------------

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-000000000001',
  '66666666-0000-4000-8000-000000000001',
  'google-cloud-blog-infrastructure-feed', 'Google Cloud blog — Infrastructure', 'news_feed',
  'https://cloudblog.withgoogle.com/products/infrastructure/rss/', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'First-party RSS for the Infrastructure section of the Google Cloud blog. Items link to cloud.google.com, which is the publisher''s canonical host; the feed host is the syndication host. The description element carries the full article HTML rather than a snippet, so Urdais stores no description for this source rather than excerpting a body.',
  '{"reviewed_on": "2026-09-14", "documents": [{"title": "Google Terms of Service", "url": "https://policies.google.com/terms", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other activities)", "note": "Stated as a prohibited use. It conditions automated access on the robots rules rather than prohibiting it, so the robots file for this host settles the collection axis."}]}, {"title": "cloudblog.withgoogle.com robots.txt", "url": "https://cloudblog.withgoogle.com/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /search/", "note": "The entire file. The RSS paths are not disallowed for any user agent."}]}, {"title": "Infrastructure feed", "url": "https://cloudblog.withgoogle.com/products/infrastructure/rss/", "retrieved_on": "2026-09-14", "note": "HTTP 200, application/xml; charset=utf-8, 388679 bytes, sha256 fa07ddf85bd47ae9079e4ba9b17e0996b03ab9ba19d5396e132dd8e753cfe191, RSS 2.0, 20 items."}], "data_use_basis": "The publisher offers a machine-readable feed of headline, link, timestamp and description. Displaying those fields with attribution and a link back is the use the feed exists to serve. This is a reasonable operational interpretation of ordinary feed syndication, not a written grant, and it is not index permission."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000002',
  '66666666-0000-4000-8000-000000000001',
  'google-cloud-blog-compute-feed', 'Google Cloud blog — Compute', 'news_feed',
  'https://cloudblog.withgoogle.com/products/compute/rss/', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'First-party RSS for the Compute section of the Google Cloud blog. Same publisher, host and terms as the Infrastructure feed; a separate interface because it is a separate endpoint whose contents overlap. Descriptions carry article HTML and are not stored.',
  '{"reviewed_on": "2026-09-14", "documents": [{"title": "Google Terms of Service", "url": "https://policies.google.com/terms", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other activities)"}]}, {"title": "cloudblog.withgoogle.com robots.txt", "url": "https://cloudblog.withgoogle.com/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /search/"}]}, {"title": "Compute feed", "url": "https://cloudblog.withgoogle.com/products/compute/rss/", "retrieved_on": "2026-09-14", "note": "HTTP 200, application/xml; charset=utf-8, 463924 bytes, sha256 11271ec9f54c1d6d83e406871b216ff713e22629440697fde7de0c396e27f883, RSS 2.0, 20 items."}], "data_use_basis": "Ordinary feed syndication, as for the Infrastructure feed. Not a written grant and not index permission."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000003',
  '44444444-0000-4000-8000-000000000005',
  'microsoft-azure-blog-feed', 'Microsoft Azure blog', 'news_feed',
  'https://azure.microsoft.com/en-us/blog/feed/', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'First-party RSS for the Microsoft Azure blog. The collection axis rests on the same clause the Azure Retail Prices review already relied on: a published feed is intentionally made available. Descriptions are short publisher deks and carry a WordPress "The post ... appeared first on ..." trailer that Urdais removes.',
  '{"reviewed_on": "2026-09-14", "documents": [{"title": "Microsoft Terms of Use", "url": "https://www.microsoft.com/en-us/legal/terms-of-use", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "You may not obtain or attempt to obtain any materials or information through any means not intentionally made available through the Services.", "note": "A published RSS feed is intentionally made available. The same clause settled the collection axis for the Azure Retail Prices API in the Phase 4A review."}, {"axis": "collection", "text": "You may not use web scraping, web harvesting, or web data extraction methods to extract data from the AI services.", "note": "Scoped to the AI services, not to the Azure blog."}]}, {"title": "azure.microsoft.com robots.txt", "url": "https://azure.microsoft.com/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /*/searchresults/ Disallow: /*/search/?q=* Disallow: /*/patterns/ Disallow: /api/ Disallow: /debug/ Disallow: /di-ag/ Disallow: /global-infrastructure/services/get-async/", "note": "The blog feed path is not disallowed."}]}, {"title": "Microsoft Azure blog feed", "url": "https://azure.microsoft.com/en-us/blog/feed/", "retrieved_on": "2026-09-14", "note": "HTTP 200, application/rss+xml; charset=UTF-8, 205068 bytes, sha256 057c772e01b036969ad615fa2411d9e9fdf0738bd9acbbb915b5e9296ed18bce, RSS 2.0, 10 items."}], "data_use_basis": "Ordinary feed syndication: headline, link, timestamp and a publisher dek, displayed with attribution and a link back. Not a written grant and not index permission."}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000004',
  '66666666-0000-4000-8000-000000000002',
  'coreweave-blog-feed', 'CoreWeave blog', 'news_feed',
  'https://www.coreweave.com/blog/rss.xml', true,
  'public_unauthenticated', 'production_approved', 'permitted', 'permitted', false,
  'First-party RSS for the CoreWeave blog, the one Phase 1A source that is a GPU cloud operator rather than a hyperscaler. The feed emits links on the Webflow publishing host wf.coreweave.com; every article page there declares rel=canonical on www.coreweave.com with the path unchanged, verified on four articles on 2026-09-14, so Urdais links to the publisher''s own declared canonical host.',
  '{"reviewed_on": "2026-09-14", "documents": [{"title": "CoreWeave Terms of Service", "url": "https://docs.coreweave.com/policies/terms-of-service", "version_date": "June 30, 2022", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "This page contains CoreWeave''s key Terms of Service and is a binding contract between CoreWeave and the Customer as of the creation of the Customer''s account on the CoreWeave Cloud Platform as a Covered Service, which also includes all of CoreWeave''s websites, services, products and solutions (the \"CoreWeave Services\").", "note": "A customer contract, entered on account creation. Urdais holds no CoreWeave account. The document was read in full for automated-access, robot, spider, scraper, crawler, data-mining, harvesting, index and benchmark language and contains none."}]}, {"title": "www.coreweave.com robots.txt", "url": "https://www.coreweave.com/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /blog-categories/ Disallow: /event/", "note": "The entire user-agent block. /blog/rss.xml is not disallowed."}]}, {"title": "CoreWeave blog feed", "url": "https://www.coreweave.com/blog/rss.xml", "retrieved_on": "2026-09-14", "note": "HTTP 200, application/rss+xml; charset=utf-8, 89532 bytes, sha256 d92f061d93a2d6c1bb9388984b4040c1a08bcafba1da7a51146548a1bc64502f, RSS 2.0 with media:content thumbnails."}, {"title": "Canonical host check", "url": "https://wf.coreweave.com/blog/an-ai-cloud-platform-requires-more-than-renting-gpus", "retrieved_on": "2026-09-14", "note": "Four feed links fetched; each page returned <link rel=\"canonical\"> on https://www.coreweave.com with an identical path."}], "data_use_basis": "Ordinary feed syndication. Not a written grant and not index permission."}'::jsonb
);

-- Reviewed and not approved -----------------------------------------------------
--
-- Both publishers offer a working feed, and both sets of site terms prohibit
-- automated access in general language with no carve-out for the feed they
-- themselves publish. That is the same tension the Phase 4A review recorded for
-- Runpod, and it resolves the same way: recorded, not assumed, and not
-- production. Recording them keeps the question from being re-litigated and
-- keeps the reason attached to the source.

insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '6f6f6f6f-0000-4000-8000-000000000005',
  '66666666-0000-4000-8000-000000000003',
  'nvidia-newsroom-feed', 'NVIDIA Newsroom releases feed', 'news_feed',
  'https://nvidianews.nvidia.com/releases.xml', true,
  'public_unauthenticated', 'production_review_pending', 'under_review', 'under_review', null,
  'The most directly relevant accelerator-manufacturer feed found, and excluded from Phase 1A production ingestion. The newsroom''s own footer links the NVIDIA Terms of Service, which prohibit automated access to any portion of the Site without carving out the RSS feed the newsroom publishes. Publishing a feed and prohibiting robots are in tension; neither source settles it, so the collection axis stays under review.',
  '{"reviewed_on": "2026-09-14", "conflict": "The site terms linked from the newsroom footer prohibit automated access to the Site; the newsroom publishes a machine-readable syndication feed. Neither settles the other.", "documents": [{"title": "NVIDIA Terms of Service", "url": "https://www.nvidia.com/en-us/about-nvidia/terms-of-service/", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "use any robot, spider, scraper, crawler, data mining tool, data gathering or extraction tool, or any other automatic device, program, algorithm or methodology, or any similar or equivalent manual process, to access, acquire, copy or monitor any portion of the Site", "note": "Linked from the nvidianews.nvidia.com footer. No exception for the newsroom RSS feed."}]}, {"title": "nvidianews.nvidia.com robots.txt", "url": "https://nvidianews.nvidia.com/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: * Disallow: /file", "note": "The feed path is not disallowed by robots, which does not resolve the terms clause above."}]}, {"title": "NVIDIA Newsroom releases feed", "url": "https://nvidianews.nvidia.com/releases.xml", "retrieved_on": "2026-09-14", "note": "HTTP 200, text/xml, 433193 bytes, RSS 2.0 with media:content thumbnails and per-item GUIDs. Technically usable; not permitted."}]}'::jsonb
),
(
  '6f6f6f6f-0000-4000-8000-000000000006',
  '44444444-0000-4000-8000-000000000006',
  'aws-news-blog-feed', 'AWS News Blog feed', 'news_feed',
  'https://aws.amazon.com/blogs/aws/feed/', true,
  'public_unauthenticated', 'production_review_pending', 'under_review', 'under_review', null,
  'Excluded from Phase 1A production ingestion. The AWS Site Terms clause the Phase 4A price-list review already recorded excludes data mining and robots from the licence granted over the AWS Site, and the blog feed is on the AWS Site rather than on a separately documented programmatic interface. The blanket Disallow: /blogs/ in robots.txt belongs to the AdsBot-Google group and does not apply to other agents, so robots is not the obstacle; the terms clause is.',
  '{"reviewed_on": "2026-09-14", "documents": [{"title": "AWS Site Terms", "url": "https://aws.amazon.com/terms/", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "This license does not include any resale or commercial use of the AWS Site or its contents; any derivative use of the AWS Site or its contents; any downloading or copying of any other users'' account information; or any use of data mining, robots, or similar data gathering and extraction tools.", "note": "The blog feed is served from the AWS Site. The Phase 4A review treated the separately documented Price List Bulk API as distinct from this clause; a blog feed has no such separate documentation."}]}, {"title": "aws.amazon.com robots.txt", "url": "https://aws.amazon.com/robots.txt", "retrieved_on": "2026-09-14", "clauses": [{"axis": "collection", "text": "User-agent: AdsBot-Google User-agent: AdsBot-Google-Mobile ... Disallow: /blogs/ Disallow: /*/blogs/", "note": "Lines 1-34 of the file. The User-agent: * group begins at line 35 and disallows only /blogs/*/tag/ and two specific paths, so robots permits the feed for ordinary agents."}]}, {"title": "AWS News Blog feed", "url": "https://aws.amazon.com/blogs/aws/feed/", "retrieved_on": "2026-09-14", "note": "HTTP 200, application/rss+xml, 266905 bytes, RSS 2.0, 20 items, non-permalink GUIDs. Technically usable; not permitted."}]}'::jsonb
);

-- The basis each approved feed is read under ------------------------------------
--
-- covers_index_use is false on every one of these, and that is the point: the
-- basis is the publisher's own act of syndication, which says nothing about
-- indices and is not being asked to.

insert into reference.permission_grants (
  id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
  covers_content_syndication, granted_on, effective_from, evidence
) values
(
  '6e6e6e6e-0000-4000-8000-000000000001', '6f6f6f6f-0000-4000-8000-000000000001', 'provider_terms',
  'Google Terms of Service (policies.google.com/terms) read with cloudblog.withgoogle.com/robots.txt, both retrieved 2026-09-14',
  true, false, true, '2026-09-14', '2026-09-14T00:00:00Z',
  'Google''s terms prohibit automated access only where it violates the machine-readable instructions on the page; the robots file for this host disallows /search/ and nothing else. Displaying the headline metadata the feed publishes, with attribution and a link to cloud.google.com, is the use the feed is offered for.'
),
(
  '6e6e6e6e-0000-4000-8000-000000000002', '6f6f6f6f-0000-4000-8000-000000000002', 'provider_terms',
  'Google Terms of Service (policies.google.com/terms) read with cloudblog.withgoogle.com/robots.txt, both retrieved 2026-09-14',
  true, false, true, '2026-09-14', '2026-09-14T00:00:00Z',
  'Same publisher, host, terms and robots file as the Infrastructure feed; a separate grant because a grant covers one interface.'
),
(
  '6e6e6e6e-0000-4000-8000-000000000003', '6f6f6f6f-0000-4000-8000-000000000003', 'provider_terms',
  'Microsoft Terms of Use (microsoft.com/en-us/legal/terms-of-use) read with azure.microsoft.com/robots.txt, both retrieved 2026-09-14',
  true, false, true, '2026-09-14', '2026-09-14T00:00:00Z',
  'Microsoft permits obtaining materials through means intentionally made available, and a published RSS feed is one. The scraping prohibition in the same document is scoped to the AI services. Robots does not disallow the blog feed path.'
),
(
  '6e6e6e6e-0000-4000-8000-000000000004', '6f6f6f6f-0000-4000-8000-000000000004', 'provider_terms',
  'CoreWeave Terms of Service (docs.coreweave.com/policies/terms-of-service, 30 June 2022) read with www.coreweave.com/robots.txt, both retrieved 2026-09-14',
  true, false, true, '2026-09-14', '2026-09-14T00:00:00Z',
  'The terms are a customer contract entered on account creation and contain no automated-access, scraping, crawling, data-mining or index clause. Robots disallows /blog-categories/ and /event/ only. The feed is offered for syndication and is read as such.'
);

-- The four sources Phase 1A ingests ---------------------------------------------

insert into reference.news_sources (
  id, source_interface_id, slug, category, feed_mechanism, syndication_basis, is_enabled, notes
) values
(
  '6d6d6d6d-0000-4000-8000-000000000001', '6f6f6f6f-0000-4000-8000-000000000001',
  'google-cloud-infrastructure', 'compute', 'rss', 'publisher_feed_syndication', true,
  'Hyperscaler infrastructure announcements: regions, network, subsea cable and capacity builds.'
),
(
  '6d6d6d6d-0000-4000-8000-000000000002', '6f6f6f6f-0000-4000-8000-000000000002',
  'google-cloud-compute', 'compute', 'rss', 'publisher_feed_syndication', true,
  'Hyperscaler compute announcements: instance families, accelerators and capacity. Overlaps the Infrastructure feed; a story carried by both is stored once under its canonical URL.'
),
(
  '6d6d6d6d-0000-4000-8000-000000000003', '6f6f6f6f-0000-4000-8000-000000000003',
  'microsoft-azure-blog', 'compute', 'rss', 'publisher_feed_syndication', true,
  'Hyperscaler cloud announcements. The feed is the whole Azure blog, so not every item is compute infrastructure; Phase 1A assigns category by source and does not classify items.'
),
(
  '6d6d6d6d-0000-4000-8000-000000000004', '6f6f6f6f-0000-4000-8000-000000000004',
  'coreweave-blog', 'compute', 'rss', 'publisher_feed_syndication', true,
  'GPU cloud operator, the closest Phase 1A source to the market UCPI measures.'
);

do $$
declare
  n integer;
begin
  select count(*) into n from reference.news_sources where is_enabled;
  if n <> 4 then raise exception 'expected 4 enabled news sources, found %', n; end if;
  select count(*) into n from reference.news_sources ns
    join reference.source_interfaces si on si.id = ns.source_interface_id
   where ns.is_enabled and si.production_access_state <> 'production_approved';
  if n <> 0 then raise exception '% enabled news source(s) are not production-approved', n; end if;
  select count(*) into n from reference.news_sources where category <> 'compute';
  if n <> 0 then raise exception 'Phase 1A enables Compute only; found % source(s) in another category', n; end if;
  select count(*) into n from reference.permission_grants g
    join reference.source_interfaces si on si.id = g.source_interface_id
   where si.source_class = 'news_feed' and g.covers_index_use;
  if n <> 0 then raise exception 'a news grant claims index permission it was never given'; end if;
  select count(*) into n from pipeline.news_articles;
  if n <> 0 then raise exception 'news articles were seeded; articles come from ingestion, never from a migration'; end if;
  select count(*) into n from pipeline.source_retrievals sr
    join reference.source_interfaces si on si.id = sr.source_interface_id
   where si.source_class = 'news_feed';
  if n <> 0 then raise exception 'a news retrieval was seeded'; end if;
end
$$;
