-- The two terms axes are independent and both gate production, no reviewed
-- source is production-approved, and the seeded classifications are the ones
-- the review actually reached.
begin;

do $$
declare
  ok boolean;
  n integer;
  vast uuid := '55555555-0000-4000-8000-000000000001';
  runpod uuid := '55555555-0000-4000-8000-000000000003';
  lambda uuid := '55555555-0000-4000-8000-000000000002';
  azure uuid := '55555555-0000-4000-8000-000000000005';
begin
  -- Six providers and six interfaces were reviewed and recorded.
  -- The six providers of the terms review plus the licensed market-data source cleared later on its own terms.
  -- Model-API labs seeded for token-pricing research are a different population and are not this review.
  -- News publishers and their feeds are a later, separate review (Phase 1A news
  -- ingestion) and are excluded by the interface class that identifies them.
  select count(*) into n from reference.providers p
   where p.slug <> 'price-of-compute' and p.provider_kind <> 'model_api_provider'
     and exists (select 1 from reference.source_interfaces si
                  where si.provider_id = p.id and si.source_class <> 'news_feed');
  if n <> 6 then raise exception 'expected 6 reviewed providers, found %', n; end if;
  select count(*) into n from reference.source_interfaces si
    join reference.providers p on p.id = si.provider_id
    where si.slug <> 'price-of-compute-prices' and p.provider_kind <> 'model_api_provider'
      and si.source_class <> 'news_feed';
  if n <> 6 then raise exception 'expected 6 reviewed interfaces, found %', n; end if;

  -- Nothing is production-approved. Phase 4 collection is not yet authorised anywhere.
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_approved' and slug <> 'price-of-compute-prices'
     and source_class <> 'news_feed';
  if n <> 0 then raise exception '% reviewed interface(s) marked production_approved', n; end if;

  -- Every reviewed compute interface carries verbatim evidence with a review date.
  -- Token-pricing interfaces are research-usable and still under_review; they are not this review.
  select count(*) into n from reference.source_interfaces si
    join reference.providers p on p.id = si.provider_id
   where p.provider_kind <> 'model_api_provider' and si.source_class <> 'news_feed'
     and (si.terms_evidence is null or si.terms_evidence->>'reviewed_on' is null
      or jsonb_array_length(si.terms_evidence->'documents') = 0);
  if n <> 0 then raise exception '% interface(s) lack dated terms evidence', n; end if;

  -- The marketplace is blocked on both axes and needs a written agreement.
  if (select terms_review_state from reference.source_interfaces where id = vast) <> 'not_permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = vast) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = vast) <> 'production_blocked'
     or (select written_agreement_required from reference.source_interfaces where id = vast) is not true then
    raise exception 'the marketplace interface is not recorded as blocked on both axes';
  end if;

  -- Vast: classification unchanged by the terms investigation, evidence expanded.
  -- The licence grant with its exhaustive permitted uses is the decisive clause.
  if (select terms_review_state from reference.source_interfaces where id = vast) <> 'not_permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = vast) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = vast) <> 'production_blocked'
     or (select written_agreement_required from reference.source_interfaces where id = vast) is not true then
    raise exception 'Vast classification is not as the investigation left it';
  end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = vast and c->>'text' like '%any other commercial data product or market-information purpose%';
  if n = 0 then raise exception 'Vast evidence lost the licence grant and its exclusion'; end if;
  -- The enumeration problem is a methodology constraint, held apart from the axes.
  if (select terms_evidence->>'methodology_constraint' from reference.source_interfaces where id = vast) is null then
    raise exception 'Vast evidence does not record the enumeration constraint';
  end if;
  -- The written-agreement remedy is named so the outreach can ask for it directly.
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = vast and c->>'axis' = 'remedy';
  if n = 0 then raise exception 'Vast evidence does not record the agreement remedy'; end if;

  -- Runpod is prohibited on both axes absent written permission. The Terms define
  -- the Site to include runpod.io subdomains, so they reach api.runpod.io, and the
  -- systematic-retrieval clause describes exactly what Urdais would do.
  if (select terms_review_state from reference.source_interfaces where id = runpod) <> 'not_permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = runpod) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = runpod) <> 'production_blocked' then
    raise exception 'Runpod is not recorded as prohibited on both axes';
  end if;
  -- The Terms name written permission as the remedy, so the requirement is asserted.
  if (select written_agreement_required from reference.source_interfaces where id = runpod) is not true then
    raise exception 'Runpod does not record the written-permission requirement its Terms state';
  end if;
  -- The scope clause that decided this is retained verbatim.
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = runpod and c->>'axis' = 'scope' and c->>'text' like '%subdomains%';
  if n = 0 then raise exception 'Runpod evidence lost the scope clause that reaches the API subdomain'; end if;
  -- The superseded assessment is retained so the revision stays auditable.
  -- The answer, not just the question. A record that still reads as an open
  -- request after the provider has refused invites the wrong next move.
  if (select terms_evidence->'permission_outcome'->>'status' from reference.source_interfaces where id = runpod) <> 'denied' then
    raise exception 'Runpod permission outcome is not recorded as denied';
  end if;
  if (select terms_evidence->'permission_outcome'->>'verbatim' from reference.source_interfaces where id = runpod) not like '%approving the systematic retrieval of catalog, pricing and availability data for the purpose of building a compilation%' then
    raise exception 'the Runpod refusal was paraphrased out of the record';
  end if;
  select count(*) into n
    from reference.source_interfaces, lateral jsonb_array_elements(terms_evidence->'correspondence') c
   where id = runpod and c->>'outcome' = 'denied';
  if n <> 1 then raise exception 'the Runpod decision message is not recorded in correspondence'; end if;

  if (select terms_evidence->'prior_assessment'->>'terms_review_state' from reference.source_interfaces where id = runpod) <> 'under_review' then
    raise exception 'Runpod evidence does not retain its prior assessment';
  end if;
  if (select terms_evidence->>'revision' from reference.source_interfaces where id = runpod) is null then
    raise exception 'Runpod evidence does not explain why the classification changed';
  end if;
  -- Both primary sources are still retained, including the one that cuts the other way.
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d
   where id = runpod and d->>'title' ilike '%API%';
  if n = 0 then raise exception 'Runpod evidence retains no API documentation source'; end if;
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d
   where id = runpod and d->>'title' ilike '%Terms of Service%';
  if n = 0 then raise exception 'Runpod evidence lost its Terms of Service source'; end if;

  -- Lambda: classification unchanged by the terms investigation, evidence expanded.
  -- The act of retrieval is not independently prohibited, so collection stays
  -- under review while data use stays prohibited on the purpose-based clause.
  if (select terms_review_state from reference.source_interfaces where id = lambda) <> 'under_review'
     or (select data_use_terms_state from reference.source_interfaces where id = lambda) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = lambda) <> 'production_blocked'
     or (select written_agreement_required from reference.source_interfaces where id = lambda) is not true then
    raise exception 'Lambda classification is not as the investigation left it';
  end if;
  -- The carve-out is the whole basis of the outreach and must survive.
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = lambda and c->>'text' like '%expressly permitted%Order%';
  if n = 0 then raise exception 'Lambda evidence lost the express carve-out clause'; end if;
  -- Scope: the Authorized APIs are the Services, which is why the clause reaches the endpoint.
  select count(*) into n from reference.source_interfaces,
       lateral jsonb_array_elements(terms_evidence->'documents') d,
       lateral jsonb_array_elements(d->'clauses') c
   where id = lambda and c->>'axis' = 'scope' and c->>'text' like '%Authorized APIs%';
  if n = 0 then raise exception 'Lambda evidence lost the scope clause'; end if;
  -- The interpretive question is recorded as open rather than silently decided.
  if (select terms_evidence->>'open_question' from reference.source_interfaces where id = lambda) is null then
    raise exception 'Lambda evidence does not record the open benchmarking question';
  end if;

  -- The two axes genuinely differ somewhere: retrieval permitted, index use not settled.
  if (select terms_review_state from reference.source_interfaces where id = azure) <> 'permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = azure) <> 'under_review' then
    raise exception 'the two terms axes did not diverge where the evidence says they do';
  end if;
  select count(*) into n from reference.source_interfaces where terms_review_state <> data_use_terms_state;
  if n = 0 then raise exception 'the second axis carries no information distinct from the first'; end if;

  -- A source permitted to collect but not settled for index use cannot reach production.
  ok := false;
  begin
    update reference.source_interfaces set production_access_state = 'production_approved' where id = azure;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'production approval was granted with an unsettled data-use axis'; end if;

  -- Nor can one that is permitted to collect but forbidden to use.
  ok := false;
  begin
    update reference.source_interfaces
       set data_use_terms_state = 'not_permitted', production_access_state = 'production_approved'
     where id = azure;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'production approval was granted against a prohibiting data-use clause'; end if;

  -- A prohibition on either axis forces production_blocked.
  ok := false;
  begin
    update reference.source_interfaces set data_use_terms_state = 'not_permitted' where id = azure;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a data-use prohibition did not force production_blocked'; end if;

  -- Both axes permitted does allow approval, so the gate is not vacuous.
  update reference.source_interfaces
     set terms_review_state = 'permitted', data_use_terms_state = 'permitted',
         production_access_state = 'production_approved'
   where id = azure;
  if (select production_access_state from reference.source_interfaces where id = azure) <> 'production_approved' then
    raise exception 'approval with both axes permitted was rejected';
  end if;

  -- An invented state is rejected.
  ok := false;
  begin
    update reference.source_interfaces set data_use_terms_state = 'probably_fine' where id = vast;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'invented data-use state was accepted'; end if;

  -- Three settled prohibitions are blocked: the marketplace and Runpod on both axes,
  -- Lambda on data use. An unresolved source is review-pending, never blocked.
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_blocked';
  if n <> 3 then raise exception 'expected 3 blocked interfaces (settled prohibitions only), found %', n; end if;
  select count(*) into n from reference.source_interfaces
   where terms_review_state = 'under_review' or data_use_terms_state = 'under_review';
  if n < 3 then raise exception 'expected at least 3 interfaces with an unresolved axis, found %', n; end if;
  -- Every blocked source names written permission as the remedy.
  select count(*) into n from reference.source_interfaces
   where production_access_state = 'production_blocked' and written_agreement_required is not true;
  if n <> 0 then raise exception '% blocked interface(s) do not record a written-permission requirement', n; end if;

  -- Registry rows are not market participants: no entity, role or observation was created.
  -- The reviewed providers' own registry rows are not market participants. The sellers that exist were seeded by
  -- launch enablement (Runpod, Lambda) and by the licensed dataset's participant mapping; no operator role exists anywhere.
  select count(*) into n from reference.market_entities where slug in ('runpod', 'lambda') and legal_name is not null;
  if n <> 2 then raise exception 'expected the two seeded seller legal entities, found %', n; end if;
  select count(*) into n from reference.entity_roles where role = 'operator';
  if n <> 0 then raise exception 'reviewing terms created % operator role(s)', n; end if;
  select count(*) into n from reference.entity_roles r join reference.market_entities e on e.id = r.entity_id where r.role = 'marketplace' and e.slug <> 'vast';
  if n <> 0 then raise exception 'a marketplace role exists for a non-marketplace entity'; end if;
  select count(*) into n from pipeline.source_retrievals;
  if n <> 0 then raise exception 'reviewing terms created % retrieval(s); no collector exists', n; end if;
  select count(*) into n from pipeline.raw_offers;
  if n <> 0 then raise exception 'reviewing terms created % raw offer(s); no collector exists', n; end if;

  raise notice 'source terms review: ok';
end $$;

rollback;
