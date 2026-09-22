-- TH-3: the analytics layer, and the rules that keep a published number honest.
--
-- Most of these try to write something the methodology forbids and assert that the database
-- refuses it, rather than trusting the engine to have been careful.
begin;

do $$
declare
  n integer; mv uuid; cv uuid; run uuid; ny uuid; er uuid; ent uuid;
begin
  -- ------------------------------------------------------------------ methodology
  select mv2.id into mv from reference.methodology_versions mv2
    join reference.methodologies m on m.id = mv2.methodology_id
   where m.slug = 'transmission-headroom' and mv2.version = '1.0.0' and mv2.status = 'approved';
  if mv is null then raise exception 'transmission headroom 1.0.0 is not approved'; end if;

  select count(*) into n from reference.methodology_versions mv2
    join reference.methodologies m on m.id = mv2.methodology_id
   where m.slug = 'transmission-headroom'
     and (mv2.content_hash is null or mv2.effective_from is null);
  if n <> 0 then raise exception 'the approved version has no hash or no effective date'; end if;

  -- ------------------------------------------------------------------ registry shape
  -- Every metric belongs to exactly one market. There is no cross-market row, which is what makes
  -- "never combined" a property of the schema rather than a promise.
  select count(*) into n from reference.transmission_metric_definitions
   where market_slug not in ('nyiso', 'ercot');
  if n <> 0 then raise exception '% metric(s) claim a market outside NYISO and ERCOT', n; end if;

  -- A deferred metric must carry its reason; a live one must not pretend to be deferred.
  select count(*) into n from reference.transmission_metric_definitions
   where is_live = (deferred_reason is not null);
  if n <> 0 then raise exception '% metric(s) disagree with their own deferral reason', n; end if;

  -- Both known-undeliverable metrics are registered as deferred rather than quietly absent.
  select count(*) into n from reference.transmission_metric_definitions
   where code in ('interfaces_at_limit_count', 'ercot_network_headroom_mw') and not is_live;
  if n <> 2 then raise exception 'the two unsupported metrics are not registered as deferred'; end if;

  -- Every distribution carries a floor, and the floors are the approved ones.
  select count(*) into n from reference.transmission_metric_definitions
   where family = 'distribution' and minimum_entities is null;
  if n <> 0 then raise exception '% distribution(s) have no sample floor', n; end if;
  select count(*) into n from reference.transmission_metric_definitions
   where family = 'distribution' and minimum_entities not in (10, 12);
  if n <> 0 then raise exception 'a distribution uses a floor other than the approved 10 or 12'; end if;

  -- ------------------------------------------------------------------ fixtures
  select id into cv from reference.transmission_calculation_versions where version = '0.1.0';
  select id into ny from reference.source_interfaces where slug = 'nyiso-external-limits-flows';
  select id into er from reference.source_interfaces where slug = 'ercot-sced-binding-constraints';

  insert into pipeline.transmission_analytics_runs
    (methodology_version_id, calculation_version_id, input_digest, calculated_at, run_status, margin_count)
  values (mv, cv, repeat('d', 64), now(), 'validated', 10) returning id into run;

  select id into ent from pipeline.transmission_interfaces limit 1;

  -- ------------------------------------------------------------------ absence is never zero
  begin
    insert into pipeline.transmission_metric_results
      (run_id, metric_code, market_slug, source_interface_id, status, value, unit, publication_state)
    values (run, 'interface_headroom_median_mw', 'nyiso', ny, 'insufficient_sample', 0, 'MW', 'publishable');
    raise exception 'an insufficient sample was stored with a value of zero'
      using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  begin
    insert into pipeline.transmission_metric_results
      (run_id, metric_code, market_slug, source_interface_id, status, value, unit, publication_state)
    values (run, 'interface_headroom_median_mw', 'nyiso', ny, 'live', null, 'MW', 'publishable');
    raise exception 'a live metric was stored without a value' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  -- A stale source may not carry a number either.
  begin
    insert into pipeline.transmission_metric_results
      (run_id, metric_code, market_slug, source_interface_id, status, value, unit, publication_state)
    values (run, 'interface_utilization_median_pct', 'nyiso', ny, 'source_stale', 53.9, 'percent', 'publishable');
    raise exception 'a stale source published a current value' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ market binding
  -- A NYISO metric cannot be stored against ERCOT. This is the cross-market guard.
  begin
    insert into pipeline.transmission_metric_results
      (run_id, metric_code, market_slug, source_interface_id, status, value, unit, publication_state)
    values (run, 'interface_headroom_median_mw', 'ercot', er, 'live', 100, 'MW', 'publishable');
    raise exception 'a NYISO metric was stored against ERCOT' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ scope
  -- A market-scoped distribution must not be filed under one interface.
  begin
    insert into pipeline.transmission_metric_results
      (run_id, metric_code, market_slug, source_interface_id, entity_id, entity_label,
       status, value, unit, publication_state)
    values (run, 'interface_headroom_median_mw', 'nyiso', ny, ent, 'TOTAL EAST', 'live', 100, 'MW', 'publishable');
    raise exception 'a market distribution was stored as an entity value' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  -- And an entity metric must name its entity.
  begin
    insert into pipeline.transmission_metric_results
      (run_id, metric_code, market_slug, source_interface_id, status, value, unit, publication_state)
    values (run, 'interface_headroom_mw', 'nyiso', ny, 'live', 100, 'MW', 'publishable');
    raise exception 'an entity metric was stored without an entity' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  -- ------------------------------------------------------------------ deferred metrics
  -- A metric the methodology does not approve may never carry a value.
  begin
    insert into pipeline.transmission_metric_results
      (run_id, metric_code, market_slug, source_interface_id, status, value, unit, publication_state)
    values (run, 'ercot_network_headroom_mw', 'ercot', er, 'live', 50000, 'MW', 'publishable');
    raise exception 'a deferred metric was published with a value' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  insert into pipeline.transmission_metric_results
    (run_id, metric_code, market_slug, source_interface_id, status, value, unit, publication_state)
  values (run, 'ercot_network_headroom_mw', 'ercot', er, 'methodology_deferred', null, 'MW', 'publishable');

  -- ------------------------------------------------------------------ rights
  begin
    insert into pipeline.transmission_metric_results
      (run_id, metric_code, market_slug, source_interface_id, status, value, unit, publication_state)
    values (run, 'constraint_margin_median_mw', 'ercot', er, 'rights_blocked', null, 'MW', 'publishable');
    raise exception 'a rights-blocked result was marked publishable' using errcode = 'assert_failure';
  exception when check_violation then null;
  end;

  -- Both interfaces carry a derived-display permission, so a result can be attributed.
  select count(*) into n from reference.source_use_permissions p
    join reference.source_interfaces si on si.id = p.source_interface_id
   where si.slug in ('nyiso-external-limits-flows', 'ercot-sced-binding-constraints')
     and p.purpose_code = 'public_transmission_headroom_derived_metric_display';
  if n <> 2 then raise exception 'a transmission source lacks a derived-display permission'; end if;

  -- NYISO stays ambiguous; it is published under accepted risk, not relabelled.
  select count(*) into n from reference.source_use_permissions p
    join reference.source_interfaces si on si.id = p.source_interface_id
   where si.slug = 'nyiso-external-limits-flows'
     and p.rights_classification <> 'ambiguous_requires_legal_review';
  if n <> 0 then raise exception 'the NYISO transmission rights were relabelled'; end if;

  -- ------------------------------------------------------------------ append-only
  begin
    update pipeline.transmission_metric_results set value = 1 where run_id = run;
    raise exception 'a published result was mutated' using errcode = 'assert_failure';
  exception when restrict_violation then null;
  end;

  -- ------------------------------------------------------------------ idempotence
  begin
    insert into pipeline.transmission_analytics_runs
      (methodology_version_id, calculation_version_id, input_digest, calculated_at, run_status, margin_count)
    values (mv, cv, repeat('d', 64), now(), 'validated', 10);
    raise exception 'a second run was recorded for the same methodology and digest'
      using errcode = 'assert_failure';
  exception when unique_violation then null;
  end;
end $$;

rollback;
