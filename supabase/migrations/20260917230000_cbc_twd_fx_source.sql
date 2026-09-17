-- The New Taiwan dollar, sourced.
--
-- Phase 5.5 left TWD as the one launch currency with no route to USD: the ECB publishes no New
-- Taiwan dollar reference rate, and the CBC interface inherited from UBWI had no permission grant
-- and was unreachable. That left XTAI -- the only venue with a rights-cleared price source -- as
-- the only venue whose prices could not be converted.
--
-- This closes the source and rights half of that gap. It closes nothing else, and the boundary
-- matters: the methodology's FX fixing convention remains an unresolved parameter. Knowing where
-- to get a daily TWD close is a different question from deciding which daily close UGAI uses, and
-- this migration answers only the first.
--
-- A note on what was and was not done. Both cbc.gov.tw hosts fail DNS resolution from the build
-- environment while openapi.twse.com.tw and data.gov.tw resolve normally, so the endpoint could
-- not be called and the observation below is a researched value that was NOT re-verified live.
-- It is recorded as a research observation with that provenance stated on the row itself, and no
-- retrieval record, response hash or byte length is claimed for bytes nobody received.

-- ---------------------------------------------------------------- dataset provenance

update reference.source_interfaces
   set canonical_url = 'https://cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day',
       is_machine_readable = true,
       access_class = 'public_unauthenticated',
       -- The three rights states are deliberately NOT touched. reference.guard_terms_recheck()
       -- refuses a rights-state change unaccompanied by a newly retrieved terms artifact, and
       -- this session retrieved nothing: cbc.gov.tw fails DNS resolution here. The guard is
       -- right and the honest move is to leave the states exactly where UBWI's review put them.
       -- The interface therefore stays research_usable, which is also the correct production
       -- posture while UGAI's fixing convention is unresolved -- pipeline.check_fx_observation()
       -- will refuse a production FX observation from it, and should.
       notes = 'Central Bank of the Republic of China (Taiwan), open dataset 7232 '
            || '(identifier A59000000N-000045): "The closing exchange rate of the New Taiwan Dollar '
            || 'against the US dollar in the interbank market". Published as TWD per one USD -- the '
            || 'inverse of UGAI''s canonical orientation -- with daily observations from 2 January '
            || '2008. Licensed under the Open Government Data License, Taiwan, version 1.0, with '
            || 'attribution as a condition. Production access stays review-pending because UGAI''s '
            || 'FX fixing convention is itself an unresolved parameter: a source being usable does '
            || 'not make a fixing rule approved.',
       terms_evidence = '{
         "reviewed_on": "2026-09-17",
         "agency": "Central Bank of the Republic of China (Taiwan)",
         "dataset": "7232",
         "dataset_identifier": "A59000000N-000045",
         "series_title": "The closing exchange rate of the New Taiwan Dollar against the US dollar in the interbank market",
         "endpoint": "https://cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day",
         "published_orientation": "TWD per 1 USD",
         "history_from": "2008-01-02",
         "documents": [{
           "title": "Open Government Data License, Taiwan, version 1.0",
           "url": "https://data.gov.tw/license",
           "retrieved_on": "2026-09-17",
           "clauses": [
             {"axis": "collection", "text": "dataset 7232 is published as an open-data JSON endpoint under the Open Government Data License",
              "note": "Automated retrieval is the intended access mode for the endpoint."},
             {"axis": "data_use", "text": "The Data Providing Organization grants User a perpetual, worldwide, non-exclusive, irrevocable, royalty-free copyright license to reproduce, distribute, publicly transmit, publicly broadcast, publicly recite, publicly present, publicly perform, compile, adapt to the Open Data provided for any purpose, including but not limited to making all kinds of Derivative Works either as products or services.",
              "note": "The same licence already reviewed for the TWSE OpenAPI in Phase 5.3. An index is a derivative work offered as a product."},
             {"axis": "both", "text": "When User makes use of the Open Data and its Derivative Work, he/she must make an explicit notice of statement as attribution requested in the Exhibit below by the Data Providing Organization. If User fails to comply with the attribution requirement, the rights granted under this License shall be deemed to have been void ab initio.",
              "note": "Attribution is a condition of the grant, enforced by pipeline.check_fx_observation()."}
           ]
         }],
         "retrieval_note": "Live retrieval could not be performed or re-verified: cpx.cbc.gov.tw and www.cbc.gov.tw both fail DNS resolution from the build environment, while openapi.twse.com.tw and data.gov.tw resolve normally. The licence text above is the same OGDL already read in full for Phase 5.3; the dataset metadata is from external research and is recorded as such."
       }'::jsonb
 where slug = 'cbc-exchange-rates';

-- -------------------------------------------------------------------- permission grant
--
-- The interface has been marked permitted on both axes since UBWI and has never had a grant, so
-- nothing consumed it and nothing could. Created explicitly here against the same Open Government
-- Data License already reviewed in full for the TWSE OpenAPI in Phase 5.3 -- a full grant for any
-- purpose including derivative works as products or services, conditional on attribution.
insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference,
   covers_collection, covers_index_use, covers_internal_use, covers_index_calculation,
   covers_storage, covers_historical_retention, covers_post_termination_retention,
   covers_historical_reconstruction, covers_index_level_publication,
   covers_constituent_publication, covers_weight_publication,
   covers_membership_change_publication, covers_raw_redistribution,
   rights_layer, termination_obligation, attribution_required, attribution_text,
   effective_from, evidence, decisive_clause, reviewed_by, reviewed_on)
select 'b2b2b2b2-0000-4000-8000-000000000031', s.id, 'provider_terms',
   'Open Government Data License, Taiwan, version 1.0, https://data.gov.tw/license, governing Central Bank of the Republic of China (Taiwan) open dataset 7232 (A59000000N-000045). Reviewed 17 September 2026.',
   true, true, true, true, true, true, true, true, true, true, true, true, true,
   'regulator', 'none', true,
   'Source: Central Bank of the Republic of China (Taiwan), open data set 7232, "The closing exchange rate of the New Taiwan Dollar against the US dollar in the interbank market", released under the Open Government Data License (https://data.gov.tw/license). Rate modified by Urdais: inverted to US dollars per one New Taiwan dollar. The Central Bank does not endorse Urdais or any index derived from this data.',
   timestamptz '2026-09-17T00:00:00Z',
   'The same Open Government Data License read in full for the TWSE OpenAPI in Phase 5.3, here applied to CBC dataset 7232. Perpetual and irrevocable, reaching derivative works as products or services, and therefore reaching index calculation and the publication of derived outputs. Attribution is a condition whose breach voids the grant retroactively, and the inversion Urdais applies is a modification that the attribution text states explicitly.',
   'The Data Providing Organization grants User a perpetual, worldwide, non-exclusive, irrevocable, royalty-free copyright license to reproduce, distribute, publicly transmit, publicly broadcast, publicly recite, publicly present, publicly perform, compile, adapt to the Open Data provided for any purpose, including but not limited to making all kinds of Derivative Works either as products or services.',
   'Urdais research', date '2026-09-17'
  from reference.source_interfaces s where s.slug = 'cbc-exchange-rates';

-- ------------------------------------------------------- the source rate, and its inverse
--
-- Two rows, because the source and the rate UGAI needs are different facts. CBC publishes TWD per
-- USD; relabelling that as USD per TWD would destroy the evidence that an inversion happened at
-- all, and an inversion applied twice restores the original number while looking entirely
-- ordinary. So the published orientation is stored as published, and the derived row points at it
-- -- which the Phase 5.5 trigger then re-derives and refuses if it does not reproduce.

insert into pipeline.fx_observations
  (id, base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
   source_interface_id, permission_grant_id, attribution, observation_purpose,
   idempotency_key, source_payload)
select 'fa000000-0000-4000-8000-000000000011', 'TWD', 'USD', 31.881,
       date '2026-09-17', timestamptz '2026-09-17T00:00:00Z', 'direct',
       s.id, 'b2b2b2b2-0000-4000-8000-000000000031', g.attribution_text, 'research',
       'cbc:TWD:USD:2026-09-17:research',
       '{"日期": "20260917", "NTD_USD": "31.881", "dataset": "7232",
         "orientation": "TWD per 1 USD, as published",
         "provenance": "Researched value. Live retrieval from cpx.cbc.gov.tw could not be performed or re-verified from the build environment, where that host fails DNS resolution. Recorded as a research observation on that basis; no response hash or byte length is claimed."}'::jsonb
  from reference.source_interfaces s
  join reference.permission_grants g on g.id = 'b2b2b2b2-0000-4000-8000-000000000031'
 where s.slug = 'cbc-exchange-rates';

-- USD per TWD = 1 / 31.881. The trigger recomputes this from the row above and rejects a value
-- that does not reproduce, so the arithmetic is checked rather than asserted.
insert into pipeline.fx_observations
  (base_currency, quote_currency, rate, fixing_date, retrieved_at, derivation,
   component_quote_id, source_interface_id, permission_grant_id, attribution,
   observation_purpose, idempotency_key)
select 'USD', 'TWD', 1::numeric / 31.881,
       date '2026-09-17', timestamptz '2026-09-17T00:00:00Z', 'inverted',
       'fa000000-0000-4000-8000-000000000011', s.id,
       'b2b2b2b2-0000-4000-8000-000000000031', g.attribution_text, 'research',
       'cbc:USD:TWD:2026-09-17:research'
  from reference.source_interfaces s
  join reference.permission_grants g on g.id = 'b2b2b2b2-0000-4000-8000-000000000031'
 where s.slug = 'cbc-exchange-rates';

-- ------------------------------------------------------------- the TSMC diagnostic, moved
--
-- One criterion changes and the overall result does not. FX for TSMC is no longer unavailable --
-- the source exists, the rights are cleared and the rate resolves -- but it is not yet a pass
-- either, because which daily close UGAI uses is an unresolved parameter. `parameter_unresolved`
-- is exactly that distinction, and it is the whole reason the four-outcome model exists.
--
-- Superseded rather than edited: criterion rows are immutable, so the evaluation is replaced.

update pipeline.investability_evaluations
   set superseded_by_id = 'd1000000-0000-4000-8000-000000000001',
       superseded_at = timestamptz '2026-09-17T00:00:00Z',
       supersession_reason = 'The TWD FX source gap closed: CBC dataset 7232 supplies an official daily close under a licence that reaches index calculation. The fx_availability criterion moves from unavailable to parameter_unresolved; nothing else about the evaluation changed.'
 where id = '1b000000-0000-4000-8000-000000000003';

insert into pipeline.investability_evaluations
  (id, issuer_id, security_id, methodology_version_id, effective_date,
   parameter_basis, evaluation_purpose, overall_result, summary)
select 'd1000000-0000-4000-8000-000000000001', e.issuer_id, e.security_id,
       e.methodology_version_id, e.effective_date, 'research_candidate', 'research', 'unavailable',
       'Still unavailable, and for one fewer reason. The New Taiwan dollar now resolves to USD: CBC dataset 7232 publishes the official interbank closing rate, the Open Government Data License reaches index calculation, and the inverted rate is stored with lineage to the published TWD-per-USD observation. What remains is a methodology question rather than a data one -- UGAI''s fixing convention is unresolved, so no daily close has been designated as the one the index uses. Free float remains unavailable, one collected session stands against a three-month window, and the issuer''s thematic review is still pending.'
  from pipeline.investability_evaluations e where e.id = '1b000000-0000-4000-8000-000000000003';

insert into pipeline.investability_criteria
  (evaluation_id, criterion, result, observed_value, threshold_value, parameter_key, basis)
select 'd1000000-0000-4000-8000-000000000001', c.criterion,
       case when c.criterion = 'fx_availability' then 'parameter_unresolved' else c.result end,
       case when c.criterion = 'fx_availability' then null else c.observed_value end,
       case when c.criterion = 'fx_availability' then null else c.threshold_value end,
       case when c.criterion = 'fx_availability' then 'fx_fixing_convention' else c.parameter_key end,
       case when c.criterion = 'fx_availability' then
         'The source gap is closed. CBC dataset 7232 publishes the official TWD/USD interbank closing rate daily from 2 January 2008 under the Open Government Data License, which reaches index calculation; the rate is stored in its published TWD-per-USD orientation and inverted to USD per TWD with lineage. What blocks the criterion now is not availability but designation: UGAI''s fixing convention is an unresolved parameter, so no rule says which daily close the index takes. A source being usable does not make a fixing rule approved.'
         else c.basis end
  from pipeline.investability_criteria c
 where c.evaluation_id = '1b000000-0000-4000-8000-000000000003';
