-- Runpod answered the permission request, and the answer is no.
--
-- On 13 September 2026 Urdais asked Runpod, in writing, for the two permissions
-- its Terms of Service reserve: written permission to systematically retrieve
-- catalog, pricing and availability data for the purpose of compiling a
-- database, and approval to use that data in a commercial endeavour. The
-- request named both clauses, described the intended use in full, and stated
-- that no retrieval would begin unless and until Runpod said it was permitted.
--
-- On 14 September 2026 Runpod Support replied and refused both, in terms that
-- track the request exactly:
--
--   "After reviewing your request, we're unable to grant the permissions you've
--    requested. We aren't approving the systematic retrieval of catalog, pricing
--    and availability data for the purpose of building a compilation, nor the
--    use of that data as an input to a commercial market-data product."
--
-- The registry states do not move, because they were already correct: both axes
-- not_permitted, production_blocked, written permission required. What changes is
-- the basis, and the basis matters. Until today the obstacle was that permission
-- had not been obtained, with a remedy the Terms themselves named. That reading
-- made Runpod the most actionable outreach target in the set. It is now a
-- provider-level refusal of Urdais's actual intended use, and the remedy is spent.
-- A record that left this as "pending" would invite exactly the wrong next move.
--
-- Nothing here is a workaround, and nothing here builds toward one. Changing the
-- retrieval method, reading a different Runpod endpoint, using cached copies,
-- obtaining the same values through a third party, or narrowing the request
-- without a material change in intended use would each defeat a decision Runpod
-- made about the use, not about the mechanism.
--
-- The prior evidence is preserved in full. This migration only adds: the
-- correspondence record, the outcome, and the scope of what was refused.

update reference.source_interfaces
   set notes = 'Exposes minimum pod GPU count and a four-level per-datacenter availability signal conditional on requested GPU count and country, which is the strongest Grade 3 availability shape found anywhere, and none of it is available to Urdais. The Terms of Service define the Site as the Runpod.io website and its subdomains, so they reach api.runpod.io, and they prohibit systematically retrieving data from the Site to compile a database without written permission, restrict commercial use absent specific approval, and limit use to the purposes for which the Site is made available. Urdais requested both permissions in writing on 13 September 2026 and Runpod refused both on 14 September 2026, declining to approve systematic retrieval of catalog, pricing and availability data for the purpose of building a compilation, and declining to approve use of that data as an input to a commercial market-data product. This is a decision about the intended use, not about the retrieval mechanism, so no alternative endpoint, method, cache or intermediary cures it. Runpod is closed as a direct production source under the current methodology. Reopening it requires a materially different intended use and a fresh written approval from Runpod.',
       terms_evidence = terms_evidence || jsonb_build_object(
         'permission_outcome', jsonb_build_object(
           'status', 'denied',
           'decided_on', '2026-09-14',
           'requested_on', '2026-09-13',
           'decided_by', 'Runpod Support Team (help@runpod.io), on referral to the relevant internal teams',
           'scope_refused', jsonb_build_array(
             'systematic retrieval of catalog, pricing and availability data for the purpose of building a compilation',
             'use of that data as an input to a commercial market-data product'
           ),
           'verbatim', 'After reviewing your request, we''re unable to grant the permissions you''ve requested. We aren''t approving the systematic retrieval of catalog, pricing and availability data for the purpose of building a compilation, nor the use of that data as an input to a commercial market-data product.',
           'basis', 'Provider-level refusal of the intended use. Not a rate limit, not a mechanism objection, and not conditional on a different endpoint or method.',
           'reopening_requires', 'A materially different intended use and a fresh written approval from Runpod. Re-asking the same question in narrower language is not a material change.',
           'artifact', 'docs/architecture/sources/runpod-permission-denied.md'
         ),
         'correspondence', jsonb_build_array(
           jsonb_build_object(
             'direction', 'outbound', 'sent_at', '2026-09-13T15:05:02Z',
             'channel', 'email', 'from', 'bryceson.jones17@gmail.com',
             'to', 'help@runpod.io', 'cc', 'legal@runpod.io',
             'subject', 'Request for written permission — automated catalog retrieval and derived index use (Urdais)',
             'thread_id', '1a09b4ce294d8be3', 'message_id', '1a09b4ce294d8be3',
             'summary', 'Requested written permission for periodic authenticated retrieval of GET /v2/catalog/gpus and approval to use the data as an input to published commercial indices. Stated that no retrieval would begin unless permitted, and that a refusal would be a complete answer.'
           ),
           jsonb_build_object(
             'direction', 'inbound', 'received_at', '2026-09-14T11:26:16Z',
             'channel', 'email', 'from', 'help@runpod.io', 'to', 'bryceson.jones17@gmail.com',
             'thread_id', '1a09b4ce294d8be3', 'message_id', '1a09faafb3fa5faf',
             'kind', 'acknowledgement',
             'summary', 'Acknowledged the request, noted it had been shared with the relevant internal teams for review, and asked for time. No decision.'
           ),
           jsonb_build_object(
             'direction', 'inbound', 'received_at', '2026-09-14T13:27:41Z',
             'channel', 'email', 'from', 'help@runpod.io', 'to', 'bryceson.jones17@gmail.com', 'cc', 'legal@runpod.io',
             'thread_id', '1a09b4ce294d8be3', 'message_id', '1a0a01a2456e600d',
             'provider_reference', 'MM1GD7-PVV4K',
             'kind', 'decision',
             'outcome', 'denied',
             'summary', 'Refused both permissions. The full message is preserved verbatim in docs/architecture/sources/runpod-permission-denied.md.'
           )
         )
       )
 where slug = 'runpod-gpu-types';

do $$
declare
  runpod uuid := '55555555-0000-4000-8000-000000000003';
  n integer;
begin
  -- The denial must not have loosened anything.
  if (select terms_review_state from reference.source_interfaces where id = runpod) <> 'not_permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = runpod) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = runpod) <> 'production_blocked'
     or (select written_agreement_required from reference.source_interfaces where id = runpod) is not true then
    raise exception 'Runpod must remain prohibited on both axes and production_blocked after the denial';
  end if;

  -- A denial is not a grant, and must never be recorded as one: a grant row is
  -- what the retrieval trigger consults.
  select count(*) into n from reference.permission_grants where source_interface_id = runpod;
  if n <> 0 then raise exception 'a permission grant exists for Runpod, which was refused permission'; end if;

  -- The outcome is recorded and is a refusal.
  if (select terms_evidence->'permission_outcome'->>'status' from reference.source_interfaces where id = runpod) <> 'denied' then
    raise exception 'the Runpod permission outcome is not recorded as denied'; end if;

  -- The earlier evidence survives. These are the same facts test 110 checks; a
  -- later record of the answer must never cost us the record of the question.
  select count(*) into n
    from reference.source_interfaces, lateral jsonb_array_elements(terms_evidence->'documents') d,
         lateral jsonb_array_elements(d->'clauses') c
   where id = runpod and c->>'axis' = 'scope' and c->>'text' like '%subdomains%';
  if n = 0 then raise exception 'the denial record overwrote the scope clause evidence'; end if;
  if (select terms_evidence->'prior_assessment'->>'terms_review_state' from reference.source_interfaces where id = runpod) <> 'under_review' then
    raise exception 'the denial record overwrote the Phase 4A prior assessment'; end if;

  -- Nothing was ever collected from Runpod, and nothing may be.
  select count(*) into n from pipeline.source_retrievals where source_interface_id = runpod;
  if n <> 0 then raise exception 'a retrieval exists against Runpod, which is production_blocked and now refused'; end if;
end
$$;
