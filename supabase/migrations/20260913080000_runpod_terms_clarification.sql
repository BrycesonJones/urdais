-- Runpod terms clarification: the scope question Phase 4A left open is answered.
--
-- Phase 4A recorded Runpod as under review on both axes, on the reasoning that
-- the Terms of Service restrict automated access while the official API
-- documentation affirmatively provides a programmatic interface, and that the
-- two were in tension. That reasoning rested on not knowing whether the Terms
-- reached the API host at all.
--
-- They do. The Terms define their own scope as "your access to and use of the
-- Runpod.io website and its subdomains (the 'Site')". `api.runpod.io` is a
-- subdomain of runpod.io, so the Site prohibitions reach the documented API
-- endpoint. Two further clauses not recorded in Phase 4A follow from that:
-- a purpose limitation, and a restriction on commercial use absent specific
-- approval.
--
-- Read with the scope definition in hand, the apparent conflict largely
-- dissolves rather than deepening. The API documentation grants programmatic
-- access for managing one's own resources; the Terms separately prohibit
-- systematic retrieval for the purpose of compiling a database. Those are
-- different activities, and the one Urdais would perform is the prohibited
-- one. The prohibition names its own cure: written permission.
--
-- Both axes therefore move from under_review to not_permitted, and
-- written_agreement_required becomes true, which the schema check requires be
-- accompanied by production_blocked. This is a change in what the evidence
-- establishes, not a change in the permission model: the two axes, their
-- vocabulary and the production gate are untouched. Lambda, Vast, DigitalOcean,
-- Azure and AWS are untouched.
--
-- The practical position is unchanged and slightly more actionable. Runpod was
-- not production-approved before and is not now. What changed is that the
-- obstacle is a stated prohibition with a stated remedy rather than an
-- unresolved ambiguity, so the commercial approach is a permission request
-- rather than a clarification question. Runpod remains first in the outreach
-- order: its clause is a generic anti-compilation term rather than one aimed
-- at indices, and its availability data remains the strongest found.
--
-- The Phase 4A evidence is preserved in full. The new clauses are appended to
-- the same document entry, and the earlier reasoning is retained under
-- prior_assessment so the revision itself stays auditable.

update reference.source_interfaces
   set terms_review_state = 'not_permitted',
       data_use_terms_state = 'not_permitted',
       production_access_state = 'production_blocked',
       written_agreement_required = true,
       notes = 'Exposes minimum pod GPU count and a four-level per-datacenter availability signal conditional on requested GPU count and country, which is the strongest Grade 3 availability shape found anywhere. The Terms of Service define the Site as the Runpod.io website and its subdomains, so they reach api.runpod.io, and they prohibit systematically retrieving data from the Site to compile a database without written permission, restrict commercial use absent specific approval, and limit use to the purposes for which the Site is made available. The API documentation provides programmatic access for managing one''s own resources, which is a different activity from the systematic compilation Urdais would perform. Written permission is the remedy the Terms themselves name, so this is a permission request rather than an open question. No further assessment is available from public materials.',
       terms_evidence = jsonb_build_object(
         'reviewed_on', '2026-09-13',
         'revised_on', '2026-09-13',
         'revision', 'Phase 4A recorded both axes as under_review because it had not established whether the Terms reached the API host. The Terms define the Site to include runpod.io subdomains, which resolves that question and brings the systematic-retrieval, purpose and commercial-use clauses to bear on api.runpod.io. Both axes moved to not_permitted absent written permission.',
         'prior_assessment', jsonb_build_object(
           'terms_review_state', 'under_review',
           'data_use_terms_state', 'under_review',
           'written_agreement_required', null,
           'reasoning', 'The general Terms of Service and the official API documentation are in tension on the collection axis; neither settles the data-use axis. Recorded as under review rather than permitted or prohibited.'
         ),
         'governing_documents_note', 'No separate API terms, developer terms, acceptable-use policy or data licence was found. Checked and returning HTTP 404 on 13 September 2026: /legal/acceptable-use-policy, /legal/api-terms, /legal/developer-terms, /legal/cloud-terms. The Terms of Service is the governing document.',
         'documents', jsonb_build_array(
           jsonb_build_object(
             'title', 'Terms of Service | Runpod',
             'url', 'https://www.runpod.io/legal/terms-of-service',
             'version_date', 'March 24, 2026',
             'retrieved_on', '2026-09-13',
             'clauses', jsonb_build_array(
               jsonb_build_object('axis', 'scope', 'section', 'Opening definitions',
                 'text', 'concerning your access to and use of the Runpod.io website and its subdomains (the "Site") as well as the services, content, and other resources available on or enabled via our Site, including, without limitation, the online marketplace ("Marketplace Offerings") that enables access to and purchase of cloud services, compute instances, storage, and software products (collectively, the Site and related services, including Marketplace Offerings, the "Service")',
                 'note', 'Decisive for scope: api.runpod.io is a subdomain of runpod.io, so the Site prohibitions reach the documented API endpoint. Not recorded in Phase 4A.'),
               jsonb_build_object('axis', 'data_use', 'section', 'Prohibited Activities',
                 'text', 'Systematically retrieve data or other content from the Site to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us.',
                 'note', 'Squarely describes the activity Urdais would perform, and names written permission as the remedy.'),
               jsonb_build_object('axis', 'both', 'section', 'Prohibited Activities',
                 'text', 'The Site may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us.',
                 'note', 'Urdais is a commercial market-data product. Not recorded in Phase 4A.'),
               jsonb_build_object('axis', 'both', 'section', 'Prohibited Activities',
                 'text', 'You may not access or use the Site for any purpose other than that for which we make the Site available.',
                 'note', 'Purpose limitation. Not recorded in Phase 4A.'),
               jsonb_build_object('axis', 'collection', 'section', 'Prohibited Activities',
                 'text', 'access or use the Site or the Service through automated or non-human means, whether through a bot, script or otherwise',
                 'note', 'General restriction. Read alone it would bar use of the API Runpod itself provides, so it is not the clause this classification rests on.'),
               jsonb_build_object('axis', 'collection', 'section', 'Prohibited Activities',
                 'text', 'Except as may be the result of standard search engine or Internet browser usage, use, launch, develop, or distribute any automated system, including without limitation, any spider, robot, cheat utility, scraper, or offline reader that accesses the Site'),
               jsonb_build_object('axis', 'data_use', 'section', 'Prohibited Activities',
                 'text', 'Use the Service as part of any effort to compete with us.'),
               jsonb_build_object('axis', 'data_use', 'section', 'Intellectual Property Rights',
                 'text', 'Except with respect to Your Content, you agree that Runpod and its suppliers or licensors own all rights, title and interest in the Service.',
                 'note', 'Ownership assertion over the Service, which by definition includes the Site and its content.'),
               jsonb_build_object('axis', 'contact', 'section', 'Contact Us',
                 'text', 'If you have any questions, complaints or claims regarding the Service or to receive further information regarding use of the Service, please contact us at: Runpod, Inc. 329 Bryant St #4D San Francisco, CA 94107 United States',
                 'note', 'The published email address is obfuscated in the page source and was not captured; the postal address and the site contact channels are recorded instead.')
             )
           ),
           jsonb_build_object(
             'title', 'Runpod API v2 overview',
             'url', 'https://docs.runpod.io/api-reference-v2/overview',
             'retrieved_on', '2026-09-13',
             'clauses', jsonb_build_array(
               jsonb_build_object('axis', 'collection',
                 'text', 'The Runpod REST API v2 provides programmatic access to all Runpod compute resources. Integrate GPU infrastructure into your applications, workflows, and automation systems.',
                 'note', 'Affirmatively provides a programmatic automation interface, for managing one''s own resources.'),
               jsonb_build_object('axis', 'collection',
                 'text', 'The Runpod REST API v2 provides programmatic access to your Runpod resources over standard HTTP. Use it to create and manage Pods, query Serverless endpoints, provision storage, and retrieve billing data - without using the console.',
                 'note', 'Scope of the grant is the caller''s own resources, which is narrower than third-party data compilation.'),
               jsonb_build_object('axis', 'collection',
                 'text', 'All requests require a Runpod API key in the request headers.')
             )
           ),
           jsonb_build_object(
             'title', 'List GPU types',
             'url', 'https://docs.runpod.io/api-reference-v2/catalog/list-gpu-types',
             'retrieved_on', '2026-09-13',
             'clauses', jsonb_build_array(
               jsonb_build_object('axis', 'collection',
                 'text', 'Returns available GPU types with pricing. Availability is included only when requested with include=AVAILABILITY, which requires product - stock differs by product context.',
                 'note', 'GET /v2/catalog/gpus on server https://api.runpod.io; security bearerAuth. REST API v1 is deprecated and retires 15 November 2026.')
             )
           )
         )
       )
 where slug = 'runpod-gpu-types';

-- Exactly one interface may be affected, and the rest of the registry is untouched.
do $$
declare
  n integer;
begin
  select count(*) into n from reference.source_interfaces
   where slug = 'runpod-gpu-types' and terms_review_state = 'not_permitted'
     and data_use_terms_state = 'not_permitted' and production_access_state = 'production_blocked'
     and written_agreement_required is true;
  if n <> 1 then raise exception 'Runpod row was not updated as intended (matched % rows)', n; end if;

  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source became production-approved, which this migration must never do'; end if;
end
$$;
