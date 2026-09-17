-- The first snapshot attempt, and why it produced nothing.
--
-- This is a development run against the real universe, recorded rather than discarded, because
-- "no production snapshot can be formed from the currently available inputs" is the engine's
-- answer and an answer is worth keeping. Nothing here is a fixture: no synthetic price, share
-- count, float factor or FX rate is written against a real issuer, and the arithmetic proofs live
-- in the test suite where they roll back.
--
-- Five independent blockers, any one of which is sufficient:
--
--   1. the issuer cap is a draft parameter with no effective date
--   2. two eligible issuers at a 10% research cap give n × c = 0.2, far below the 1 that
--      feasibility requires -- so even an approved cap would withhold the snapshot
--   3. neither eligible issuer has a rights-cleared price
--   4. no free-float factor is established anywhere, so `f` has no value
--   5. the reconstitution calendar itself is unresolved, so no scheduled as-of date exists
--
-- The fifth is why this is a development snapshot rather than a scheduled reconstitution: the
-- methodology proposes quarterly reviews in March, June, September and December and states that
-- the exact dates are unresolved launch requirements. Choosing one would be inventing a date.

insert into pipeline.universe_snapshots
  (id, as_of_date, snapshot_kind, state, methodology_version_id,
   cap_parameter_id, cap_value, review_cycle_id,
   eligible_issuer_count, weightable_issuer_count, cap_feasible, block_reason, notes)
select 'd0000000-0000-4000-8000-000000000001', date '2026-09-17', 'development', 'blocked',
       mv.id, p.id, p.numeric_value, c.id,
       2, 0, false,
       'No production snapshot can be formed. Five independent blockers, each sufficient on its own. (1) The issuer cap is a draft parameter with no effective date and no approver, so no production snapshot may name it. (2) Cap feasibility fails regardless: two eligible issuers at the 10% research candidate give n x c = 0.2 against the 1 the methodology requires, and the instruction there is to withhold the snapshot and publish the reason rather than relax the cap, add ineligible companies, or fall back to equal weights. (3) Neither eligible issuer has a rights-cleared end-of-day price, because both list on Nasdaq and Nasdaq refuses collection, storage and derivative works. (4) No free-float factor is established in any reviewed market, so the methodology''s f has no value for any security. (5) The reconstitution calendar is itself unresolved, so there is no scheduled as-of date to form a snapshot against.',
       'A development run against the real universe. No synthetic observation was written for any real issuer; the valuation and capping proofs are exercised against controlled fixtures in supabase/tests/360, inside a transaction that rolls back.'
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'ai-equity-universe'
  join reference.methodology_parameters p
    on p.methodology_version_id = mv.id and p.parameter_key = 'issuer_cap'
  left join reference.ai_universe_review_cycles c on c.label = 'dev-2026-09b'
 where mv.version = '0.4.0-draft';

-- Constituents. The two eligible issuers stay in the snapshot as eligible_unavailable with their
-- constraints stated, which is what the methodology requires: such an issuer "is recorded as
-- eligible with its availability constraint stated, and the resulting coverage gap is published
-- rather than resolved by declaring the issuer ineligible". Dropping them silently would be the
-- one outcome the rule forbids.

insert into pipeline.snapshot_constituents
  (snapshot_id, issuer_id, membership_state, unavailable_reason,
   eligibility_review_id, selection_id, investability_id,
   representative_security_id, representative_listing_id)
select 'd0000000-0000-4000-8000-000000000001', i.id, v.state, v.reason,
       er.id, sel.id, ie.id, sel.selected_security_id, sel.selected_listing_id
  from (values
    ('nvidia', 'eligible_unavailable',
     'Eligible at Tier 2 on human-verified filing evidence; representative security resolved to NVDA on XNGS. Not weightable: no rights-cleared price source exists for the venue, and no free-float factor is established, so neither P nor f has a value. Shares outstanding are available and FX is trivial, the price currency being the base currency. Recorded as a published coverage gap, not as an exclusion.'),
    ('palantir-technologies', 'eligible_unavailable',
     'Eligible at Tier 1 Route P on human-verified filing evidence; representative security resolved to PLTR on XNAS. Not weightable for the same two reasons, plus a third: no unambiguous outstanding share count exists for a multi-class issuer from the flat XBRL API, so N has no value either.'),
    ('tsmc', 'excluded',
     'Not a member. Its thematic review is pending rather than eligible, so it is outside the universe whatever its data availability. Recorded here because it is the one issuer Urdais can price, and its exclusion is a thematic finding rather than an availability one.')
  ) as v(issuer_key, state, reason)
  join reference.issuers i on i.issuer_key = v.issuer_key
  left join pipeline.eligibility_reviews er
    on er.issuer_id = i.id and er.superseded_by_id is null and er.status = 'eligible'
  left join pipeline.representative_security_selections sel
    on sel.issuer_id = i.id and sel.superseded_by_id is null
  left join pipeline.investability_evaluations ie
    on ie.issuer_id = i.id and ie.superseded_by_id is null;

-- Per-class valuation inputs, recorded as incomplete with the factors that were missing. This is
-- the row a reviewer reads to see exactly which of P, N, f and X could not be supplied -- and for
-- TSMC it is the interesting one, because two of the four exist.

insert into pipeline.snapshot_constituent_inputs
  (constituent_id, security_id, listing_id, economic_date, input_state, missing_inputs,
   price_observation_id, local_price, price_currency,
   share_observation_id, share_count, share_count_type)
select con.id, l.security_id, l.id, date '2026-09-17', 'incomplete', v.missing,
       null, null, null, null, null, v.share_type
  from (values
    ('nvidia', array['P: no rights-cleared price source for XNGS', 'f: no free-float factor established']::text[], 'outstanding'),
    ('palantir-technologies', array['P: no rights-cleared price source for XNAS', 'N: no unambiguous outstanding count for a multi-class issuer', 'f: no free-float factor established']::text[], null),
    ('tsmc', array['f: no free-float factor established', 'X: no USD reference rate exists for TWD', 'N: TWSE publishes issued shares, and the methodology values N as outstanding']::text[], 'issued')
  ) as v(issuer_key, missing, share_type)
  join reference.issuers i on i.issuer_key = v.issuer_key
  join pipeline.snapshot_constituents con
    on con.issuer_id = i.id and con.snapshot_id = 'd0000000-0000-4000-8000-000000000001'
  join reference.securities s on s.issuer_id = i.id
  join reference.listings l on l.security_id = s.id;
