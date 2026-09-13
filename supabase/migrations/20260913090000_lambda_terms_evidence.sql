-- Lambda terms investigation: evidence improves, classification does not move.
--
-- Phase 4A recorded Lambda as under_review on collection and not_permitted on
-- data use, resting on one clause: the Cloud Terms bar the customer from
-- monitoring the Services for any benchmarking purpose. Re-reading the
-- governing documents leaves all four classification values where they are and
-- changes what is known about them in three ways that matter for what happens
-- next.
--
-- First, scope is now settled rather than assumed. The Cloud Terms define
-- Services to include "the Authorized APIs", so the restriction reaches
-- cloud.lambda.ai/api/v1/instance-types directly. Phase 4A did not record this.
--
-- Second, and decisively for the path forward, the restriction carries its own
-- carve-out. The list of prohibited uses opens "Except for uses that are
-- expressly permitted (for example, in the Documentation or in an Order)", and
-- Order is a defined instrument: an order for the Services mutually agreed to
-- by the Parties and governed by the Agreement. Lambda therefore names a
-- specific contractual mechanism by which the prohibited use becomes permitted.
-- That is a stronger and more concrete remedy than a generic reference to
-- written permission, and it is what the outreach asks for.
--
-- Third, a negative finding worth recording because it distinguishes Lambda
-- from the other blocked sources. There is no anti-scraping clause, no
-- prohibition on systematic retrieval, and no prohibition on compiling a
-- database anywhere in Lambda's documents. The Acceptable Use Policy bars only
-- crawling that is "not restricted to a rate so as not to impair or otherwise
-- disrupt the servers being crawled", and the Website Terms contain no
-- automated-access language at all. Nothing independently prohibits the act of
-- retrieval; the only clause that reaches Urdais is the purpose-based one.
--
-- Both axes therefore turn on the same interpretive question, which is whether
-- a published price index is "benchmarking" within the meaning of a cloud
-- services agreement. That question is genuinely interpretive and is left
-- unresolved here rather than decided. The conservative reading is retained:
-- data use stays not_permitted, collection stays under_review because the act
-- is otherwise permitted and only its purpose is in doubt, and the source stays
-- production_blocked.
--
-- Classification values are deliberately unchanged and a guard below asserts
-- it. Runpod, Vast, DigitalOcean, Azure and AWS are untouched.

update reference.source_interfaces
   set notes = 'One endpoint returns price, GPU count, host bundle and regions with capacity available, which is the reference source shape Phase 1 identified. The Cloud Terms of Service define Services to include the Authorized APIs, so the restrictions reach this endpoint, and they bar the customer from monitoring the Services for any benchmarking or competitive purpose. Whether a published price index falls within benchmarking in this context is genuinely interpretive and is not resolved here; the conservative reading is retained. Nothing independently prohibits the act of retrieval: there is no anti-scraping, systematic-retrieval or database-compilation clause anywhere in Lambda''s documents, and the Acceptable Use Policy bars only unrestricted crawling. Both axes therefore turn on the same purpose question. The restriction carries an express carve-out for uses permitted in the Documentation or in an Order, and Order is a defined mutually agreed instrument, so Lambda names a specific contractual route by which this use could become permitted.',
       terms_evidence = jsonb_build_object(
         'reviewed_on', '2026-09-13',
         'revised_on', '2026-09-13',
         'revision', 'Classification values unchanged. Evidence expanded after reading the Cloud Terms definitions and the full prohibited-use clause: Services is defined to include the Authorized APIs, which settles scope; the prohibition carries an express carve-out for uses permitted in the Documentation or in an Order; and no anti-scraping or database-compilation clause exists anywhere in Lambda''s documents, so only the purpose-based clause reaches Urdais.',
         'open_question', 'Whether constructing a published price index is "benchmarking" within the meaning of the Cloud Terms. The clause says "monitor the Services for any benchmarking or competitive purpose". Urdais would poll the Services on a schedule and its output is self-described as a benchmark, which points toward coverage. Against coverage, the conventional meaning of benchmarking in a cloud agreement is performance testing, and the clause sits among load tests, penetration tests and reverse engineering. Left unresolved; the conservative reading is retained and the carve-out is sought regardless.',
         'governing_documents_note', 'lambda.ai/legal/terms-of-service publishes six documents together: Website Terms of Use, Hardware and Software Terms of Sale, Refund Policy, Acceptable Use Policy, Cloud Terms of Service and Platform Guidelines. The Cloud Terms of Service govern use of the Services and the Authorized APIs. No separate API terms or data licence was found.',
         'documents', jsonb_build_array(
           jsonb_build_object(
             'title', 'Lambda Terms of service, Cloud Terms of Service',
             'url', 'https://lambda.ai/legal/terms-of-service',
             'version_date', 'August 2025',
             'retrieved_on', '2026-09-13',
             'clauses', jsonb_build_array(
               jsonb_build_object('axis', 'scope', 'section', 'Cloud Terms of Service, 1. Defined Terms',
                 'text', '"Services" means the software services and platform provided by Lambda, including (i) the web and other user interfaces, applications, and software provided to Users, (ii) the Authorized APIs and (iii) any modifications, updates, derivative works, optional modules, custom or standard enhancements, updates, and upgrades to or of any of the foregoing.',
                 'note', 'Settles scope: the Authorized APIs are the Services, so the restrictions reach the instance-types endpoint. Not recorded in Phase 4A.'),
               jsonb_build_object('axis', 'both', 'section', 'Cloud Terms of Service, restrictions on use',
                 'text', 'Except for uses that are expressly permitted (for example, in the Documentation or in an Order), Customer will not: ... (iv) access any portion of the Services for the purpose of building a similar or competitive product or service, or monitor the Services for any benchmarking or competitive purpose',
                 'note', 'The clause that reaches Urdais, quoted with the carve-out that opens it. The carve-out is the remedy and is the basis of the outreach. Phase 4A recorded limb (iv) without the opening exception.'),
               jsonb_build_object('axis', 'remedy', 'section', 'Cloud Terms of Service, 1. Defined Terms',
                 'text', '"Order" means an order for the Services that has been accepted by Customer (if online) or otherwise mutually agreed to by the Parties and which is governed by this Agreement.',
                 'note', 'The named instrument through which a use may be expressly permitted.'),
               jsonb_build_object('axis', 'remedy', 'section', 'Cloud Terms of Service, 1. Defined Terms',
                 'text', '"Documentation" means all documentation and other instructional material made generally available by Lambda to its customer base regarding the use of the Services.',
                 'note', 'The other route named by the carve-out.'),
               jsonb_build_object('axis', 'collection', 'section', 'Cloud Terms of Service, restrictions on use',
                 'text', '(ii) use the Services other than in accordance with the Documentation or in a manner that interferes with, unduly burdens, or disrupts the integrity, performance, or availability of the Services (for example, by conducting load tests or penetration tests without Lambda''s prior written consent)',
                 'note', 'Documentation-compliant use is contemplated; nothing here prohibits ordinary retrieval.'),
               jsonb_build_object('axis', 'data_use', 'section', 'Cloud Terms of Service, restrictions on use',
                 'text', '(vi) copy, modify, translate, or create a derivative work of any Lambda Property',
                 'note', 'Lambda Property is defined to include the Services and all content supplied in connection with them. Whether derived aggregate indicators computed from published prices are a derivative work of Lambda Property is a further open question, not relied on here.'),
               jsonb_build_object('axis', 'data_use', 'section', 'Cloud Terms of Service, restrictions on use',
                 'text', 'Customer may not access the Services if it is a direct competitor of Lambda, except with Lambda''s prior written consent.',
                 'note', 'Urdais measures this market and does not sell compute into it, so this clause is not understood to apply. Recorded because it shows prior written consent used as a mechanism.'),
               jsonb_build_object('axis', 'collection', 'section', 'Acceptable Use Policy',
                 'text', 'web crawling which is not restricted to a rate so as not to impair or otherwise disrupt the servers being crawled',
                 'note', 'The prohibition attaches to unrestricted crawling. Rate-limited retrieval is not forbidden by this clause.'),
               jsonb_build_object('axis', 'collection', 'section', 'Negative finding, whole document set',
                 'text', 'No clause prohibiting scraping, systematic retrieval, or compiling a collection, compilation, database or directory appears anywhere in Lambda''s published documents, and the Website Terms of Use contain no automated-access language.',
                 'note', 'Materially distinguishes Lambda from the other blocked sources, where such clauses are the basis of the block. For Lambda the act of retrieval is not independently prohibited.'),
               jsonb_build_object('axis', 'contact', 'section', 'Cloud Terms of Service, Notices',
                 'text', 'Notices to Lambda shall be addressed to: Lambda, Inc., Attn: Legal Department, 2510 Zanker Rd. San Jose, CA 95131, with a copy to legal@lambdal.com.',
                 'note', 'First-party notice route designated by the agreement itself.')
             )
           ),
           jsonb_build_object(
             'title', 'Lambda Cloud API specification',
             'url', 'https://cloud.lambda.ai/api/v1/openapi.json',
             'retrieved_on', '2026-09-13',
             'clauses', jsonb_build_array(
               jsonb_build_object('axis', 'collection',
                 'text', 'Retrieves a list of the instance types currently offered on Lambda''s public cloud, as well as details about each type. Details include resource specifications, pricing, and regional availability.',
                 'note', 'GET /api/v1/instance-types; security bearerAuth or basicAuth; a live unauthenticated call returned HTTP 401 global/invalid-api-key. Access requires being a customer bound by the Cloud Terms.')
             )
           )
         )
       )
 where slug = 'lambda-instance-types';

-- The four classification values must be exactly as Phase 4A left them. This
-- migration records evidence; it does not move Lambda in either direction.
do $$
declare
  n integer;
begin
  select count(*) into n from reference.source_interfaces
   where slug = 'lambda-instance-types'
     and terms_review_state = 'under_review'
     and data_use_terms_state = 'not_permitted'
     and production_access_state = 'production_blocked'
     and written_agreement_required is true;
  if n <> 1 then raise exception 'Lambda classification changed, which this migration must not do'; end if;

  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception 'a source became production-approved, which this migration must never do'; end if;

  -- The carve-out and the scope clause are the reason this migration exists.
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where slug = 'lambda-instance-types' and c->>'text' like '%expressly permitted%Order%';
  if n = 0 then raise exception 'the express carve-out clause was not recorded'; end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where slug = 'lambda-instance-types' and c->>'axis' = 'scope' and c->>'text' like '%Authorized APIs%';
  if n = 0 then raise exception 'the scope clause was not recorded'; end if;
end
$$;
