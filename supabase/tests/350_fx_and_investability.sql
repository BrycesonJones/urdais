-- FX, representative-security selection, and investability.
--
-- Three failure modes this file is built around, each of which produces something that looks
-- correct:
--
--   an FX rate inverted twice is still a plausible exchange rate;
--   a representative security chosen because Urdais had data for it is still a valid security;
--   a screen that "failed" because nobody measured it is still a boolean.
--
-- None of the three is caught by reading a row. They are caught by refusing to store them.
begin;

-- ------------------------------------------------------------- what the seed recorded

do $$
declare n integer; r numeric;
begin
  -- Every ECB-derived rate reproduces from its components. The trigger enforces this on insert;
  -- asserting it again here is cheap and catches a future migration that writes rates directly.
  select count(*) into n from pipeline.fx_observations d
    join pipeline.fx_observations b on b.id = d.component_base_id
    join pipeline.fx_observations q on q.id = d.component_quote_id
   where d.derivation = 'cross'
     and abs(d.rate - (b.rate / q.rate)) > (b.rate / q.rate) * 1e-9;
  if n <> 0 then raise exception '% cross rate(s) do not reproduce from their components', n; end if;

  -- Orientation is USD per unit of the quoted currency, for every row without exception.
  select count(*) into n from pipeline.fx_observations where orientation <> 'base_per_quote';
  if n <> 0 then raise exception '% FX row(s) carry a non-canonical orientation', n; end if;
  -- A non-USD base means a published source leg, never a UGAI rate: the ECB legs are
  -- currency-per-EUR and exist to be divided, and CBC's is TWD-per-USD and exists to be
  -- inverted. Asserted as a property rather than a count, so adding a source does not require
  -- editing a number that says nothing about correctness.
  select count(*) into n from pipeline.fx_observations
   where base_currency <> 'USD' and derivation <> 'direct';
  if n <> 0 then raise exception '% non-USD row(s) are derived rather than published legs', n; end if;
  select count(*) into n from pipeline.fx_observations
   where base_currency <> 'USD' and (source_interface_id is null or permission_grant_id is null);
  if n <> 0 then raise exception '% source leg(s) name no source', n; end if;

  -- USD per HKD, spot-checked against the published legs: 1.1481 / 9.0071.
  select rate into r from pipeline.fx_observations
   where base_currency = 'USD' and quote_currency = 'HKD' and fixing_date = date '2026-09-17';
  if r is null or abs(r - 1.1481 / 9.0071) > 1e-12 then
    raise exception 'the USD/HKD cross does not match its ECB legs';
  end if;

  -- TWD resolves, through CBC dataset 7232 inverted into UGAI's orientation. The Phase 5.5 gap
  -- was the absence of any reviewed source; it is closed, and what is asserted now is that the
  -- rate that exists is properly sourced and properly derived rather than merely present.
  select count(*) into n from pipeline.fx_observations d
    join pipeline.fx_observations src on src.id = d.component_quote_id
   where d.base_currency = 'USD' and d.quote_currency = 'TWD' and d.derivation = 'inverted'
     and src.base_currency = 'TWD' and src.quote_currency = 'USD'
     and abs(d.rate - 1 / src.rate) <= (1 / src.rate) * 1e-9;
  if n <> 1 then raise exception 'the USD/TWD rate is not a checked inversion of a published TWD/USD leg'; end if;

  -- Not one investability parameter is approved.
  select count(*) into n from reference.methodology_parameters
   where parameter_key like 'min_%' and status = 'approved';
  if n <> 0 then raise exception '% investability minimum(s) were approved', n; end if;
  select count(*) into n from reference.methodology_parameters where parameter_key = 'fx_fixing_convention';
  if n <> 1 then raise exception 'the FX fixing convention is not recorded as a parameter'; end if;

  -- Every selection is constrained, and every constraint says why.
  select count(*) into n from pipeline.representative_security_selections
   where availability_state = 'constrained' and availability_reason is null;
  if n <> 0 then raise exception '% constrained selection(s) give no reason', n; end if;
  select count(*) into n from pipeline.representative_security_selections
   where availability_state = 'available';
  if n <> 0 then raise exception '% selection(s) claim availability that does not exist', n; end if;

  -- One issuer, one live selection. This is the invariant the whole membership model rests on.
  select count(*) into n from (
    select issuer_id, effective_date from pipeline.representative_security_selections
     where superseded_by_id is null group by 1, 2 having count(*) > 1) x;
  if n <> 0 then raise exception '% issuer(s) hold two live representative securities', n; end if;

  -- No evaluation is a production determination, and none concluded anything but unavailable.
  select count(*) into n from pipeline.investability_evaluations where evaluation_purpose = 'production';
  if n <> 0 then raise exception '% production investability determination(s) exist', n; end if;
  select count(*) into n from pipeline.investability_evaluations where overall_result <> 'unavailable';
  if n <> 0 then raise exception '% evaluation(s) concluded something other than unavailable', n; end if;

  -- The distinction that matters: nothing is recorded as failed. Every blocked screen is either
  -- unmeasurable or waiting on a parameter, and calling any of them a failure would assert a
  -- measurement nobody made.
  select count(*) into n from pipeline.investability_criteria where result = 'failed';
  if n <> 0 then raise exception '% criterion(s) were marked failed on unmeasured inputs', n; end if;

  -- And thematic eligibility is untouched by any of it.
  select count(*) into n from pipeline.eligibility_reviews
   where status = 'eligible' and superseded_by_id is null;
  if n <> 2 then raise exception 'the eligible set changed during investability assessment: %', n; end if;

  raise notice 'fx and investability seed: 6 rates, no TWD, 3 constrained selections, 0 failures';
end $$;

-- ------------------------------------------------------------------------ FX gates

do $$
declare
  ok boolean; n integer;
  iface uuid; grt uuid; attribution text; leg_usd uuid; leg_jpy uuid; inv uuid;
begin
  select id into iface from reference.source_interfaces where slug = 'ecb-euro-reference-rates';
  select id, attribution_text into grt, attribution from reference.permission_grants
   where id = 'b2b2b2b2-0000-4000-8000-000000000021';
  select id into leg_usd from pipeline.fx_observations
   where base_currency = 'USD' and quote_currency = 'EUR' and fixing_date = date '2026-09-17';
  select id into leg_jpy from pipeline.fx_observations
   where base_currency = 'JPY' and quote_currency = 'EUR' and fixing_date = date '2026-09-17';

  -- Zero, negative, NaN and infinity are not exchange rates. NaN and infinity both pass a bare
  -- `> 0` in Postgres, which is why they are named explicitly in the constraint.
  foreach n in array array[0, -1] loop
    ok := false;
    begin
      insert into pipeline.fx_observations
        (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
         source_interface_id, permission_grant_id, attribution, idempotency_key)
        values ('USD', 'CHF', n, date '2026-09-17', now(), 'direct', iface, grt, attribution, 'x:bad' || n);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'an FX rate of % was accepted', n; end if;
  end loop;

  foreach attribution in array array['NaN', 'Infinity'] loop
    ok := false;
    begin
      insert into pipeline.fx_observations
        (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
         source_interface_id, permission_grant_id, attribution, idempotency_key)
        values ('USD', 'CHF', attribution::numeric, date '2026-09-17', now(), 'direct',
                iface, grt, 'x', 'x:' || attribution);
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'an FX rate of % was accepted', attribution; end if;
  end loop;
  select attribution_text into attribution from reference.permission_grants where id = grt;

  -- A cross whose stated rate does not reproduce from its legs is refused. This is the guard
  -- against an inversion applied in the wrong direction, which yields a plausible number.
  ok := false;
  begin
    insert into pipeline.fx_observations
      (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
       cross_via_currency, component_base_id, component_quote_id,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values ('USD', 'JPY', 178.75 / 1.1481, date '2026-09-17', now(), 'cross', 'EUR',
              leg_usd, leg_jpy, iface, grt, attribution, 'x:backwards');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a cross rate computed in the wrong direction was accepted'; end if;

  -- A cross assembled from legs of a different fixing date is refused.
  insert into pipeline.fx_observations
    (id, base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
     source_interface_id, permission_grant_id, attribution, idempotency_key)
    values (gen_random_uuid(), 'JPY', 'EUR', 179.10, date '2026-09-16', now(), 'direct',
            iface, grt, attribution, 'x:jpy-prior')
    returning id into inv;
  ok := false;
  begin
    insert into pipeline.fx_observations
      (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
       cross_via_currency, component_base_id, component_quote_id,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values ('USD', 'JPY', 1.1481 / 179.10, date '2026-09-17', now(), 'cross', 'EUR',
              leg_usd, inv, iface, grt, attribution, 'x:mixeddates');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a cross rate was assembled from legs of different dates'; end if;

  -- An inversion must actually invert the pair it names, and must reproduce.
  insert into pipeline.fx_observations
    (id, base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
     source_interface_id, permission_grant_id, attribution, idempotency_key)
    values (gen_random_uuid(), 'TWD', 'USD', 30.5, date '2026-09-10', now(), 'direct',
            iface, grt, attribution, 'x:twd-direct')
    returning id into inv;
  ok := false;
  begin
    insert into pipeline.fx_observations
      (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
       component_quote_id, source_interface_id, permission_grant_id, attribution, idempotency_key)
      values ('USD', 'TWD', 30.5, date '2026-09-10', now(), 'inverted', inv, iface, grt,
              attribution, 'x:notinverted');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an inverted rate was stored without inverting'; end if;

  -- Correctly inverted, it is accepted -- so the gate is arithmetic, not prohibition.
  insert into pipeline.fx_observations
    (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
     component_quote_id, source_interface_id, permission_grant_id, attribution, idempotency_key)
    values ('USD', 'TWD', 1 / 30.5, date '2026-09-10', now(), 'inverted', inv, iface, grt,
            attribution, 'x:inverted-ok');

  -- A carried rate names the day it came from, and that day precedes it. Methodology permits the
  -- carry and requires the flag; an unflagged carry would be indistinguishable from a fixing.
  ok := false;
  begin
    insert into pipeline.fx_observations
      (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation, rate_status,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values ('USD', 'SEK', 0.1, date '2026-09-18', now(), 'direct', 'carried',
              iface, grt, attribution, 'x:carried-nodate');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a carried rate did not name the day it was carried from'; end if;

  ok := false;
  begin
    insert into pipeline.fx_observations
      (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation, rate_status,
       carried_from_date, source_interface_id, permission_grant_id, attribution, idempotency_key)
      values ('USD', 'SEK', 0.1, date '2026-09-18', now(), 'direct', 'carried',
              date '2026-09-19', iface, grt, attribution, 'x:carried-forward');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a rate was carried from the future'; end if;

  -- Two live rates for one currency and day is what supersession prevents.
  ok := false;
  begin
    insert into pipeline.fx_observations
      (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values ('USD', 'EUR', 1.15, date '2026-09-17', now(), 'direct', iface, grt, attribution, 'x:dupe');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'two live rates exist for one currency and fixing date'; end if;

  -- A revised fixing supersedes; the original stays readable.
  declare revised uuid;
  begin
    revised := gen_random_uuid();
    update pipeline.fx_observations
       set superseded_by_id = revised, superseded_at = now(),
           supersession_reason = 'the ECB revised the fixing'
     where id = leg_usd;
    insert into pipeline.fx_observations
      (id, base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
       source_interface_id, permission_grant_id, attribution, idempotency_key)
      values (revised, 'USD', 'EUR', 1.1490, date '2026-09-17', now(), 'direct',
              iface, grt, attribution, 'x:revised');
    select count(*) into n from pipeline.fx_observations
     where id = leg_usd and rate = 1.1481 and superseded_by_id = revised;
    if n <> 1 then raise exception 'the original fixing did not survive its revision'; end if;
  end;

  raise notice 'fx gates: derivation re-checked, orientation fixed, carries flagged';
end $$;

-- ------------------------------------------------ selection and investability gates

do $$
declare
  ok boolean; n integer;
  iss uuid; sec_id uuid; lst uuid; mv uuid; sel uuid; ev uuid;
begin
  select i.id, s.id, l.id into iss, sec_id, lst
    from reference.issuers i
    join reference.securities s on s.issuer_id = i.id
    join reference.listings l on l.security_id = s.id
   where i.issuer_key = 'tsmc' limit 1;
  select mvv.id into mv from reference.methodology_versions mvv
    join reference.methodologies m on m.id = mvv.methodology_id
   where m.slug = 'ai-equity-universe' and mvv.version = '0.4.0-draft';

  -- A selection must name what it selected, and a non-selection must explain itself.
  ok := false;
  begin
    insert into pipeline.representative_security_selections
      (issuer_id, methodology_version_id, effective_date, selection_state, selection_rule)
      values (iss, mv, date '2026-06-01', 'selected', 'greatest_traded_value');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a selection was stored naming no security'; end if;

  ok := false;
  begin
    insert into pipeline.representative_security_selections
      (issuer_id, methodology_version_id, effective_date, selection_state)
      values (iss, mv, date '2026-06-02', 'undeterminable');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an undeterminable selection gave no reason'; end if;

  -- A selected line that cannot be operated is representable, and the selection stands. There is
  -- no state in this schema that means "we chose the line we had data for".
  insert into pipeline.representative_security_selections
    (id, issuer_id, methodology_version_id, effective_date, selection_state,
     selected_security_id, selected_listing_id, selection_rule,
     availability_state, availability_reason)
    values (gen_random_uuid(), iss, mv, date '2026-06-03', 'selected', sec_id, lst,
            'greatest_traded_value', 'constrained', 'no permitted price source for the venue')
    returning id into sel;
  select count(*) into n from pipeline.representative_security_selections
   where id = sel and selection_state = 'selected' and availability_state = 'constrained';
  if n <> 1 then raise exception 'selected-but-unavailable is not representable'; end if;

  -- A constrained selection must say what constrains it.
  ok := false;
  begin
    insert into pipeline.representative_security_selections
      (issuer_id, methodology_version_id, effective_date, selection_state,
       selected_security_id, selected_listing_id, selection_rule, availability_state)
      values (iss, mv, date '2026-06-04', 'selected', sec_id, lst, 'greatest_traded_value', 'constrained');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a constrained selection gave no reason'; end if;

  -- A candidate whose turnover was never measured cannot carry a value, and one that was
  -- measured must carry both a value and the window it was measured over.
  ok := false;
  begin
    insert into pipeline.representative_security_candidates
      (selection_id, security_id, listing_id, security_screen_state, traded_value_state, adtv_usd)
      values (sel, sec_id, lst, 'eligible', 'unavailable', 5000000);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unmeasured candidate carried a traded value'; end if;

  ok := false;
  begin
    insert into pipeline.representative_security_candidates
      (selection_id, security_id, listing_id, security_screen_state, traded_value_state, adtv_usd)
      values (sel, sec_id, lst, 'eligible', 'measured', 5000000);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a measured candidate named no measurement window'; end if;

  -- Selections are append-only; a change supersedes.
  ok := false;
  begin
    update pipeline.representative_security_selections
       set selected_listing_id = lst where id = sel;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a representative-security selection was edited in place'; end if;

  -- --------------------------------------------------------------- investability

  -- A production determination may not rest on research candidates.
  ok := false;
  begin
    insert into pipeline.investability_evaluations
      (issuer_id, methodology_version_id, effective_date, parameter_basis,
       evaluation_purpose, overall_result)
      values (iss, mv, date '2026-06-05', 'research_candidate', 'production', 'investable');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a production determination used research-candidate parameters'; end if;

  -- Nor conclude anything while a parameter is unresolved.
  ok := false;
  begin
    insert into pipeline.investability_evaluations
      (issuer_id, methodology_version_id, effective_date, parameter_basis,
       evaluation_purpose, overall_result)
      values (iss, mv, date '2026-06-06', 'approved', 'production', 'parameter_unresolved');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a production determination rested on an unresolved parameter'; end if;

  -- Development evaluation against research candidates is permitted, and declares itself.
  insert into pipeline.investability_evaluations
    (id, issuer_id, methodology_version_id, effective_date, parameter_basis,
     evaluation_purpose, overall_result)
    values (gen_random_uuid(), iss, mv, date '2026-06-07', 'research_candidate', 'research', 'unavailable')
    returning id into ev;

  -- A criterion cannot pass against a threshold that does not exist. This is the assertion that
  -- stops an unresolved minimum being quietly treated as satisfied.
  ok := false;
  begin
    insert into pipeline.investability_criteria
      (evaluation_id, criterion, result, observed_value, basis)
      values (ev, 'traded_value', 'passed', 5000000, 'plenty of turnover');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a criterion passed with no threshold to pass'; end if;

  -- Nor fail without one.
  ok := false;
  begin
    insert into pipeline.investability_criteria
      (evaluation_id, criterion, result, observed_value, basis)
      values (ev, 'free_float_percentage', 'failed', 0.1, 'looks low');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a criterion failed with no threshold to fail'; end if;

  -- An unresolved parameter names the parameter it waited for.
  ok := false;
  begin
    insert into pipeline.investability_criteria
      (evaluation_id, criterion, result, basis)
      values (ev, 'trading_frequency', 'parameter_unresolved', 'no threshold');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unresolved criterion named no parameter'; end if;

  -- And an unavailable criterion carries no observation, so a missing input cannot be recorded
  -- as a measurement that happened to be inconvenient.
  ok := false;
  begin
    insert into pipeline.investability_criteria
      (evaluation_id, criterion, result, observed_value, basis)
      values (ev, 'data_completeness', 'unavailable', 0, 'nothing collected');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an unavailable criterion carried an observation'; end if;

  -- Criteria are immutable once written.
  insert into pipeline.investability_criteria
    (evaluation_id, criterion, result, basis)
    values (ev, 'price_availability', 'unavailable', 'no permitted source');
  ok := false;
  begin
    update pipeline.investability_criteria set result = 'passed' where evaluation_id = ev;
  exception when restrict_violation then ok := true;
  end;
  if not ok then raise exception 'a criterion result was edited in place'; end if;

  raise notice 'selection and investability gates: ok';
end $$;

-- --------------------------------------------------------------- nothing was weighted

do $$
declare n integer;
begin
  -- Scoped to Phase 5.5's own tables. Phase 5.6 owns snapshot weights and 5.7 owns index shares
  -- and the divisor; a global assertion would have forbidden the phases these inputs exist for.
  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline'
     and table_name in ('fx_observations', 'representative_security_selections',
                        'representative_security_candidates', 'investability_evaluations',
                        'investability_criteria')
     and column_name in ('index_weight', 'base_weight', 'index_shares', 'divisor',
                         'accessible_float_market_cap', 'constituent_weight');
  if n <> 0 then raise exception 'a weighting column exists on a phase 5.5 table'; end if;

  -- Phase 5.6 owns universe snapshots and 5.7 owns the calculation engine, so neither is
  -- forbidden outright any more. What remains absent is the published output itself: Phase 5.8
  -- owns the public series, and until it exists no UGAI observation has been published.
  select count(*) into n from information_schema.tables
   where table_schema = 'pipeline' and table_name in ('ugai_publications', 'ugai_observations');
  if n <> 0 then raise exception 'a UGAI publication table exists before phase 5.8'; end if;

  select count(*) into n from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug in ('ugai', 'ai-equity-universe') and mv.status <> 'draft';
  if n <> 0 then raise exception 'a UGAI methodology version left draft'; end if;

  raise notice 'phase 5.5 tables carry no weighting state, and nothing is published: ok';
end $$;


-- ---------------------------------------------------------- the CBC TWD source and grant
--
-- Added by the follow-up that closed the Phase 5.5 TWD gap. Asserted here rather than in a new
-- file because these are facts about the FX model this suite already owns.

do $$
declare n integer; iface uuid; g record;
begin
  select id into iface from reference.source_interfaces where slug = 'cbc-exchange-rates';
  if iface is null then raise exception 'the CBC interface is missing'; end if;

  -- The dataset is identified, not merely described in prose.
  select count(*) into n from reference.source_interfaces
   where id = iface
     and terms_evidence ->> 'dataset' = '7232'
     and terms_evidence ->> 'dataset_identifier' = 'A59000000N-000045'
     and terms_evidence ->> 'published_orientation' = 'TWD per 1 USD'
     and terms_evidence ->> 'agency' = 'Central Bank of the Republic of China (Taiwan)';
  if n <> 1 then raise exception 'the CBC dataset provenance is not recorded structurally'; end if;

  -- The grant that was missing since UBWI now exists, belongs to this interface, and carries the
  -- rights the Open Government Data License actually gives.
  select g2.* into g from reference.permission_grants g2 where g2.source_interface_id = iface;
  if g is null then raise exception 'the CBC interface still has no permission grant'; end if;
  if not (g.covers_collection and g.covers_storage and g.covers_index_calculation
          and g.covers_historical_retention and g.covers_post_termination_retention
          and g.covers_historical_reconstruction and g.covers_index_level_publication) then
    raise exception 'the CBC grant does not carry the rights the licence gives';
  end if;
  if not g.attribution_required or btrim(coalesce(g.attribution_text, '')) = '' then
    raise exception 'the CBC grant does not require attribution';
  end if;
  if g.attribution_text not like '%7232%' or g.attribution_text not like '%Open Government Data License%' then
    raise exception 'the CBC attribution does not identify the dataset and licence';
  end if;
  if g.decisive_clause is null or g.reviewed_on is null then
    raise exception 'the CBC grant cites no clause';
  end if;

  -- The source rate is stored in the orientation CBC publishes, and the UGAI rate is derived
  -- from it rather than relabelled.
  select count(*) into n from pipeline.fx_observations
   where base_currency = 'TWD' and quote_currency = 'USD' and derivation = 'direct'
     and rate = 31.881 and fixing_date = date '2026-09-17'
     and source_interface_id = iface;
  if n <> 1 then raise exception 'the published TWD/USD leg is not stored as published'; end if;

  -- The source rate carries its provenance, including that live retrieval was not re-verified.
  select count(*) into n from pipeline.fx_observations
   where idempotency_key = 'cbc:TWD:USD:2026-09-17:research'
     and source_payload ->> 'provenance' is not null;
  if n <> 1 then raise exception 'the CBC observation does not record how it was obtained'; end if;

  -- Nothing production-purpose came from a research_usable interface.
  select count(*) into n from pipeline.fx_observations
   where source_interface_id = iface and observation_purpose = 'production';
  if n <> 0 then raise exception '% production FX observation(s) rest on the CBC source', n; end if;

  -- And the fixing convention is still unresolved. Closing a source gap must not have approved a
  -- timing rule, which is the specific confusion this whole follow-up was scoped to avoid.
  select count(*) into n from reference.methodology_parameters
   where parameter_key = 'fx_fixing_convention' and status = 'approved';
  if n <> 0 then raise exception 'the FX fixing convention was approved by a source change'; end if;

  -- TSMC's FX criterion moved from unavailable to parameter_unresolved, and no further.
  select count(*) into n from pipeline.investability_criteria c
    join pipeline.investability_evaluations e on e.id = c.evaluation_id
    join reference.issuers i on i.id = e.issuer_id
   where i.issuer_key = 'tsmc' and e.superseded_by_id is null
     and c.criterion = 'fx_availability' and c.result = 'parameter_unresolved'
     and c.parameter_key = 'fx_fixing_convention';
  if n <> 1 then raise exception 'the TSMC FX criterion did not move to parameter_unresolved'; end if;

  select count(*) into n from pipeline.investability_evaluations e
    join reference.issuers i on i.id = e.issuer_id
   where i.issuer_key = 'tsmc' and e.superseded_by_id is null and e.overall_result <> 'unavailable';
  if n <> 0 then raise exception 'TSMC was moved out of unavailable by a source change'; end if;

  -- The superseded evaluation survives with its original finding.
  select count(*) into n from pipeline.investability_criteria c
   where c.evaluation_id = '1b000000-0000-4000-8000-000000000003'
     and c.criterion = 'fx_availability' and c.result = 'unavailable';
  if n <> 1 then raise exception 'the prior TSMC FX finding was rewritten rather than superseded'; end if;

  raise notice 'CBC TWD source: granted, inverted, timing still unresolved';
end $$;

rollback;
