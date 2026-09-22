-- UMPI Phase 4: bind Series B to the aggregate-by-item Customs operation.
--
-- ## What this corrects
--
-- Phase 3 bound UMPI-KR-DRAM-EXPORT-UV to data.go.kr dataset **15100475**
-- (관세청_품목별 **국가별** 수출입실적, `nitemtrade/getNitemtradeList`). Phase 4 read both
-- operations' official descriptions and confirmed both routes resolve:
--
--   * **15100475** — "국가 및 HS Code별 기준으로 집계한 **국가별** 품목별 수출입무역통계":
--     aggregated by country AND HS code, with `cntyCd` a required request parameter.
--   * **15101609** — "HS Code(2단위, 4단위, 6단위, 10단위)기준으로 집계한 품목별 수출입무역통계":
--     aggregated **by HS code**, no country dimension.
--
-- Series B measures Korea's **total** monthly exports of HSK 8542321010. The country-dimension
-- operation cannot answer that in one call. It would leave two options, both wrong: request a
-- single `cntyCd` and publish one trading partner as though it were Korea, or request many and
-- sum rows with no documented aggregate code to reconcile against and no way to know whether a
-- total row is already among them. Either produces a number that looks like Korean exports and
-- is not, which is the specific failure mode this product cannot afford.
--
-- ## Why this is the smallest possible change
--
-- The methodology names the commodity (HSK 8542321010) and the fields (expDlr over expWgt). It
-- does **not** name a dataset, so nothing in `docs/methodology/umpi-kr-dram.md` changes. Phase 3
-- already registered 15101609 as the interface `kcs-item-trade-gw` with its rights reviewed, so
-- no new interface and no new rights review is needed either. One row moves.
--
-- ## Why this is an in-place correction rather than a superseding row
--
-- No observation was ever collected under the old binding — Phase 3 ingested nothing — so there
-- is no history to preserve and nothing that was measured under the country-dimension identity.
-- This is a registration error being corrected before first use, not a change of source over
-- time. The guard below makes that claim checkable rather than assumed: if any observation
-- exists for Series B, the migration aborts instead of rewriting the identity beneath it.

do $$
declare
  n            integer;
  series       uuid;
  aggregate_if uuid;
begin
  select id into series from reference.umpi_series where series_code = 'UMPI-KR-DRAM-EXPORT-UV';
  if series is null then raise exception 'UMPI-KR-DRAM-EXPORT-UV is not registered'; end if;

  select id into aggregate_if from reference.source_interfaces where slug = 'kcs-item-trade-gw';
  if aggregate_if is null then raise exception 'the aggregate-by-item Customs interface is not registered'; end if;

  -- The guard. Rewriting a source identity under existing evidence would silently change what
  -- every stored observation claims to be.
  select count(*) into n from pipeline.umpi_observations o
    join reference.umpi_source_series ss on ss.id = o.source_series_id
   where ss.series_id = series;
  if n <> 0 then
    raise exception 'Series B already has % observation(s); its source identity may not be rewritten in place', n;
  end if;

  update reference.umpi_source_series
     set source_interface_id = aggregate_if,
         dataset_id = '15101609',
         notes = 'Aggregate by HS code, no country dimension: one row per month for HSK 8542321010. '
              || 'Corrected from dataset 15100475 in Phase 4, which is the country-dimension operation '
              || '(cntyCd required) and cannot produce a Korea-wide total in one call. Export side only: '
              || 'expDlr is declared FOB USD; import value is CIF and is never used in the ratio.'
   where series_id = series;

  select count(*) into n from reference.umpi_source_series
   where series_id = series and dataset_id = '15101609';
  if n <> 1 then raise exception 'expected exactly one Series B identity on dataset 15101609, found %', n; end if;
end $$;

-- The public-display purposes were recorded in Phase 3 against the country-dimension interface,
-- because that was the one Series B read. They belong to the interface actually used. The Phase 3
-- determinations are left in place rather than deleted: they remain accurate statements about
-- dataset 15100475's terms, which have not changed.

insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, terms_document_url, decisive_clause,
   reviewed_by, reviewed_on, effective_from, notes)
select i.id, p.purpose_code, 'clearly_reusable', 'permitted',
       true, p.attribution_text, p.conditions,
       'https://www.data.go.kr/data/15101609/openapi.do', '이용허락범위 제한 없음',
       'UMPI Phase 4 Customs aggregation review', date '2026-09-22', timestamptz '2026-09-22 00:00:00+00',
       p.notes
from (values
  ('public_official_series_display', 'Source: Korea Customs Service', null,
   'The agency''s own declared export value and weight for HSK 8542321010.'),
  ('public_derived_index_display', 'Source: Korea Customs Service, HSK 8542321010',
   'The published value is a Urdais unit-value index, never presented as an official price.',
   'Covers the rebased index and the Urdais MoM computed from it.')
) as p(purpose_code, attribution_text, conditions, notes)
join reference.source_interfaces i on i.slug = 'kcs-item-trade-gw';

do $$
declare n integer; ds text;
begin
  select ss.dataset_id into ds
    from reference.umpi_source_series ss
    join reference.umpi_series s on s.id = ss.series_id
   where s.series_code = 'UMPI-KR-DRAM-EXPORT-UV';
  if ds is distinct from '15101609' then
    raise exception 'Series B is bound to dataset %, expected the aggregate-by-item 15101609', ds;
  end if;

  -- Series B must be able to display both its inputs and its derived index.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces i on i.id = sup.source_interface_id
   where i.slug = 'kcs-item-trade-gw'
     and sup.purpose_code in ('public_official_series_display', 'public_derived_index_display')
     and sup.disposition = 'permitted' and sup.attribution_required;
  if n <> 2 then raise exception 'the aggregate Customs interface lacks its public-display determinations, found %', n; end if;

  -- Still nothing ingested and nothing published.
  select count(*) into n from pipeline.umpi_observations;
  if n <> 0 then raise exception 'this migration must not create observations'; end if;
end $$;
