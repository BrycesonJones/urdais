-- The volatility instruments that exist, and the first UAVI calculation attempt.
--
-- Two eligible parent issuers, two representative-route mappings, and no index. Recorded rather
-- than discarded for the reason the UGAI and snapshot diagnostics are: "UAVI cannot be calculated
-- from the currently available inputs" is this engine's answer, and an answer with its reasons
-- attached is worth more than an empty table.
--
-- Nothing is initialized. No option contract exists, no quote, no rate, no constituent variance,
-- and no headline. The options venue register is empty and stays empty, which alone makes every
-- parent member uncovered.

-- ============================================================= volatility instruments
--
-- The waterfall's first step, for the two issuers the parent currently admits. Both resolve to
-- route 1: the parent's representative security is itself a US-listed line, so no receipt
-- question arises and neither issuer carries a receipt mapping.
--
-- These are `verified`, and it is worth being precise about what that claims. It claims the
-- MAPPING is established: the security is the parent's own representative selection, it belongs
-- to the issuer, and it has an active US listing evidenced from the issuer's Section 12(b)
-- registration table. It does not claim that qualifying option contracts exist today. That is a
-- per-session test against option data, because option classes come and go and a date-dependent
-- fact cannot be frozen into an effective-dated row -- and today it fails for both, because there
-- is no option data at all.
--
-- TSMC is deliberately absent. It is not a parent constituent: its thematic review is pending
-- rather than eligible, so it is outside the universe whatever its data availability, and a
-- mapping for it would be a claim about a membership that does not exist. Its US depositary
-- receipt is not in the security master either, so the receipt route could not be exercised for
-- it even if its membership changed. The 2330 -> TSM mapping is representable by this schema and
-- is not asserted by it.

insert into pipeline.uavi_volatility_instruments
  (id, issuer_id, volatility_security_id, volatility_listing_id,
   representative_security_id, selection_id, mapping_type, preference_rank,
   mapping_state, basis, methodology_version_id, effective_from)
select v.id, i.id, sel.selected_security_id, sel.selected_listing_id,
       sel.selected_security_id, sel.id, 'representative', 1,
       'verified', v.basis, mv.id, date '2026-09-17'
  from (values
    ('5b000000-0000-4000-8000-000000000001'::uuid, 'nvidia',
     'Route 1. The parent''s representative security is the common stock registered under Section 12(b) on the Nasdaq Global Select Market, which is a US-listed line of the same economic claim, so the waterfall terminates at the representative and no receipt question arises. Verification covers the mapping only: whether a qualifying unadjusted option class on it is listed on a registered US options venue is a per-session test, and it currently fails, because the options venue register is empty and no option contract reference data is licensed.'),
    ('5b000000-0000-4000-8000-000000000002'::uuid, 'palantir-technologies',
     'Route 1, on the same basis: the parent''s representative security is the Class A common stock registered under Section 12(b) on The Nasdaq Stock Market LLC. The issuer''s other share classes are not registered under Section 12(b), are not listings, and are never substituted for better option liquidity -- the methodology forbids substituting a different share class outright, and the parent already records multi-class return representativeness as unresolved.')
  ) as v(id, issuer_key, basis)
  join reference.issuers i on i.issuer_key = v.issuer_key
  join pipeline.representative_security_selections sel
    on sel.issuer_id = i.id and sel.superseded_by_id is null
  join reference.methodology_versions mv on mv.version = '0.2.0-draft'
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi';

-- ============================================================= the calculation attempt
--
-- Blocked, with no level and no coverage figures. `unavailable_reason` is left null and
-- `block_reason` carries the account: the calculation never reached the point of measuring
-- coverage, so recording `coverage_below_threshold` would assert a measurement nobody made.
-- The distinction matters and is exactly the one the two columns exist to keep -- blocked means
-- the arithmetic never began, unavailable means it ran and a gate refused the result.

insert into pipeline.uavi_calculations
  (id, calculation_date, state, snapshot_timestamp, snapshot_id,
   methodology_version_id, block_reason, notes)
select 'e1000000-0000-4000-8000-000000000001', date '2026-09-17', 'blocked',
       -- 15:45:00.000 America/New_York on the session date, resolved through the named zone
       -- rather than a fixed offset. On 17 September 2026 that zone is on daylight time, so this
       -- is 19:45Z; in January the same local instant is 20:45Z, and nothing here hard-codes
       -- either.
       (date '2026-09-17' + time '15:45:00') at time zone 'America/New_York',
       s.id, mv.id,
       'No UAVI headline can be calculated, and the obstacles are upstream of the arithmetic rather than in it. Four are independent and each is sufficient. (1) The parent has no canonical base weights at all: the only universe snapshot is blocked, it carries zero weightable issuers, and both eligible members sit in it as eligible_unavailable. UAVI requires a production parent snapshot with a valid weight vector and may not equal-weight, may not reuse a superseded snapshot, and may not borrow UGAI''s index shares or as-of weights. (2) No option data source is admitted: the US options venue register is empty, so no venue is registered, no contract can qualify, and every parent member is uncovered for want of a volatility instrument that can be exercised. Nasdaq already refuses collection, storage and derivative works for the equity closes of these same two issuers, and no OPRA or vendor agreement exists for the option quotes. (3) No USD risk-free rate exists, and none may be recorded for production while the curve family remains an unresolved launch parameter. (4) Even with all three resolved, the frozen publication gates could not be met by this universe: two eligible issuers cannot reach the minimum of eight covered issuers, and the gates are frozen precisely so that a thin universe does not lower them.',
       'A development run against the real state. No synthetic quote, contract, rate or variance was written for any real issuer; the strip, interpolation and aggregation arithmetic is proven against isolated fixtures in supabase/tests/380, inside a transaction that rolls back, and against deterministic unit tests under src/lib/uavi.'
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'uavi'
  left join pipeline.universe_snapshots s on s.id = 'd0000000-0000-4000-8000-000000000001'
 where mv.version = '0.2.0-draft';

-- Publication readiness, check by check. Two fail on the parent, two on data that does not exist,
-- two wait on parameters, and three cannot be assessed at all -- which is the distinction the
-- four-outcome model preserves and a single boolean would destroy.

insert into pipeline.uavi_publication_checks
  (calculation_id, check_name, result, parameter_key, basis)
values
  ('e1000000-0000-4000-8000-000000000001', 'parent_snapshot_production', 'failed', null,
   'The only universe snapshot is blocked, on five independent blockers of its own. UAVI consumes a production parent snapshot or it does not calculate; unlike UGAI it cannot proceed on a membership event alone, because its aggregation needs a current canonical weight vector and a membership state is not one.'),
  ('e1000000-0000-4000-8000-000000000001', 'parent_weights_valid', 'failed', null,
   'Zero weightable issuers. Both eligible members are eligible_unavailable -- no rights-cleared price, no established free-float factor, and for Palantir no unambiguous outstanding share count -- so no w_i exists for anyone. The methodology forbids every available substitute by name: no equal weighting, no superseded snapshot reused as current, no reconstruction of parent weights by UAVI''s own means, and no borrowing of UGAI''s as-of weights or index shares.'),
  ('e1000000-0000-4000-8000-000000000001', 'option_data_source_admitted', 'failed', null,
   'The US options venue register is empty, so no venue is registered and no contract can qualify. This is not an engineering gap: methodology 0.2.0-draft admits US-listed options only and requires venue-level evidence for each admission, and Urdais holds no OPRA agreement and no vendor agreement for consolidated option quotes. Scraping retail option chains is not an acceptable production source at any stage, so there is no interim path either.'),
  ('e1000000-0000-4000-8000-000000000001', 'risk_free_rate_available', 'unavailable', null,
   'No USD risk-free rate observation exists. Assessable only once a curve is chosen: the rate is needed per expiration, and there are no expirations because there are no contracts. Downstream of the option data rather than a separate failure.'),
  ('e1000000-0000-4000-8000-000000000001', 'methodology_parameters_approved', 'parameter_unresolved', 'usd_rate_curve_family',
   'The USD rate curve family is unresolved and marked for validation in the live pipeline; the candidates differ in what they measure, in publication latency against a 15:45 snapshot, and in licensing. The quote-freshness tolerance, the publication deadline and the correction window are unresolved too. The gates, the snapshot instant, the expiration bounds, the 3-per-side minimum, the zero-bid run length, the minute constants and the aggregation form are all approved, so the unresolved set is genuinely the remainder rather than the whole.'),
  ('e1000000-0000-4000-8000-000000000001', 'covered_parent_weight_gate', 'unavailable', null,
   'Coverage was never measured, because no constituent could be assessed against option data that does not exist. Recorded as unavailable rather than failed: asserting coverage_below_threshold would claim a measurement nobody made, and the difference between "the gate refused this" and "the gate was never reached" is the difference between an index that is working and one that has not started.'),
  ('e1000000-0000-4000-8000-000000000001', 'covered_issuer_count_gate', 'failed', null,
   'This one can be assessed without any option data, and it fails on arithmetic alone. The parent admits two eligible issuers against a frozen minimum of eight covered issuers. The gate is frozen deliberately and is not lowered to fit the current universe; the finding is that UAVI cannot publish until the parent universe is materially larger, which is a fact about the parent rather than about UAVI.'),
  ('e1000000-0000-4000-8000-000000000001', 'source_rights_permit_publication', 'failed', null,
   'No rights exist to option quotes for any venue. The UAVI level would be Urdais''s own derived output and publishable in principle, exactly as UGAI''s level would be, but there is no lawful path to the inputs that produce it. The methodology is explicit that reproducibility is bounded by licensing and not only by its rules, and that coverage which cannot be licensed is a published limitation rather than an assumption.'),
  ('e1000000-0000-4000-8000-000000000001', 'lineage_complete', 'unavailable', null,
   'There is no calculation to trace. Assessable only once a level exists.');
