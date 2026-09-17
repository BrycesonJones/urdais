-- FX rates, the unresolved parameters, and the first investability diagnostic.
--
-- What this seed demonstrates is mostly refusal, and the shape of the refusals is the finding:
--
--   FX        six currencies resolve from ECB. The seventh, TWD, does not -- the ECB publishes
--             no New Taiwan dollar reference rate, and Taiwan's central bank did not resolve from
--             the review environment. So the one venue Urdais can price is the one currency it
--             cannot convert.
--   Selection all three issuers have a single eligible line, so selection is unambiguous and none
--             of the traded-value machinery is exercised by real data yet.
--   Availability all three selections are constrained, for three different reasons.
--   Investability every evaluation returns `unavailable`, and each says which input was missing
--             rather than reporting a failure nobody measured.

-- ------------------------------------------------------------------- the ECB grant
--
-- The interface has existed since UBWI and carried a review in its notes, but no permission_grant
-- row was ever created for it, so there was nothing to reuse. The grant below is built from the
-- ECB's own copyright statement, re-read for this phase.
--
-- Free use, on two conditions that both bear on how UGAI must behave. The ECB must be cited as
-- the source, so attribution is a condition of the grant. And "if the information is modified by
-- the user (e.g. by seasonal adjustment of statistical data or calculation of growth rates) this
-- must be stated explicitly" -- a cross-rate is precisely such a modification, and the derivation
-- and component lineage on every derived row are how that statement is made rather than a note in
-- a document nobody reads.
insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use, covers_internal_use, covers_index_calculation,
   covers_storage, covers_historical_retention, covers_post_termination_retention,
   covers_historical_reconstruction, covers_index_level_publication,
   covers_constituent_publication, covers_weight_publication,
   covers_membership_change_publication, covers_raw_redistribution,
   rights_layer, termination_obligation, attribution_required, attribution_text,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
select 'b2b2b2b2-0000-4000-8000-000000000021', s.id, 'provider_terms',
   'European Central Bank copyright and reuse statement, https://www.ecb.europa.eu/services/disclaimer/html/index.en.html, retrieved 17 September 2026',
   true, true, true, true, true, true, true, true, true, true, true, true, true,
   'regulator', 'none', true,
   'Source: European Central Bank euro foreign exchange reference rates. Rates modified by Urdais: converted to US dollars per unit of the quoted currency, by cross-division through the euro leg.',
   timestamptz '2026-09-17T00:00:00Z',
   'ECB copyright statement re-read for Phase 5.5. Free use with mandatory citation; modification must be stated explicitly, which the derivation and component lineage on each derived row discharge. A separate condition applies where the information is incorporated in documents that are sold: buyers must be told it is obtainable free of charge from the ECB website. Recorded here because a future subscription product would have to honour it.',
   'users of this website may make free use of the information obtained directly from it subject to the following conditions: When such information is distributed or reproduced, it must appear accurately and the ECB must be cited as the source. ... If the information is modified by the user (e.g. by seasonal adjustment of statistical data or calculation of growth rates) this must be stated explicitly.',
   'Urdais research', date '2026-09-17'
  from reference.source_interfaces s where s.slug = 'ecb-euro-reference-rates';

-- --------------------------------------------------------------- unresolved parameters
--
-- The methodology defines the screens and states that the "numerical minima, suspension
-- tolerances, and entry/retention buffers are unresolved". They are recorded as drafts so that
-- an evaluation can name the parameter it was waiting for, and so that approving one is a dated,
-- attributed act rather than an edit to a constant -- the same treatment tau_B received.
insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, numeric_value, text_value, status, rationale)
select mv.id, v.key, v.num, v.txt, 'draft', v.rationale
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id
  cross join (values
    ('fx_fixing_convention', null::numeric, 'unresolved',
     'UGAI requires one reference rate per currency per day at a single global reference time. The methodology names a 16:00 London closing spot fixing as the convention the researched providers use, and states that the exact source, fixing time, licensing and fallback rules are UNRESOLVED launch parameters. The ECB reference rates seeded here are published around 16:00 CET and are a research input, not the resolved convention.'),
    ('min_accessible_float_capitalization_usd', null, 'unresolved',
     'Minimum accessible free-float market capitalization. UNRESOLVED. The methodology requires a size gate on accessible float rather than total capitalization and sets no number; the comparison sources use values that this universe has not adopted.'),
    ('min_adtv_usd', null, 'unresolved',
     'Minimum three-month average daily traded value in USD. UNRESOLVED.'),
    ('min_trading_frequency', null, 'unresolved',
     'Minimum share of scheduled sessions with trading. UNRESOLVED. Known zero-volume and suspended sessions count as zero; missing observations stay missing and do not leave the denominator.'),
    ('min_free_float_percentage', null, 'unresolved',
     'Minimum free-float percentage. UNRESOLVED, and currently unmeasurable in any launch market -- no public source publishes a free-float factor.'),
    ('min_foreign_headroom_percentage', null, 'unresolved',
     'Minimum remaining foreign-ownership headroom. UNRESOLVED.'),
    ('min_listing_record_months', 3, null,
     'Complete listing and trading record required before assessment, in months. The methodology states three months as a PROPOSED OPERATIONAL CONVENTION aligned with the comparison window, and is explicit that it "is not evidence that a specific liquidity threshold is adequate". A stated convention rather than an unresolved minimum, but still a draft: nothing here is approved.')
  ) as v(key, num, txt, rationale)
 where m.slug = 'ai-equity-universe' and mv.version = '0.4.0-draft';

-- ----------------------------------------------------------------------- FX rates
--
-- ECB publishes euro reference rates: one euro buys `rate` units of the quoted currency. The USD
-- line is the exception that makes everything else work -- it is already USD per EUR, which is
-- exactly the orientation UGAI needs for the euro, and it is the base leg of every cross.

insert into pipeline.fx_observations
  (id, base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
   source_interface_id, permission_grant_id, attribution, idempotency_key, source_payload)
select v.id, v.base, v.quote, v.rate, date '2026-09-17', timestamptz '2026-09-17T16:30:00Z',
       'direct', s.id, 'b2b2b2b2-0000-4000-8000-000000000021', g.attribution_text,
       'ecb:' || v.base || ':' || v.quote || ':2026-09-17:research',
       jsonb_build_object('currency', v.ecb_currency, 'rate', v.rate::text, 'time', '2026-09-17')
  from (values
    -- USD per EUR, as ECB publishes it. Also the base leg of every cross below.
    ('fa000000-0000-4000-8000-000000000001'::uuid, 'USD'::char(3), 'EUR'::char(3), 1.1481::numeric, 'USD'),
    -- The remaining ECB lines are "currency per EUR", which is the quote leg of a cross and is
    -- not itself a rate UGAI can use.
    ('fa000000-0000-4000-8000-000000000002'::uuid, 'JPY', 'EUR', 178.75, 'JPY'),
    ('fa000000-0000-4000-8000-000000000003'::uuid, 'GBP', 'EUR', 0.85830, 'GBP'),
    ('fa000000-0000-4000-8000-000000000004'::uuid, 'HKD', 'EUR', 9.0071, 'HKD'),
    ('fa000000-0000-4000-8000-000000000005'::uuid, 'KRW', 'EUR', 1587.31, 'KRW'),
    ('fa000000-0000-4000-8000-000000000006'::uuid, 'CNY', 'EUR', 7.7009, 'CNY')
  ) as v(id, base, quote, rate, ecb_currency)
  cross join reference.source_interfaces s
  cross join reference.permission_grants g
 where s.slug = 'ecb-euro-reference-rates' and g.id = 'b2b2b2b2-0000-4000-8000-000000000021';

-- USD per USD is one. An identity rather than an observation, because it is arithmetic and
-- pretending it came from a source would put a fiction in the lineage.
insert into pipeline.fx_observations
  (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation, idempotency_key)
values ('USD', 'USD', 1, date '2026-09-17', timestamptz '2026-09-17T16:30:00Z', 'identity',
        'identity:USD:2026-09-17:research');

-- The crosses UGAI would actually use. Each divides the USD-per-EUR leg by the currency-per-EUR
-- leg, and the trigger re-derives every one of them from the rows named here -- so a double
-- inversion or a leg from the wrong day is refused rather than stored as a plausible number.
insert into pipeline.fx_observations
  (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
   cross_via_currency, component_base_id, component_quote_id,
   source_interface_id, permission_grant_id, attribution, idempotency_key)
select 'USD', v.quote, v.rate, date '2026-09-17', timestamptz '2026-09-17T16:30:00Z',
       'cross', 'EUR', 'fa000000-0000-4000-8000-000000000001', v.leg,
       s.id, 'b2b2b2b2-0000-4000-8000-000000000021', g.attribution_text,
       'ecb:USD:' || v.quote || ':2026-09-17:research'
  from (values
    ('JPY'::char(3), 0.0064229370629370629370629371::numeric, 'fa000000-0000-4000-8000-000000000002'::uuid),
    ('GBP', 1.3376441803565186997553303040, 'fa000000-0000-4000-8000-000000000003'),
    ('HKD', 0.1274661100687235625228990019, 'fa000000-0000-4000-8000-000000000004'),
    ('KRW', 0.0007232991665144174735866276, 'fa000000-0000-4000-8000-000000000005'),
    ('CNY', 0.1490864704125491825630770819, 'fa000000-0000-4000-8000-000000000006')
  ) as v(quote, rate, leg)
  cross join reference.source_interfaces s
  cross join reference.permission_grants g
 where s.slug = 'ecb-euro-reference-rates' and g.id = 'b2b2b2b2-0000-4000-8000-000000000021';

-- TWD is deliberately absent. The ECB publishes no New Taiwan dollar reference rate -- which is
-- why UBWI needed a second FX source at all -- and Taiwan's central bank did not resolve from the
-- review environment, so no current rate was retrieved and none is invented. The consequence is
-- worth stating plainly: XTAI is the only venue Urdais holds a rights-cleared price source for,
-- and TWD is the only launch currency it cannot convert to USD.

-- ------------------------------------------------- representative security selections
--
-- All three issuers have exactly one eligible line in the security master, so selection is
-- unambiguous and the traded-value comparison is not exercised by real data. That is a fact about
-- the current master rather than about the rule: the dual-listed candidates -- Alibaba, Baidu,
-- TSMC's own US receipt -- have no seeded listings, because Phase 5.3 seeded only what a primary
-- document evidenced and no rights-cleared source exists for their venues.

insert into pipeline.representative_security_selections
  (id, issuer_id, methodology_version_id, effective_date, selection_state,
   selected_security_id, selected_listing_id, selection_rule, selection_basis,
   availability_state, availability_reason)
select v.id, i.id, mv.id, date '2026-09-17', 'selected', s.id, l.id,
       'sole_eligible_security', v.basis, 'constrained', v.reason
  from (values
    ('5a000000-0000-4000-8000-000000000001'::uuid, 'nvidia', 'NVDA',
     'One eligible line in the security master: the common stock registered under Section 12(b) on the Nasdaq Global Select Market. No traded-value comparison was required.',
     'Selected and not operable. XNGS has no rights-cleared public end-of-day price source: Nasdaq''s terms grant a personal, non-commercial licence only and refuse storage, derivative works and products based on the content. Under the methodology this is an availability constraint on the selection, never a reason to select a different line.'),
    ('5a000000-0000-4000-8000-000000000002'::uuid, 'palantir-technologies', 'PLTR',
     'One eligible line in the security master: the Class A common stock registered under Section 12(b) on The Nasdaq Stock Market LLC. The issuer''s other share classes are not registered under Section 12(b) and are not listings.',
     'Selected and not operable. XNAS has no rights-cleared public end-of-day price source, and no unambiguous share count is available for a multi-class issuer from the flat XBRL API.'),
    ('5a000000-0000-4000-8000-000000000003'::uuid, 'tsmc', '2330',
     'One eligible line in the security master: the ordinary shares listed on the Taiwan Stock Exchange under code 2330. The issuer also has a US depositary receipt, which is not seeded because no rights-cleared price source exists for its venue -- so no traded-value comparison between the two was possible.',
     'Selected, priced, and still not operable. XTAI has a rights-cleared price source, but no USD reference rate exists for the New Taiwan dollar: the ECB publishes none and Taiwan''s central bank did not resolve from the review environment. Free float is separately unavailable.')
  ) as v(id, issuer_key, ticker, basis, reason)
  join reference.issuers i on i.issuer_key = v.issuer_key
  join reference.securities s on s.issuer_id = i.id
  join reference.listings l on l.security_id = s.id and l.ticker = v.ticker
  join reference.methodology_versions mv on mv.version = '0.4.0-draft'
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'ai-equity-universe';

insert into pipeline.representative_security_candidates
  (selection_id, security_id, listing_id, security_screen_state, traded_value_state,
   is_receipt, is_issuer_primary, notes)
select sel.id, sel.selected_security_id, sel.selected_listing_id, 'eligible',
       case when v.ticker = '2330' then 'unavailable' else 'unavailable' end,
       false, l.is_primary, v.note
  from (values
    ('5a000000-0000-4000-8000-000000000001'::uuid, 'NVDA',
     'Traded value was not measured: no rights-cleared source publishes turnover for this venue. Recorded as unavailable rather than zero, because zero would have lost a comparison it never entered.'),
    ('5a000000-0000-4000-8000-000000000002'::uuid, 'PLTR',
     'Traded value was not measured, for the same reason.'),
    ('5a000000-0000-4000-8000-000000000003'::uuid, '2330',
     'TWSE publishes session turnover in the same payload as the close and under the same licence, but only one session has been collected -- far short of the three complete calendar months the methodology''s window requires. Recorded as unavailable rather than computed from one day.')
  ) as v(id, ticker, note)
  join pipeline.representative_security_selections sel on sel.id = v.id
  join reference.listings l on l.id = sel.selected_listing_id;

-- ---------------------------------------------------------- investability diagnostics
--
-- Development evaluations against research-candidate parameters, explicitly labelled. None can be
-- a production determination: the trigger refuses that while the parameters are unapproved, and
-- every one of them would be `unavailable` regardless because the inputs are missing.

insert into pipeline.investability_evaluations
  (id, issuer_id, security_id, methodology_version_id, effective_date,
   parameter_basis, evaluation_purpose, overall_result, summary)
select v.id, i.id, sel.selected_security_id, mv.id, date '2026-09-17',
       'research_candidate', 'research', 'unavailable', v.summary
  from (values
    ('1b000000-0000-4000-8000-000000000001'::uuid, 'nvidia', '5a000000-0000-4000-8000-000000000001'::uuid,
     'Unavailable, not failing. The issuer is thematically eligible at Tier 2 on human-verified filing evidence and that determination is untouched. Six of eight screens cannot be measured at all because no rights-cleared price source exists for its venue and no free-float factor is published for US listings; one passes on listing record; one waits on an unresolved parameter.'),
    ('1b000000-0000-4000-8000-000000000002'::uuid, 'palantir-technologies', '5a000000-0000-4000-8000-000000000002'::uuid,
     'Unavailable, not failing. Same position as NVIDIA, with an additional gap: no unambiguous share count exists for a multi-class issuer from the flat XBRL API, so even accessible capitalization has no numerator.'),
    ('1b000000-0000-4000-8000-000000000003'::uuid, 'tsmc', '5a000000-0000-4000-8000-000000000003'::uuid,
     'Unavailable, and instructively so: this is the issuer Urdais can price. It has a rights-cleared close, a reconciled share count and a permitted turnover feed, and it still cannot be assessed -- there is no USD reference rate for the New Taiwan dollar, no published free-float factor, and one collected session against a three-month window. Note also that TSMC is a candidate whose thematic review has not completed, so it would not be a member even if every input existed.')
  ) as v(id, issuer_key, sel_id, summary)
  join reference.issuers i on i.issuer_key = v.issuer_key
  join pipeline.representative_security_selections sel on sel.id = v.sel_id
  join reference.methodology_versions mv on mv.version = '0.4.0-draft'
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'ai-equity-universe';

insert into pipeline.investability_criteria
  (evaluation_id, criterion, result, observed_value, threshold_value, parameter_key, basis)
values
  -- NVIDIA
  ('1b000000-0000-4000-8000-000000000001', 'price_availability', 'unavailable', null, null, null,
   'No rights-cleared public end-of-day source for XNGS. Nasdaq''s terms refuse storage, derivative works and products based on the content, and prohibit capture by any automated or manual process.'),
  ('1b000000-0000-4000-8000-000000000001', 'traded_value', 'unavailable', null, null, 'min_adtv_usd',
   'No turnover series exists, because no permitted price source exists. Not measurable, so not a failure.'),
  ('1b000000-0000-4000-8000-000000000001', 'trading_frequency', 'unavailable', null, null, 'min_trading_frequency',
   'Session coverage is undefined where no sessions were observed. The absence is a source gap and not issuer non-trading, and the methodology requires those to stay distinguishable.'),
  ('1b000000-0000-4000-8000-000000000001', 'free_float_percentage', 'unavailable', null, null, 'min_free_float_percentage',
   'Free float is recorded as unavailable for this security: no rights-cleared source publishes a factor for US listings. EntityPublicFloat is a currency amount over a different population and is not a factor.'),
  ('1b000000-0000-4000-8000-000000000001', 'accessible_float_capitalization', 'unavailable', null, null, 'min_accessible_float_capitalization_usd',
   'Requires price, shares, float and FX. Shares are established; price, float and the accessibility adjustment are not.'),
  ('1b000000-0000-4000-8000-000000000001', 'data_completeness', 'unavailable', null, null, null,
   'No trading record exists to be complete or incomplete.'),
  ('1b000000-0000-4000-8000-000000000001', 'foreign_headroom', 'parameter_unresolved', null, null, 'min_foreign_headroom_percentage',
   'The input side is as good as it gets: accessibility is recorded as no_limit_evidenced, a search having found no statutory, exchange or charter cap. The screen still cannot be decided, because the minimum headroom requirement is an unresolved parameter.'),
  ('1b000000-0000-4000-8000-000000000001', 'listing_record', 'passed', 235, 90, 'min_listing_record_months',
   'The listing has been effective since 25 January 2026, giving 235 days against the 90-day stated convention. Measured from the effective-dated listing record, never from the issuer''s incorporation date.'),
  ('1b000000-0000-4000-8000-000000000001', 'fx_availability', 'passed', 1, 1, null,
   'The price currency is USD, the index base currency, so the conversion is the identity rate and needs no fixing.'),

  -- Palantir
  ('1b000000-0000-4000-8000-000000000002', 'price_availability', 'unavailable', null, null, null,
   'No rights-cleared public end-of-day source for XNAS.'),
  ('1b000000-0000-4000-8000-000000000002', 'traded_value', 'unavailable', null, null, 'min_adtv_usd',
   'No turnover series exists.'),
  ('1b000000-0000-4000-8000-000000000002', 'trading_frequency', 'unavailable', null, null, 'min_trading_frequency',
   'No observed sessions.'),
  ('1b000000-0000-4000-8000-000000000002', 'free_float_percentage', 'unavailable', null, null, 'min_free_float_percentage',
   'No published factor for US listings, and the issuer is multi-class, so even a derived factor would need per-class share counts the flat XBRL API does not expose.'),
  ('1b000000-0000-4000-8000-000000000002', 'accessible_float_capitalization', 'unavailable', null, null, 'min_accessible_float_capitalization_usd',
   'No share count is established for the listed Class A line, so this measure has no numerator before price or float are even considered.'),
  ('1b000000-0000-4000-8000-000000000002', 'data_completeness', 'unavailable', null, null, null,
   'No trading record exists.'),
  ('1b000000-0000-4000-8000-000000000002', 'foreign_headroom', 'parameter_unresolved', null, null, 'min_foreign_headroom_percentage',
   'Accessibility is no_limit_evidenced; the minimum headroom requirement is unresolved.'),
  ('1b000000-0000-4000-8000-000000000002', 'listing_record', 'passed', 260, 90, 'min_listing_record_months',
   'Effective since 31 December 2025: 260 days against the 90-day convention.'),
  ('1b000000-0000-4000-8000-000000000002', 'fx_availability', 'passed', 1, 1, null,
   'Price currency is USD; identity rate.'),

  -- TSMC: the instructive one, because the price exists and it still cannot be assessed.
  ('1b000000-0000-4000-8000-000000000003', 'price_availability', 'passed', 1, 1, null,
   'XTAI has a rights-cleared official close under the Taiwan Open Government Data License, and one observation is stored.'),
  ('1b000000-0000-4000-8000-000000000003', 'fx_availability', 'unavailable', null, null, 'fx_fixing_convention',
   'No USD reference rate exists for the New Taiwan dollar. The ECB publishes no TWD reference rate, and Taiwan''s central bank did not resolve from the review environment, so no rate was retrieved and none was invented. Independently, the fixing convention itself is an unresolved parameter.'),
  ('1b000000-0000-4000-8000-000000000003', 'traded_value', 'unavailable', null, null, 'min_adtv_usd',
   'TWSE publishes session turnover under the same licence as the close, but one collected session is not three complete calendar months, and converting it would need the TWD rate that does not exist.'),
  ('1b000000-0000-4000-8000-000000000003', 'trading_frequency', 'unavailable', null, null, 'min_trading_frequency',
   'One observed session against roughly sixty expected. The shortfall is uncollected data, not sessions the issuer did not trade, and recording it as a low frequency would assert the opposite.'),
  ('1b000000-0000-4000-8000-000000000003', 'free_float_percentage', 'unavailable', null, null, 'min_free_float_percentage',
   'Recorded unavailable: TWSE publishes insider share counts and the names of holders above ten percent without percentages, which are float inputs and not a float population.'),
  ('1b000000-0000-4000-8000-000000000003', 'accessible_float_capitalization', 'unavailable', null, null, 'min_accessible_float_capitalization_usd',
   'Price and shares both exist for this security. Float, accessibility and FX do not, so the product cannot be formed -- and this phase would not persist it if it could.'),
  ('1b000000-0000-4000-8000-000000000003', 'data_completeness', 'unavailable', null, null, null,
   'One session collected against a three-month window.'),
  ('1b000000-0000-4000-8000-000000000003', 'foreign_headroom', 'unavailable', null, null, 'min_foreign_headroom_percentage',
   'Accessibility is unknown for this security: TWSE publishes foreign holding ratios by sector and a top-twenty aggregate, neither of which is a per-security limit or usage figure. An unknown accessibility is never read as unrestricted.'),
  ('1b000000-0000-4000-8000-000000000003', 'listing_record', 'passed', 259, 90, 'min_listing_record_months',
   'The listing record has been effective since 1 January 2026: 259 days against the 90-day convention. Measured from the listing, not from the issuer''s 1994 flotation, which Urdais has not evidenced.');
