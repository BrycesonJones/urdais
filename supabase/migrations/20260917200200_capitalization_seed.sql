-- The first capitalization observations, and three findings that are absences.
--
-- Three securities are in the master and they produce three different answers for shares
-- outstanding, which is a better test of the model than three successes would have been:
--
--   NVIDIA    established.    Single share class, so dei:EntityCommonStockSharesOutstanding is an
--                             unambiguous cover-page count with its own effective date.
--   TSMC      established.    TWSE publishes the issued common share count, and it reconciles
--                             against paid-in capital divided by par value.
--   Palantir  NOT recorded.   Multi-class issuer. dei:EntityCommonStockSharesOutstanding does not
--                             exist for it, and the us-gaap concept the flat API does serve has
--                             had its share-class dimension stripped -- so whether 2,402,897,000
--                             is Class A alone or every class summed is not established by that
--                             endpoint. The security master holds only the listed Class A line.
--                             Attaching an all-class figure to it would be a wrong number that
--                             looks right, so no share observation is written for Palantir.
--
-- Free float is unavailable for all three, and that is this phase's substantive finding rather
-- than a gap to be filled later by inference. Recorded as rows with float_state and a basis, so
-- a future calculation meets an explicit refusal rather than a missing join.

-- ------------------------------------------------------------------ shares outstanding

insert into pipeline.share_observations
  (security_id, share_count_type, share_count, effective_date, as_reported_date,
   source_interface_id, permission_grant_id, source_concept, observation_purpose, idempotency_key,
   source_payload)
select s.id, 'outstanding', 24100000000, date '2026-08-21', date '2026-08-26',
       '5e000000-0000-4000-8000-000000000108', '5e000000-0000-4000-8000-000000000208',
       'dei:EntityCommonStockSharesOutstanding', 'research',
       'sec:0001045810:dei:EntityCommonStockSharesOutstanding:2026-08-21:research',
       '{"cik": "0001045810", "form": "10-Q", "end": "2026-08-21", "filed": "2026-08-26", "val": 24100000000, "unit": "shares"}'::jsonb
  from reference.securities s
  join reference.issuers i on i.id = s.issuer_id
 where i.issuer_key = 'nvidia';

-- TSMC: 已發行普通股數 25,932,370,067, which is paid-in capital 259,323,700,670 divided by the
-- NT$10 par value exactly. Two published figures agreeing is a cheap and real check on the parse.
insert into pipeline.share_observations
  (security_id, share_count_type, share_count, effective_date, as_reported_date,
   source_interface_id, permission_grant_id, source_concept, observation_purpose, idempotency_key,
   attribution, source_payload)
select s.id, 'issued', 25932370067, date '2026-09-16', date '2026-09-16',
       '5e000000-0000-4000-8000-000000000109', '5e000000-0000-4000-8000-000000000209',
       '已發行普通股數或TDR原股發行股數', 'research',
       'twse:2330:issued_common_shares:2026-09-16:research',
       g.attribution_text,
       '{"公司代號": "2330", "出表日期": "1150916", "已發行普通股數或TDR原股發行股數": "25932370067", "實收資本額": "259323700670", "普通股每股面額": "新台幣 10.0000元", "私募股數": "0", "特別股": "0"}'::jsonb
  from reference.securities s
  join reference.issuers i on i.id = s.issuer_id
  cross join reference.permission_grants g
 where i.issuer_key = 'tsmc' and g.id = '5e000000-0000-4000-8000-000000000209';

-- TSMC has no preferred shares and no privately placed shares. Zero counts cannot be stored as
-- share observations (the count must be positive), and that is correct: "zero preferred shares"
-- is a fact about the capital structure, not a share observation. It is carried on the issued
-- row's payload, where the source published it.

-- ------------------------------------------------------------- ownership that bears on float

-- TSMC appears in no row of TWSE's list of holders above ten percent. The absence is a real
-- disclosure -- the venue publishes the list and TSMC is not on it -- so it is recorded as a
-- note rather than inferred. It is also not a float factor: it bounds the largest single holder
-- and says nothing about the aggregate of smaller strategic holdings.
insert into pipeline.float_observations
  (security_id, effective_date, float_state, basis, idempotency_key)
select s.id, date '2026-09-16', 'unavailable',
       'No defensible public source for a Taiwanese free-float factor was found. TWSE publishes director and supervisor shareholding balances, and a list of holders above ten percent that carries names without percentages; TSMC appears in neither with a quantified block. Those are float inputs and not a float population -- strategic corporate holders, cross-holdings and government stakes are in no published list -- so any factor derived from them would be confidently wrong in an unknown direction. Recorded as unavailable rather than derived.',
       'float:tsmc:2026-09-16'
  from reference.securities s join reference.issuers i on i.id = s.issuer_id
 where i.issuer_key = 'tsmc';

-- The US position is different in kind and no better in result. EntityPublicFloat is an official
-- float measure from a primary source, and it is denominated in dollars at a fiscal date rather
-- than expressed as a factor. Converting it would mean dividing by a market capitalization at
-- that same date, which is a derivation the parent methodology has not authorised -- so the
-- figure is recorded as evidence on the row, and the state stays unavailable.
insert into pipeline.float_observations
  (security_id, effective_date, float_state, basis, source_interface_id, permission_grant_id,
   source_payload, idempotency_key)
select s.id, v.eff, 'unavailable', v.basis,
       '5e000000-0000-4000-8000-000000000108', '5e000000-0000-4000-8000-000000000208',
       v.payload, v.key
  from (values
    ('nvidia', date '2025-07-25',
     'No free-float factor is published for US listings by any rights-cleared source. The SEC does publish dei:EntityPublicFloat -- the aggregate market value of common equity held by non-affiliates, USD 4,000,000,000,000 as of 25 July 2025 -- which is a genuine official float measure, but it is a currency amount at one fiscal date rather than a factor. Deriving a factor would require dividing by a market capitalization at that same date, which the parent methodology does not authorise. Non-affiliate is also not the same concept as free float: it excludes officers, directors and ten-percent holders, and includes strategic corporate holders that an index would usually remove.',
     '{"concept": "dei:EntityPublicFloat", "val": 4000000000000, "unit": "USD", "end": "2025-07-25", "filed": "2026-02-25", "form": "10-K"}'::jsonb,
     'float:nvidia:2025-07-25'),
    ('palantir-technologies', date '2025-06-30',
     'Same position as every other US listing: no rights-cleared source publishes a free-float factor. dei:EntityPublicFloat is USD 299,300,000,000 as of 30 June 2025, which is float evidence in currency and not a factor. Palantir additionally has multiple share classes, so even a derived factor would need a per-class share count that the flat XBRL API does not expose.',
     '{"concept": "dei:EntityPublicFloat", "val": 299300000000, "unit": "USD", "end": "2025-06-30", "filed": "2026-02-17", "form": "10-K"}'::jsonb,
     'float:palantir:2025-06-30')
  ) as v(issuer_key, eff, basis, payload, key)
  join reference.issuers i on i.issuer_key = v.issuer_key
  join reference.securities s on s.issuer_id = i.id;

-- --------------------------------------------------------------------- accessibility

-- Taiwan operates a foreign-investor regime and TWSE publishes foreign and mainland holding
-- ratios by sector and a top-twenty table -- neither of which is a per-security limit or a
-- per-security usage figure. So nothing is established for TSMC, and an unknown accessibility
-- carries no figures: the schema refuses to let this row imply "unrestricted".
insert into pipeline.accessibility_observations
  (security_id, effective_date, accessibility_state, basis, idempotency_key)
select s.id, date '2026-09-16', 'unknown',
       'TWSE publishes foreign and mainland-investor holding ratios by sector and a top-twenty aggregate table. Neither establishes a per-security foreign ownership limit nor a per-security current holding, which is what an accessibility adjustment would need. Recorded as unknown, carrying no figures -- an unknown accessibility must never read as unrestricted.',
       'access:tsmc:2026-09-16'
  from reference.securities s join reference.issuers i on i.id = s.issuer_id
 where i.issuer_key = 'tsmc';

-- US listings: a search found no statutory or exchange foreign-ownership limit applying to these
-- issuers. That is a finding rather than an absence, and it is a different state from 'unknown'.
insert into pipeline.accessibility_observations
  (security_id, effective_date, accessibility_state, basis, idempotency_key)
select s.id, date '2026-09-17', 'no_limit_evidenced',
       'No statutory, exchange or charter foreign-ownership limit was located for this issuer. US listed equities of this kind are not subject to a sectoral foreign ownership cap of the sort that applies in some markets. Distinguished from unknown: a search was performed and found nothing, which is a weaker claim than a positive grant of unrestricted access but a stronger one than silence.',
       'access:' || i.issuer_key || ':2026-09-17'
  from reference.securities s join reference.issuers i on i.id = s.issuer_id
 where i.issuer_key in ('nvidia', 'palantir-technologies');

-- ----------------------------------------------------------------- corporate actions

-- TSMC's cash dividend, from the venue's own ex-rights and ex-dividend notice table. The ex-date
-- is the date the notice is keyed to; TWSE's table carries no record or payment date, and those
-- columns stay null rather than being guessed from convention.
insert into pipeline.corporate_actions
  (issuer_id, security_id, action_type, action_state, ex_date,
   cash_amount, cash_currency, terms,
   source_interface_id, permission_grant_id, attribution, source_payload, idempotency_key, notes)
select i.id, s.id, 'cash_dividend', 'effective', date '2026-09-16',
       7.000001, 'TWD',
       '{"per_share_amount": "7.000001", "currency": "TWD", "exdividend_marker": "息", "stock_dividend_ratio": null, "subscription_ratio": null}'::jsonb,
       '5e000000-0000-4000-8000-000000000110', '5e000000-0000-4000-8000-000000000210',
       g.attribution_text,
       '{"Date": "1150916", "Code": "2330", "Name": "台積電", "Exdividend": "息", "CashDividend": "7.000001", "StockDividendRatio": "", "SubscriptionRatio": ""}'::jsonb,
       'twse:ca:2330:cash_dividend:2026-09-16',
       'Recorded, not applied. The Phase 5.3 price observations for this security are raw official closes and this dividend does not and must not alter them; a later total-return calculation reads both.'
  from reference.issuers i
  join reference.securities s on s.issuer_id = i.id
  cross join reference.permission_grants g
 where i.issuer_key = 'tsmc' and g.id = '5e000000-0000-4000-8000-000000000210';
