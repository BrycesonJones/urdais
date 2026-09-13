-- Phase 4A: source terms review.
--
-- The Phase 3 registry carried one terms axis, `terms_review_state`. Real
-- provider terms turn out to answer two separate questions that can and do
-- diverge:
--
--   1. May Urdais retrieve this source automatically through the documented
--      interface?
--   2. May Urdais use the retrieved pricing and availability data to construct,
--      calculate, publish or maintain an index or benchmark?
--
-- One marketplace prohibits both, in separate clauses. Two hyperscalers
-- expressly invite programmatic retrieval while saying nothing about index
-- construction. Collapsing the two into one flag would either overstate
-- permission or block a source for the wrong reason, and the distinction is
-- decision-relevant: it determines whether a source needs a written agreement
-- and for what.
--
-- `terms_review_state` is therefore narrowed, by documentation and not by
-- rename, to question 1. `data_use_terms_state` answers question 2. A source
-- reaches production only when both are `permitted`.
--
-- No collector exists. No live provider observation has been collected. These
-- rows record that Urdais knows the sources exist and what their terms say;
-- they do not make any provider a UCPI constituent, and there is no
-- constituent concept in the schema.

alter table reference.source_interfaces
  add column data_use_terms_state text not null default 'not_reviewed'
    constraint source_interfaces_data_use_state_allowed check (data_use_terms_state in (
      'not_reviewed',
      'under_review',
      'permitted',
      'not_permitted'
    )),
  add column written_agreement_required boolean,
  add column terms_evidence jsonb;

comment on column reference.source_interfaces.terms_review_state is
  'Whether automated retrieval through this interface is permitted by the provider''s own terms. Question 1 of the two-axis review.';
comment on column reference.source_interfaces.data_use_terms_state is
  'Whether using data retrieved from this interface to construct, calculate, publish or maintain an index or benchmark is permitted. Question 2 of the two-axis review. Technically collectible, permitted to automate, and permitted to use in an index are three different things.';
comment on column reference.source_interfaces.written_agreement_required is
  'True where the provider''s terms condition the permission Urdais needs on a separate written agreement. NULL where not yet determined.';
comment on column reference.source_interfaces.terms_evidence is
  'Verbatim decisive clauses with their source URL and retrieval date, so a classification can be re-checked without repeating the review.';

-- Production approval now requires both axes, not just the collection axis.
alter table reference.source_interfaces
  drop constraint source_interfaces_approval_requires_permitted_terms,
  drop constraint source_interfaces_blocked_when_terms_forbid;

alter table reference.source_interfaces
  add constraint source_interfaces_approval_requires_permitted_terms
    check (production_access_state <> 'production_approved'
           or (terms_review_state = 'permitted' and data_use_terms_state = 'permitted')),
  add constraint source_interfaces_blocked_when_terms_forbid
    check ((terms_review_state <> 'not_permitted' and data_use_terms_state <> 'not_permitted')
           or production_access_state = 'production_blocked');

-- Providers reviewed. A provider row means Urdais knows the company publishes a
-- source. It is not a seller, an operator, a capacity source, or a constituent.
insert into reference.providers (id, slug, name, provider_kind, website) values
  ('44444444-0000-4000-8000-000000000001', 'vast-ai',         'Vast.ai Inc.',        'marketplace',     'https://vast.ai'),
  ('44444444-0000-4000-8000-000000000002', 'lambda',          'Lambda',              'cloud_provider',  'https://lambda.ai'),
  ('44444444-0000-4000-8000-000000000003', 'runpod',          'Runpod, Inc.',        'cloud_provider',  'https://www.runpod.io'),
  ('44444444-0000-4000-8000-000000000004', 'digitalocean',    'DigitalOcean',        'cloud_provider',  'https://www.digitalocean.com'),
  ('44444444-0000-4000-8000-000000000005', 'microsoft-azure', 'Microsoft Azure',     'cloud_provider',  'https://azure.microsoft.com'),
  ('44444444-0000-4000-8000-000000000006', 'aws',             'Amazon Web Services', 'cloud_provider',  'https://aws.amazon.com');

-- Interfaces reviewed, with the decisive clauses retained verbatim.
insert into reference.source_interfaces (
  id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
  access_class, production_access_state, terms_review_state, data_use_terms_state,
  written_agreement_required, notes, terms_evidence
) values
(
  '55555555-0000-4000-8000-000000000001',
  '44444444-0000-4000-8000-000000000001',
  'vast-ai-offer-search', 'Vast.ai search offers', 'offer_interface',
  'https://console.vast.ai/api/v0/bundles', true,
  'api_key', 'production_blocked', 'not_permitted', 'not_permitted', true,
  'Richest observed H100 offer-level structure and the only venue exposing per-offer availability, but the Terms of Use prohibit automated collection and separately prohibit using the data to construct or maintain an index. The Phase 1 and Phase 2 research artifacts remain part of Urdais''s research history; this review makes no determination about prior activity. No further retrieval and no production use without a separate written agreement satisfying the current terms.',
  '{"reviewed_on": "2026-09-13", "documents": [{"title": "Vast.ai Terms of Use Agreement", "url": "https://vast.ai/terms", "version_date": "September 1, 2026", "clauses": [{"axis": "collection", "text": "Using any robot, spider, crawler, scraper, script, browser automation, web scraping, web harvesting, web data extraction, data-mining tool or any other automated method to access, query, copy, download, monitor, collect, cache, store or extract data from the Website or Services, except as expressly authorized in a separate written agreement with Company."}, {"axis": "collection", "text": "Engaging in any bulk, systematic, or automated retrieval, collection, copying, downloading, harvesting, caching, storage or other extraction of data or other content from the Website to create, develop, populate, maintain, or compile, directly or indirectly, a collection, compilation, database, dataset, index, benchmark, or directory without written permission from Company."}, {"axis": "data_use", "text": "you may not use Authorized Data (or any value derived therefrom) alone or together with other data, as an input to or for the construction, calculation, publication, maintenance, or administration of any index, benchmark, pricing index, price-comparison database, or other product or service that measures, compares, tracks, summarizes or reflects pricing, availability, capacity or market conditions"}]}, {"title": "Vast.ai search offers API reference", "url": "https://docs.vast.ai/api-reference/search/search-offers", "retrieved_on": "2026-09-13", "note": "POST /api/v0/bundles; All endpoints require Authorization: Bearer $VAST_API_KEY."}]}'::jsonb
),
(
  '55555555-0000-4000-8000-000000000002',
  '44444444-0000-4000-8000-000000000002',
  'lambda-instance-types', 'Lambda Cloud instance types', 'catalog_price_interface',
  'https://cloud.lambda.ai/api/v1/instance-types', true,
  'api_key', 'production_blocked', 'under_review', 'not_permitted', true,
  'One endpoint returns price, GPU count, host bundle and regions with capacity available, which is the reference source shape Phase 1 identified. The Acceptable Use Policy prohibits only unrestricted crawling, so rate-limited retrieval is not itself forbidden, but the Cloud Terms of Service bar accessing the Services to monitor them for benchmarking purposes, and API access requires being a customer under those terms.',
  '{"reviewed_on": "2026-09-13", "documents": [{"title": "Lambda Terms of service", "url": "https://lambda.ai/legal/terms-of-service", "version_date": "August 2025", "clauses": [{"axis": "data_use", "text": "access any portion of the Services for the purpose of building a similar or competitive product or service, or monitor the Services for any benchmarking or competitive purpose"}, {"axis": "collection", "text": "web crawling which is not restricted to a rate so as not to impair or otherwise disrupt the servers being crawled", "note": "Listed among prohibited activities; the prohibition is on unrestricted crawling, not on rate-limited retrieval."}, {"axis": "collection", "text": "Customer shall use the Authorized APIs in accordance with the Documentation, and will promptly correct any usage of Authorized APIs that does not comply with the Documentation."}]}, {"title": "Lambda Cloud API specification", "url": "https://cloud.lambda.ai/api/v1/openapi.json", "retrieved_on": "2026-09-13", "note": "GET /api/v1/instance-types; security bearerAuth or basicAuth; live call returned HTTP 401 global/invalid-api-key."}]}'::jsonb
),
(
  '55555555-0000-4000-8000-000000000003',
  '44444444-0000-4000-8000-000000000003',
  'runpod-gpu-types', 'Runpod catalog GPU types', 'catalog_price_interface',
  'https://api.runpod.io/v2/catalog/gpus', true,
  'api_key', 'production_review_pending', 'under_review', 'under_review', null,
  'Exposes minimum pod GPU count and a four-level per-datacenter availability signal conditional on requested GPU count and country, which is the strongest Grade 3 availability shape found anywhere. Two primary sources are in tension: the Terms of Service restrict automated and non-human access and systematic retrieval, while the official API documentation affirmatively provides an authenticated REST API for programmatic integration and automation. The documentation establishes that some automated access is intentionally supported; neither source settles whether Urdais may retrieve pricing and availability continuously and use it to construct or publish an external index. Both axes are under review pending written clarification, and no written agreement is recorded as required because neither source states that one is.',
  '{"reviewed_on": "2026-09-13", "conflict": "The general Terms of Service and the official API documentation are in tension on the collection axis; neither settles the data-use axis. Recorded as under review rather than permitted or prohibited.", "documents": [{"title": "Terms of Service | Runpod", "url": "https://www.runpod.io/legal/terms-of-service", "version_date": "March 24, 2026", "clauses": [{"axis": "collection", "text": "access or use the Site or the Service through automated or non-human means, whether through a bot, script or otherwise", "note": "General restriction; in tension with the API documentation below."}, {"axis": "collection", "text": "Except as may be the result of standard search engine or Internet browser usage, use, launch, develop, or distribute any automated system, including without limitation, any spider, robot, cheat utility, scraper, or offline reader that accesses the Site"}, {"axis": "data_use", "text": "Systematically retrieve data or other content from the Site to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us."}, {"axis": "data_use", "text": "Use the Service as part of any effort to compete with us."}]}, {"title": "Runpod API v2 overview", "url": "https://docs.runpod.io/api-reference-v2/overview", "retrieved_on": "2026-09-13", "clauses": [{"axis": "collection", "text": "The Runpod REST API v2 provides programmatic access to all Runpod compute resources. Integrate GPU infrastructure into your applications, workflows, and automation systems.", "note": "Official documentation affirmatively provides a programmatic automation interface."}, {"axis": "collection", "text": "The Runpod REST API v2 provides programmatic access to your Runpod resources over standard HTTP. Use it to create and manage Pods, query Serverless endpoints, provision storage, and retrieve billing data - without using the console."}, {"axis": "collection", "text": "All requests require a Runpod API key in the request headers."}]}, {"title": "List GPU types", "url": "https://docs.runpod.io/api-reference-v2/catalog/list-gpu-types", "retrieved_on": "2026-09-13", "clauses": [{"axis": "collection", "text": "Returns available GPU types with pricing. Availability is included only when requested with include=AVAILABILITY, which requires product - stock differs by product context.", "note": "GET /v2/catalog/gpus on server https://api.runpod.io; security bearerAuth. REST API v1 is deprecated and retires 15 November 2026."}]}]}'::jsonb
),
(
  '55555555-0000-4000-8000-000000000004',
  '44444444-0000-4000-8000-000000000004',
  'digitalocean-sizes', 'DigitalOcean sizes catalog', 'catalog_price_interface',
  'https://api.digitalocean.com/v2/sizes', true,
  'api_key', 'production_review_pending', 'under_review', 'under_review', null,
  'Documented OAuth bearer API with published scopes. Neither the Terms of Service nor the Acceptable Use Policy addresses API retrieval, index construction or data compilation directly; the only adjacent clause prohibits harvesting or scraping content of the Services, whose application to a documented authenticated API endpoint is not settled by the text. Both axes need written confirmation before production.',
  '{"reviewed_on": "2026-09-13", "documents": [{"title": "DigitalOcean Terms of Service Agreement", "url": "https://www.digitalocean.com/legal/terms-of-service-agreement", "version_date": "August 22, 2026", "clauses": [{"axis": "both", "text": "not addressed", "note": "No clause on automated access, API use, data compilation, indexes or benchmarks."}]}, {"title": "DigitalOcean Acceptable Use Policy", "url": "https://www.digitalocean.com/legal/acceptable-use-policy", "version_date": "March 20, 2026", "clauses": [{"axis": "collection", "text": "Monitoring or crawling of a System that impairs or disrupts the System being monitored or crawled, or other harvesting or scraping of any content of the Services.", "note": "Ambiguous as applied to a documented authenticated API."}]}, {"title": "DigitalOcean public API specification", "url": "https://raw.githubusercontent.com/digitalocean/openapi/main/specification/DigitalOcean-public.v2.yaml", "retrieved_on": "2026-09-13", "note": "Global security bearer_auth; read scopes documented; termsOfService points at the Terms of Service Agreement."}]}'::jsonb
),
(
  '55555555-0000-4000-8000-000000000005',
  '44444444-0000-4000-8000-000000000005',
  'azure-retail-prices', 'Azure Retail Prices API', 'catalog_price_interface',
  'https://prices.azure.com/api/retail/prices', true,
  'public_unauthenticated', 'production_review_pending', 'permitted', 'under_review', null,
  'Microsoft documents this interface as an unauthenticated programmatic API whose purpose is retrieving retail prices, which settles the collection axis affirmatively. The documented purpose named is internal analysis and price comparison; publishing an external index is neither described nor prohibited, so the data-use axis needs written confirmation. Verified live at HTTP 200 unauthenticated during Phase 2. Its H100 products are whole eight-accelerator SKUs and it exposes no capacity signal, so it cannot serve the per-accelerator child regardless of terms.',
  '{"reviewed_on": "2026-09-13", "documents": [{"title": "Azure Retail Prices REST API overview", "url": "https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices", "clauses": [{"axis": "collection", "text": "This API gives you an unauthenticated experience to get retail rates for all Azure services."}, {"axis": "collection", "text": "Azure customers have been looking for a programmatic way to retrieve retail prices for all Azure services."}, {"axis": "data_use", "text": "The programmatic API can also help you create your own tools for internal analysis and price comparison across SKUs and regions.", "note": "Names internal analysis; silent on external index publication."}]}, {"title": "Microsoft Terms of Use", "url": "https://www.microsoft.com/en-us/legal/terms-of-use", "version_date": "February 7, 2022", "clauses": [{"axis": "collection", "text": "You may not obtain or attempt to obtain any materials or information through any means not intentionally made available through the Services.", "note": "The Retail Prices API is intentionally made available."}, {"axis": "collection", "text": "You may not use web scraping, web harvesting, or web data extraction methods to extract data from the AI services.", "note": "Scoped to AI services, not to the pricing API."}]}]}'::jsonb
),
(
  '55555555-0000-4000-8000-000000000006',
  '44444444-0000-4000-8000-000000000006',
  'aws-price-list-bulk', 'AWS Price List Bulk API', 'catalog_price_interface',
  'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/region_index.json', true,
  'public_unauthenticated', 'production_review_pending', 'permitted', 'under_review', null,
  'AWS documentation expressly recommends programmatic download of the bulk price list files, which settles the collection axis. The Service Terms expressly permit Benchmarks of the Services subject to disclosing all information necessary to replicate them, a condition a published methodology plausibly meets, but that clause concerns benchmarking the Services rather than constructing a price index, and the Site Terms separately restrict data mining against the AWS Site. The data-use axis needs written confirmation. Its H100 capacity is sold as whole eight-accelerator instances with no capacity signal, so it cannot serve the per-accelerator child regardless of terms.',
  '{"reviewed_on": "2026-09-13", "documents": [{"title": "Getting price list files using the AWS Price List Bulk API", "url": "https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-ppslong.html", "clauses": [{"axis": "collection", "text": "We recommend that you use the AWS Price List Bulk API to find and download price list files programmatically."}, {"axis": "collection", "text": "Consume large amounts of product and pricing information for AWS services."}]}, {"title": "AWS Service Terms", "url": "https://aws.amazon.com/service-terms/", "version_date": "September 11, 2026", "clauses": [{"axis": "data_use", "text": "You may perform benchmarks or comparative tests or evaluations (each, a Benchmark) of the Services. If you perform or disclose, or direct or permit any third party to perform or disclose, any Benchmark of any of the Services, you (i) will include in any disclosure, and will disclose to us, all information necessary to replicate such Benchmark", "note": "Concerns benchmarking the Services; not squarely a price-index permission."}]}, {"title": "AWS Site Terms", "url": "https://aws.amazon.com/terms/", "version_date": "June 4, 2025", "clauses": [{"axis": "collection", "text": "This license does not include any resale or commercial use of the AWS Site or its contents; any derivative use of the AWS Site or its contents; any downloading or copying of any other users account information; or any use of data mining, robots, or similar data gathering and extraction tools.", "note": "Addressed to the AWS Site, distinct from the documented Price List Bulk API endpoints."}]}]}'::jsonb
);
