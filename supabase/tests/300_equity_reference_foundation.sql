-- UGAI equity reference foundation, and the extended rights model it depends on.
--
-- The shapes tested here are the ones the methodology would be unable to express if they were
-- wrong: one issuer with several securities and several listings, a depositary receipt tied to
-- its underlying within one issuer, identifiers that move without taking identity with them,
-- and a rights grant that cannot simultaneously promise retention and oblige deletion.
begin;

do $$
declare
  ok boolean;
  n integer;
  v_xnas uuid; v_xhkg uuid;
  i_acme uuid; i_other uuid;
  s_ord uuid; s_adr uuid; s_classb uuid; s_other_ord uuid;
  g_iface uuid; g_id uuid;
begin
  -- ------------------------------------------------------------------ fixtures

  insert into reference.venues (mic, name, country_code, default_currency, timezone, support_state)
    values ('XNAS', 'Nasdaq Stock Market', 'US', 'USD', 'America/New_York', 'supported')
    returning id into v_xnas;
  insert into reference.venues (mic, name, country_code, default_currency, timezone, support_state)
    values ('XHKG', 'Hong Kong Stock Exchange', 'HK', 'HKD', 'Asia/Hong_Kong', 'research')
    returning id into v_xhkg;

  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('acme-ai', 'Acme AI Limited', 'KY') returning id into i_acme;
  insert into reference.issuers (issuer_key, canonical_name, domicile_country)
    values ('other-co', 'Other Co', 'US') returning id into i_other;

  insert into reference.securities (issuer_id, security_type, denomination_currency)
    values (i_acme, 'ordinary_share', 'HKD') returning id into s_ord;
  insert into reference.securities
      (issuer_id, security_type, is_depositary_receipt, receipt_ratio_numerator, receipt_ratio_denominator)
    values (i_acme, 'depositary_receipt', true, 8, 1) returning id into s_adr;
  insert into reference.securities (issuer_id, security_type, share_class)
    values (i_acme, 'ordinary_share', 'B') returning id into s_classb;
  insert into reference.securities (issuer_id, security_type)
    values (i_other, 'ordinary_share') returning id into s_other_ord;

  -- ------------------------------------- one issuer, several securities, several listings

  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from, is_primary)
    values (s_ord, v_xhkg, '9999', 'HKD', date '2020-01-01', true);
  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
    values (s_adr, v_xnas, 'ACME', 'USD', date '2021-06-01');

  select count(*) into n from reference.securities where issuer_id = i_acme;
  if n <> 3 then raise exception 'expected 3 securities for one issuer, found %', n; end if;

  select count(*) into n
    from reference.listings l join reference.securities s on s.id = l.security_id
   where s.issuer_id = i_acme;
  if n <> 2 then raise exception 'expected 2 listings across the issuer, found %', n; end if;

  -- ------------------------------------------------- receipt ratio is required, and only for receipts

  ok := false;
  begin
    insert into reference.securities (issuer_id, security_type, is_depositary_receipt)
      values (i_acme, 'depositary_receipt', true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a depositary receipt was accepted without a ratio'; end if;

  ok := false;
  begin
    insert into reference.securities (issuer_id, security_type, receipt_ratio_numerator, receipt_ratio_denominator)
      values (i_acme, 'ordinary_share', 2, 1);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a non-receipt was accepted with a receipt ratio'; end if;

  -- The flag and the type may not disagree.
  ok := false;
  begin
    insert into reference.securities (issuer_id, security_type, is_depositary_receipt)
      values (i_acme, 'ordinary_share', true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'the receipt flag was allowed to contradict the security type'; end if;

  -- --------------------------------------------------- ADR relationship, and its same-issuer rule

  insert into reference.security_relationships
      (from_security_id, to_security_id, relationship_type, effective_from)
    values (s_adr, s_ord, 'depositary_receipt_of', date '2021-06-01');

  -- A receipt of another company's share would let one company enter a universe twice.
  ok := false;
  begin
    insert into reference.security_relationships
        (from_security_id, to_security_id, relationship_type, effective_from)
      values (s_adr, s_other_ord, 'depositary_receipt_of', date '2021-06-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a depositary receipt was linked across issuers'; end if;

  -- The edge runs receipt -> underlying, never the reverse.
  ok := false;
  begin
    insert into reference.security_relationships
        (from_security_id, to_security_id, relationship_type, effective_from)
      values (s_ord, s_adr, 'depositary_receipt_of', date '2021-06-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a depositary receipt edge was accepted in the wrong direction'; end if;

  -- Sibling classes are same-issuer and neither side is a receipt.
  insert into reference.security_relationships
      (from_security_id, to_security_id, relationship_type, effective_from)
    values (s_ord, s_classb, 'share_class_sibling_of', date '2020-01-01');

  ok := false;
  begin
    insert into reference.security_relationships
        (from_security_id, to_security_id, relationship_type, effective_from)
      values (s_adr, s_classb, 'share_class_sibling_of', date '2021-06-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a receipt was accepted as a share class sibling'; end if;

  -- Succession is the one type permitted to cross issuers.
  insert into reference.security_relationships
      (from_security_id, to_security_id, relationship_type, effective_from)
    values (s_other_ord, s_ord, 'successor_of', date '2024-01-01');

  ok := false;
  begin
    insert into reference.security_relationships
        (from_security_id, to_security_id, relationship_type, effective_from)
      values (s_ord, s_ord, 'depositary_receipt_of', date '2021-06-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a security was related to itself'; end if;

  -- --------------------------------------------------------------- listing uniqueness rules

  -- At most one current primary listing per security.
  ok := false;
  begin
    insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from, is_primary)
      values (s_ord, v_xnas, 'ACMEORD', 'USD', date '2022-01-01', true);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'a second current primary listing was accepted'; end if;

  -- A venue and ticker identify at most one current line.
  ok := false;
  begin
    insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
      values (s_classb, v_xnas, 'acme', 'USD', date '2022-01-01');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'a duplicate current ticker was accepted on one venue'; end if;

  -- A closed interval frees the ticker: the historical row stays true of its own interval.
  update reference.listings set effective_to = date '2023-01-01'
   where security_id = s_adr and venue_id = v_xnas;
  insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from)
    values (s_classb, v_xnas, 'ACME', 'USD', date '2023-01-02');

  -- Effective intervals are ordered.
  ok := false;
  begin
    insert into reference.listings (security_id, venue_id, ticker, price_currency, effective_from, effective_to)
      values (s_classb, v_xhkg, '8888', 'HKD', date '2024-01-01', date '2023-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a listing ended before it began'; end if;

  -- --------------------------------------------------------------------- identifiers

  insert into reference.security_identifiers
      (security_id, identifier_type, identifier_value, effective_from)
    values (s_ord, 'isin', 'KYG0000L1234', date '2020-01-01');
  insert into reference.security_identifiers
      (security_id, identifier_type, identifier_value, effective_from)
    values (s_ord, 'figi', 'BBG000BLNNH6', date '2020-01-01');

  -- One ISIN identifies one security.
  ok := false;
  begin
    insert into reference.security_identifiers
        (security_id, identifier_type, identifier_value, effective_from)
      values (s_classb, 'isin', 'KYG0000L1234', date '2021-01-01');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'one ISIN was attached to two securities'; end if;

  -- Malformed identifiers are rejected by shape.
  ok := false;
  begin
    insert into reference.security_identifiers
        (security_id, identifier_type, identifier_value, effective_from)
      values (s_classb, 'isin', 'NOTANISIN', date '2021-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a malformed ISIN was accepted'; end if;

  ok := false;
  begin
    insert into reference.security_identifiers
        (security_id, identifier_type, identifier_value, effective_from)
      values (s_classb, 'figi', 'XXX000BLNNH6', date '2021-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a malformed FIGI was accepted'; end if;

  -- A FIGI shared across securities is permitted: share-class and composite FIGIs are shared
  -- by design, and a uniqueness rule there would reject correct data.
  insert into reference.security_identifiers
      (security_id, identifier_type, identifier_value, effective_from)
    values (s_classb, 'share_class_figi', 'BBG001S5N8V8', date '2020-01-01');
  insert into reference.security_identifiers
      (security_id, identifier_type, identifier_value, effective_from)
    values (s_ord, 'share_class_figi', 'BBG001S5N8V8', date '2020-01-01');

  -- --------------------------------------------------------------------- issuer status

  ok := false;
  begin
    insert into reference.issuers (issuer_key, canonical_name, status)
      values ('gone-co', 'Gone Co', 'inactive');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an inactive issuer was accepted without an end date'; end if;

  ok := false;
  begin
    insert into reference.issuers (issuer_key, canonical_name, status, active_to)
      values ('still-here', 'Still Here', 'active', date '2024-01-01');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an active issuer was accepted with an end date'; end if;

  -- The issuer key is Urdais's own, and is slug-shaped.
  ok := false;
  begin
    insert into reference.issuers (issuer_key, canonical_name) values ('Not A Slug', 'x');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a malformed issuer key was accepted'; end if;

  -- --------------------------------------------------------------------------- venues

  ok := false;
  begin
    insert into reference.venues (mic, name, country_code, default_currency, timezone, support_state, rights_state)
      values ('XTAI', 'Taiwan Stock Exchange', 'TW', 'TWD', 'Asia/Taipei', 'supported', 'not_permitted');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a venue was supported while its rights forbid it'; end if;

  ok := false;
  begin
    insert into reference.venues (mic, name, country_code, default_currency, timezone)
      values ('xnas', 'lowercase mic', 'US', 'USD', 'America/New_York');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a malformed MIC was accepted'; end if;

  -- ------------------------------------------------------------------- extended rights model

  select id into g_iface from reference.source_interfaces limit 1;
  if g_iface is null then raise exception 'no source interface available for the rights fixture'; end if;

  -- A grant may not promise post-termination retention and oblige deletion of everything.
  ok := false;
  begin
    insert into reference.permission_grants
        (source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
         covers_post_termination_retention, termination_obligation, effective_from, evidence)
      values (g_iface, 'agreement', 'contradictory', true, true,
              true, 'delete_all', now(), 'test');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a grant promised retention and obliged deletion at once'; end if;

  -- A level that may not be calculated may not be published.
  ok := false;
  begin
    insert into reference.permission_grants
        (source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
         covers_index_calculation, covers_index_level_publication, effective_from, evidence)
      values (g_iface, 'agreement', 'publish-without-calculate', true, true,
              false, true, now(), 'test');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'index level publication was allowed without calculation rights'; end if;

  -- Constituents and weights presuppose the level.
  ok := false;
  begin
    insert into reference.permission_grants
        (source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
         covers_index_calculation, covers_index_level_publication, covers_weight_publication,
         effective_from, evidence)
      values (g_iface, 'agreement', 'weights-without-level', true, true,
              true, false, true, now(), 'test');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'weight publication was allowed without level publication'; end if;

  -- A coherent full-rights grant is accepted, and the venue scope is validated.
  insert into reference.permission_grants
      (source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
       covers_internal_use, covers_index_calculation, covers_storage, covers_historical_retention,
       covers_post_termination_retention, covers_historical_reconstruction,
       covers_index_level_publication, covers_constituent_publication,
       covers_membership_change_publication, rights_layer, termination_obligation,
       covered_venues, effective_from, evidence, terms_document_hash)
    values (g_iface, 'agreement', 'coherent', true, true,
            true, true, true, true, true, true, true, true, true,
            'vendor', 'cease_use', array['XNAS', 'XHKG'], now(), 'test',
            repeat('a', 64))
    returning id into g_id;

  ok := false;
  begin
    update reference.permission_grants set covered_venues = array['TOOLONG'] where id = g_id;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a malformed MIC was accepted in covered_venues'; end if;

  ok := false;
  begin
    update reference.permission_grants set covered_venues = array[]::text[] where id = g_id;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'an empty venue scope was accepted'; end if;

  ok := false;
  begin
    update reference.permission_grants set terms_document_hash = 'nothex' where id = g_id;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a malformed terms document hash was accepted'; end if;

  -- The backfill mapped the legacy flag onto the precise one for every pre-existing grant.
  select count(*) into n
    from reference.permission_grants
   where covers_index_use and not covers_index_calculation;
  if n <> 0 then raise exception '% legacy grant(s) were not backfilled', n; end if;

  -- Defaults are conservative: a new grant establishes nothing it was not asked about.
  select count(*) into n
    from reference.permission_grants
   where reference = 'coherent'
     and not covers_raw_redistribution
     and not covers_weight_publication;
  if n <> 1 then raise exception 'rights defaults were not conservative'; end if;
end $$;

rollback;
