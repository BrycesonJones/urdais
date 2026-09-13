-- Vast.ai terms investigation: evidence improves, classification does not move.
--
-- Phase 4A recorded Vast as not_permitted on both axes on the strength of three
-- prohibitions. Re-reading the Terms of Use in full leaves all four
-- classification values where they are and makes the position considerably
-- clearer, in a direction that matters for how the request should be framed and
-- for how likely it is to succeed.
--
-- What Phase 4A recorded were the prohibitions. What it missed is that they sit
-- underneath a positive licence grant with an exhaustive list of permitted
-- uses. "Authorized Data" is a defined term covering "pricing, availability,
-- capacity, configuration, historical, aggregated or other market data ... made
-- available by Company only after acceptance of this Agreement", which is
-- precisely the data Urdais wants. The grant permits its use "solely (a) to
-- evaluate, configure and purchase Company Services for your own use and (b) to
-- inform the pricing of your own products or services offered to third
-- parties", and then states that "you may not use Authorized Data for any other
-- commercial data product or market-information purpose".
--
-- Urdais is a commercial market-information product and is not within either
-- permitted use. This is not a generic anti-scraping clause that happens to
-- catch Urdais; it is a licence whose enumerated purposes exclude Urdais and
-- whose exclusion names the excluded category directly.
--
-- Two further findings bear on the commercial approach rather than on the
-- classification. The index clause carries an express remedy, "unless Company
-- expressly agrees otherwise in a separate written agreement", so an agreement
-- path exists and is named. But Vast also "reserves all rights it may have in
-- the compilation and delivery of Authorized Data and in any proprietary feed,
-- export, chart, index or other data product created by Company", which means
-- Urdais would be asking to do something Vast has expressly reserved for
-- itself. That is worth knowing before the conversation rather than after it.
--
-- Classification values are deliberately unchanged and a guard below asserts
-- it. Runpod, Lambda, DigitalOcean, Azure and AWS are untouched.
--
-- Separately and not a permission matter: Phase 2 measured that this interface
-- cannot enumerate its own population. That is recorded in the notes because it
-- bears on whether the source could support the methodology even with
-- permission, which is a different question from whether it is allowed.

update reference.source_interfaces
   set notes = 'Richest observed H100 offer-level structure and the only venue exposing per-offer availability. The Terms of Use define Authorized Data to cover pricing, availability, capacity, configuration, historical and other market data, grant a licence limited to two enumerated purposes (evaluating and purchasing Company Services, and informing the pricing of the user''s own offering), and state that Authorized Data may not be used for any other commercial data product or market-information purpose. Urdais is a commercial market-information product and falls outside both permitted uses. A separate clause names index, benchmark, pricing index and price-comparison database explicitly. The remedy is named: a separate written agreement. Vast also reserves index and data-product rights in Authorized Data to itself, so any request asks to do something Vast has reserved. The Phase 1 and Phase 2 research artifacts remain part of Urdais''s research history; this review makes no determination about prior activity. SEPARATE FROM PERMISSION: Phase 2 measured that this interface cannot enumerate its own population, capping responses at 64 records regardless of the requested limit while reporting truncated false, and returning different subsets for different orderings. Even with permission, the seller-reduction rule and the participant gates would rest on a population Urdais cannot reproducibly define.',
       terms_evidence = jsonb_build_object(
         'reviewed_on', '2026-09-13',
         'revised_on', '2026-09-13',
         'revision', 'Classification values unchanged. Evidence expanded after reading the Terms of Use in full: Authorized Data is a defined term covering exactly the data Urdais wants; the prohibitions sit underneath a positive licence grant whose two enumerated purposes exclude Urdais; the exclusion names commercial data products and market-information purposes directly; the index clause carries an express written-agreement remedy; and Vast reserves index and data-product rights in Authorized Data to itself.',
         'methodology_constraint', 'Independent of permission, Phase 2 measured that this interface cannot enumerate its own population: a hard cap of 64 records regardless of the requested limit, truncated reported false while truncating, 22 of 64 records differing between two orderings of the same query, and a rentable-filtered query returning 16 while the union proved 23. Per-offer content was consistent, so this is interface incompleteness rather than volatility. Consequence: the seller minimum is not well defined over a non-enumerable population, and the child''s participant counts and regional gates would rest on a universe Urdais cannot reproducibly define. Permission alone would not make this source usable.',
         'commercial_note', 'Vast reserves to itself the rights it may have in any proprietary feed, export, chart, index or other data product created from Authorized Data. A request from Urdais therefore asks for permission to build something the provider has expressly reserved, which lowers the likely success of the request and should be stated plainly rather than discovered later.',
         'governing_documents_note', 'The Terms of Use Agreement is the governing document. Checked and returning HTTP 404 on 13 September 2026: /legal/api-terms, /api-terms, /legal/acceptable-use, /data-license. No separate API terms, acceptable-use policy or data licence exists. robots.txt addresses AI crawler user agents and is not a contractual instrument.',
         'documents', jsonb_build_array(
           jsonb_build_object(
             'title', 'Vast.ai Terms of Use Agreement',
             'url', 'https://vast.ai/terms',
             'version_date', 'September 1, 2026',
             'retrieved_on', '2026-09-13',
             'clauses', jsonb_build_array(
               jsonb_build_object('axis', 'scope', 'section', 'Authorized Data',
                 'text', 'Certain pricing, availability, capacity, configuration, historical, aggregated or other market data may be made available by Company only after acceptance of this Agreement (collectively, "Authorized Data"). Authorized Data may include individual prices, availability counts and other factual information.',
                 'note', 'Defines the category. It is exactly the data the UCPI child needs, and it attaches to the data rather than to a surface, so the question does not turn on whether the API host is within the Website definition. Not recorded in Phase 4A.'),
               jsonb_build_object('axis', 'data_use', 'section', 'Authorized Data',
                 'text', 'Subject to your compliance with this Agreement, Company grants you a limited, non-exclusive, non-transferable, non-sublicensable right to use Authorized Data solely (a) to evaluate, configure and purchase Company Services for your own use and (b) to inform the pricing of your own products or services offered to third parties. You may use pricing and availability information provided by Company to determine the configuration and pricing of your own offering, but you may not use Authorized Data for any other commercial data product or market-information purpose.',
                 'note', 'The decisive clause. A positive grant with an exhaustive list of permitted uses, neither of which is Urdais, followed by an express exclusion that names the category Urdais occupies. Not recorded in Phase 4A, which recorded only the prohibitions.'),
               jsonb_build_object('axis', 'data_use', 'section', 'Authorized Data',
                 'text', 'Without limiting the foregoing, except to determine the pricing of your own products or services as expressly permitted above, you may not use Authorized Data (or any value derived therefrom) alone or together with other data, as an input to or for the construction, calculation, publication, maintenance, or administration of any index, benchmark, pricing index, price-comparison database, or other product or service that measures, compares, tracks, summarizes or reflects pricing, availability, capacity or market conditions, or to train or improve any machine-learning or artificial-intelligence model for any such purpose, unless Company expressly agrees otherwise in a separate written agreement.',
                 'note', 'Quoted here in full with both its carve-out and its remedy, which Phase 4A recorded without. Names index, benchmark, pricing index and price-comparison database explicitly.'),
               jsonb_build_object('axis', 'remedy', 'section', 'Authorized Data',
                 'text', 'unless Company expressly agrees otherwise in a separate written agreement',
                 'note', 'The named path to authorization for the index use.'),
               jsonb_build_object('axis', 'commercial', 'section', 'Authorized Data',
                 'text', 'Company reserves all rights it may have in the compilation and delivery of Authorized Data and in any proprietary feed, export, chart, index or other data product created by Company.',
                 'note', 'Vast reserves index and data-product rights to itself. A request asks to do something the provider has reserved.'),
               jsonb_build_object('axis', 'collection', 'section', 'Prohibited Activities',
                 'text', 'Using any robot, spider, crawler, scraper, script, browser automation, web scraping, web harvesting, web data extraction, data-mining tool or any other automated method to access, query, copy, download, monitor, collect, cache, store or extract data from the Website or Services, except as expressly authorized in a separate written agreement with Company.',
                 'note', 'Reaches the Services as well as the Website, and names the same remedy.'),
               jsonb_build_object('axis', 'collection', 'section', 'Prohibited Activities',
                 'text', 'Engaging in any bulk, systematic, or automated retrieval, collection, copying, downloading, harvesting, caching, storage or other extraction of data or other content from the Website to create, develop, populate, maintain, or compile, directly or indirectly, a collection, compilation, database, dataset, index, benchmark, or directory without written permission from Company.'),
               jsonb_build_object('axis', 'data_use', 'section', 'Company Content licence',
                 'text', 'you are granted a limited, non-exclusive, non-transferable, non-sublicensable license to access and use the Website and the Company Content solely for your internal business purposes',
                 'note', 'Publishing an index is not an internal business purpose.'),
               jsonb_build_object('axis', 'scope', 'section', 'Opening definitions',
                 'text', 'concerning your access to and use of the https://vast.ai website as well as any other media form, media channel, mobile website or mobile application related or connected thereto (collectively, the "Website")',
                 'note', 'Narrower than a subdomain clause, but the data-use restriction attaches to Authorized Data rather than to the Website, so the scope question does not decide the outcome.'),
               jsonb_build_object('axis', 'contact', 'section', 'Contact Us',
                 'text', 'In order to resolve a complaint regarding the Company Services or to receive further information regarding use of the Company Services, please contact Company as set forth below. Vast.ai Inc. Email: contact@vast.ai',
                 'note', 'The only contact route the Agreement designates.')
             )
           ),
           jsonb_build_object(
             'title', 'Vast.ai search offers API reference',
             'url', 'https://docs.vast.ai/api-reference/search/search-offers',
             'retrieved_on', '2026-09-13',
             'clauses', jsonb_build_array(
               jsonb_build_object('axis', 'collection',
                 'text', 'All endpoints require Authorization: Bearer $VAST_API_KEY.',
                 'note', 'POST /api/v0/bundles on console.vast.ai. Holding a key means having accepted the Agreement, which is what makes the retrieved data Authorized Data.')
             )
           )
         )
       )
 where slug = 'vast-ai-offer-search';

-- The four classification values must be exactly as Phase 4A left them. This
-- migration records evidence; it does not move Vast in either direction.
do $$
declare
  n integer;
begin
  select count(*) into n from reference.source_interfaces
   where slug = 'vast-ai-offer-search'
     and terms_review_state = 'not_permitted'
     and data_use_terms_state = 'not_permitted'
     and production_access_state = 'production_blocked'
     and written_agreement_required is true;
  if n <> 1 then raise exception 'Vast classification changed, which this migration must not do'; end if;

  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source became production-approved, which this migration must never do'; end if;

  -- The licence grant is the reason this migration exists.
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where slug = 'vast-ai-offer-search' and c->>'text' like '%any other commercial data product or market-information purpose%';
  if n = 0 then raise exception 'the licence grant and its exclusion were not recorded'; end if;

  -- The methodology constraint is recorded separately from the permission axes.
  if (select terms_evidence->>'methodology_constraint' from reference.source_interfaces where slug = 'vast-ai-offer-search') is null then
    raise exception 'the enumeration constraint was not recorded'; end if;
end
$$;
