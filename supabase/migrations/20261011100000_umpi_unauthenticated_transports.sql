-- UMPI Phase 4A: record the two unauthenticated official transports, and the rights posture
-- of one of them.
--
-- Both approved sources were reachable only through an account whose registration requires
-- Korean identity verification. Phase 4A found official public paths to the same data:
--
--   * Bank of Korea  — the ECOS Open API answered with the Bank's own published demo key
--                      `sample`, returning the exact 404Y016 / 30911201AA / M series at
--                      2020=100, ten rows per call.
--   * Korea Customs  — the trade-statistics portal answers its own by-item query inside the
--                      public session its index page establishes. No login, no service key,
--                      and the result page carries 공공누리 제1유형.
--
-- The economic objects do not change. The commodity, the series identity, the units and the
-- cadence are exactly what Phase 2C froze; only the transport moves.

-- --------------------------------------------------------------- Customs: portal transport

do $$
declare n integer; iface uuid;
begin
  select id into iface from reference.source_interfaces where slug = 'kcs-item-trade-gw';
  if iface is null then raise exception 'the Customs interface is not registered'; end if;

  update reference.source_interfaces
     set canonical_url = 'https://tradedata.go.kr/cts/hmpg/retrieveTrade.do',
         access_class  = 'public_unauthenticated',
         notes = 'Korea Customs trade-statistics portal, 품목별 (by-item) monthly query for HSK 8542321010. '
              || 'GET /cts/index.do establishes the public session the portal UI itself uses, then '
              || 'POST /cts/hmpg/retrieveTrade.do returns JSON. No login and no data.go.kr service key. '
              || 'Weight is kg (ttwgTpcd=1; the form default is tonnes). Value is THOUSAND USD and is '
              || 'multiplied by 1000 on ingest. The response carries a 총계 row that is the sum of the '
              || 'monthly rows and is rejected, and cntyCd/cntyNm are present but empty.',
         metadata = metadata
           || jsonb_build_object(
                'transport', 'tradedata.go.kr retrieveTrade.do',
                'session_url', 'https://tradedata.go.kr/cts/index.do',
                'trade_kind', 'ETS_MNK_1020000A',
                'weight_unit', 'kg',
                'value_unit', 'thousand_usd',
                'value_scale_to_usd', 1000,
                'country_dimension', 'none',
                'api_key_env', null,
                'licence', '공공누리 제1유형 (출처표시)'
              )
   where id = iface;

  -- Close the determinations the previous transport rested on rather than deleting them: they
  -- remain accurate statements about the document they were read from, and the schema permits
  -- exactly one open determination per purpose.
  update reference.source_use_permissions
     set effective_to = timestamptz '2026-09-22 12:00:00+00'
   where source_interface_id = iface and effective_to is null;

  -- The rights determination is unchanged in substance: public data, attribution required.
  -- What changes is the document it rests on, because the transport moved.
  insert into reference.source_use_permissions
    (source_interface_id, purpose_code, rights_classification, disposition,
     attribution_required, attribution_text, conditions, terms_document_url, decisive_clause,
     reviewed_by, reviewed_on, effective_from, notes)
  select iface, p.purpose_code, 'reusable_with_attribution_or_conditions', 'permitted',
         true, 'Source: Korea Customs Service, 수출입무역통계, HSK 8542321010',
         'KOGL Type 1: attribution required; commercial use and derivative works permitted.',
         'https://tradedata.go.kr/cts/index.do', '공공누리 제1유형: 출처 표시 후 자유롭게 이용',
         'UMPI Phase 4A access-path research', date '2026-09-22', timestamptz '2026-09-22 12:00:00+00',
         p.notes
  from (values
    ('internal_retention', 'Portal transport; supersedes the data.go.kr determination for this interface.'),
    ('internal_calculation', 'Covers the unit-value calculation from kg and converted USD.'),
    ('public_official_series_display', 'The agency''s own declared export value and weight.'),
    ('public_derived_index_display', 'The Urdais unit-value index derived from them.')
  ) as p(purpose_code, notes);

  select count(*) into n from reference.source_use_permissions sup
   where sup.source_interface_id = iface and sup.effective_from = timestamptz '2026-09-22 12:00:00+00';
  if n <> 4 then raise exception 'expected four Customs portal determinations, found %', n; end if;
end $$;

-- ------------------------------------------- Bank of Korea: demo transport, ambiguity kept
--
-- The demo key returns the exact approved series without a personal credential. Whether a key
-- published for trying the API carries a standing production entitlement is **not documented**,
-- and this migration does not pretend otherwise.
--
-- The founder has reviewed that ambiguity and accepted the risk for production use. Accepting a
-- risk is not resolving it, so the classification stays `ambiguous_requires_legal_review` and
-- the acceptance is recorded beside it as its own fact, with its date and its reason. A later
-- reader can therefore see both that Urdais published under this, and that it knew what it was
-- publishing under.

do $$
declare n integer; iface uuid;
begin
  select id into iface from reference.source_interfaces where slug = 'bok-ecos-producer-price-commodity';
  if iface is null then raise exception 'the BOK interface is not registered'; end if;

  update reference.source_interfaces
     set access_class = 'public_unauthenticated',
         notes = 'ECOS StatisticSearch over 404Y016 / 30911201AA / M at 2020=100, retrieved with the '
              || 'Bank of Korea''s published demo key `sample`, ten rows per call, paginated on '
              || 'list_total_count. Registration for a personal key requires Korean identity '
              || 'verification. A registered key is honoured if UMPI_ECOS_API_KEY is ever set: it lifts '
              || 'the ten-row cap and retires the rights ambiguity recorded below.',
         metadata = metadata
           || jsonb_build_object(
                'transport', 'ECOS StatisticSearch, published demo key',
                'demo_key', 'sample',
                'demo_page_size', 10,
                'registered_page_size', 1000,
                'api_key_env', 'UMPI_ECOS_API_KEY',
                'api_key_optional', true,
                'rights_posture', 'ambiguous_requires_legal_review + founder_accepted_risk'
              )
   where id = iface;

  -- Close the determinations the previous transport rested on rather than deleting them: they
  -- remain accurate statements about the document they were read from, and the schema permits
  -- exactly one open determination per purpose.
  update reference.source_use_permissions
     set effective_to = timestamptz '2026-09-22 12:00:00+00'
   where source_interface_id = iface and effective_to is null;

  -- The determination that governs production use of the demo transport. Ambiguous by
  -- classification, permitted by an explicit accepted-risk decision, with the open question
  -- preserved in the field the schema reserves for exactly that.
  insert into reference.source_use_permissions
    (source_interface_id, purpose_code, rights_classification, disposition,
     attribution_required, attribution_text, conditions, unresolved_issue,
     terms_document_url, decisive_clause, reviewed_by, reviewed_on, effective_from, notes)
  select iface, p.purpose_code, 'ambiguous_requires_legal_review', 'permitted',
         true, 'Source: Bank of Korea',
         'Production use of the published demo key `sample`, accepted by the founder on 22 September 2026 '
         || 'with the ambiguity preserved rather than resolved. Attribution on every surface; the MoM is '
         || 'disclosed as a Urdais calculation.',
         'The official public demo credential returns the exact official series, but a standing production '
         || 'entitlement for that credential is not expressly documented by the Bank of Korea. The data grant '
         || 'itself is not in doubt: designated public data is freely usable with attribution. A registered '
         || 'ECOS key would retire this question entirely.',
         'https://www.bok.or.kr/portal/main/contents.do?menuNo=200228',
         '제공대상 공공데이터는 별도의 절차 없이 자유롭게 이용할 수 있습니다',
         'UMPI Phase 4A, founder-accepted risk', date '2026-09-22', timestamptz '2026-09-22 12:00:00+00',
         'founder_accepted_risk'
  from (values
    ('internal_retention'), ('internal_calculation'),
    ('public_official_series_display'), ('public_derived_index_display')
  ) as p(purpose_code);

  select count(*) into n from reference.source_use_permissions sup
   where sup.source_interface_id = iface
     and sup.rights_classification = 'ambiguous_requires_legal_review'
     and sup.disposition = 'permitted'
     and sup.notes = 'founder_accepted_risk'
     and sup.unresolved_issue is not null;
  if n <> 4 then raise exception 'expected four founder-accepted BOK determinations, found %', n; end if;
end $$;

-- ------------------------------------------------------------------------------ assertions

do $$
declare n integer; s text;
begin
  -- The economic objects are untouched.
  select ss.bok_stat_code || '/' || ss.bok_item_code || '/' || ss.bok_cycle into s
    from reference.umpi_source_series ss
    join reference.umpi_series se on se.id = ss.series_id
   where se.series_code = 'UMPI-KR-DRAM-PPI';
  if s is distinct from '404Y016/30911201AA/M' then raise exception 'Series A identity moved: %', s; end if;

  select ss.hs_code || '/' || ss.dataset_id into s
    from reference.umpi_source_series ss
    join reference.umpi_series se on se.id = ss.series_id
   where se.series_code = 'UMPI-KR-DRAM-EXPORT-UV';
  if s is distinct from '8542321010/15101609' then raise exception 'Series B identity moved: %', s; end if;

  -- The ambiguity is preserved, not laundered into a clean permission.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces si on si.id = sup.source_interface_id
   where si.slug = 'bok-ecos-producer-price-commodity'
     and sup.effective_from = timestamptz '2026-09-22 12:00:00+00'
     and sup.rights_classification <> 'ambiguous_requires_legal_review';
  if n <> 0 then raise exception 'a founder-accepted BOK determination was recorded as unambiguous'; end if;

  -- Still nothing ingested, and neither source is promoted by a migration.
  select count(*) into n from pipeline.umpi_observations;
  if n <> 0 then raise exception 'this migration must not create observations'; end if;
  select count(*) into n from reference.source_interfaces
   where (slug like 'bok-%' or slug like 'kcs-%') and production_access_state = 'production_approved';
  if n <> 0 then raise exception '% UMPI source(s) were promoted by a migration', n; end if;
end $$;
