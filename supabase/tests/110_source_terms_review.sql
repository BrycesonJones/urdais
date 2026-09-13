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
  azure uuid := '55555555-0000-4000-8000-000000000005';
begin
  -- Six providers and six interfaces were reviewed and recorded.
  select count(*) into n from reference.providers;
  if n <> 6 then raise exception 'expected 6 reviewed providers, found %', n; end if;
  select count(*) into n from reference.source_interfaces;
  if n <> 6 then raise exception 'expected 6 reviewed interfaces, found %', n; end if;

  -- Nothing is production-approved. Phase 4 collection is not yet authorised anywhere.
  select count(*) into n from reference.source_interfaces where production_access_state = 'production_approved';
  if n <> 0 then raise exception '% interface(s) marked production_approved', n; end if;

  -- Every reviewed interface carries verbatim evidence with a review date.
  select count(*) into n from reference.source_interfaces
   where terms_evidence is null or terms_evidence->>'reviewed_on' is null
      or jsonb_array_length(terms_evidence->'documents') = 0;
  if n <> 0 then raise exception '% interface(s) lack dated terms evidence', n; end if;

  -- The marketplace is blocked on both axes and needs a written agreement.
  if (select terms_review_state from reference.source_interfaces where id = vast) <> 'not_permitted'
     or (select data_use_terms_state from reference.source_interfaces where id = vast) <> 'not_permitted'
     or (select production_access_state from reference.source_interfaces where id = vast) <> 'production_blocked'
     or (select written_agreement_required from reference.source_interfaces where id = vast) is not true then
    raise exception 'the marketplace interface is not recorded as blocked on both axes';
  end if;

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
  select count(*) into n from reference.market_entities;
  if n <> 0 then raise exception 'reviewing terms created % market entit(ies)', n; end if;
  select count(*) into n from reference.entity_roles;
  if n <> 0 then raise exception 'reviewing terms created % entity role(s)', n; end if;
  select count(*) into n from pipeline.source_retrievals;
  if n <> 0 then raise exception 'reviewing terms created % retrieval(s); no collector exists', n; end if;
  select count(*) into n from pipeline.raw_offers;
  if n <> 0 then raise exception 'reviewing terms created % raw offer(s); no collector exists', n; end if;

  raise notice 'source terms review: ok';
end $$;

rollback;
