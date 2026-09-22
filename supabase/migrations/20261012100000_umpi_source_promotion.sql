-- UMPI Phase 4A: promote both sources to production_approved, on evidence.
--
-- Phase 3 left both interfaces at `research_usable` and the Phase 3 test asserted that no
-- migration could promote them, on the reasoning that a collector earns production approval and
-- a migration does not. The collector has now earned it. Against the live services on
-- 22 September 2026, with no credential of Urdais's own:
--
--   Bank of Korea, 404Y016 / 30911201AA / M, 2026-06..08
--     run 1: 3 received, 3 inserted, idempotence_state = changed
--     run 2: 3 received, 0 inserted, 3 unchanged, no_change, same payload digest, same run row,
--            a second retrieval row
--     stored levels 496.84, 538.74, 553.02 at 2020=100
--
--   Korea Customs, HSK 8542321010 by-item, 2026-06..08
--     run 1: 4 received, 3 inserted, 1 rejected (the 총계 summary row), changed
--     run 2: 4 received, 0 inserted, 3 unchanged, 1 rejected, no_change, same digest
--     stored 11,175,623,000 / 13,551,552,000 / 15,733,149,000 USD against 149,633 / 155,818 /
--     177,730 kg — the thousand-USD conversion applied once, at parse
--
-- Every observation carries its source_retrieval_id. No publication, index base or MoM exists.
--
-- **The BOK rights posture is unchanged by this promotion.** Its determinations stay
-- `ambiguous_requires_legal_review` with the founder-accepted-risk marker and the open question
-- recorded. Production approval is an operational state about whether collection works; it is
-- not a rights finding, and promoting the interface must not be readable as resolving the
-- ambiguity. The assertion at the foot of this migration enforces exactly that.

update reference.source_interfaces
   set production_access_state = 'production_approved',
       notes = notes || ' Promoted to production_approved on 22 September 2026 after a live narrow '
            || 'smoke and an exact rerun that wrote zero new observations.'
 where slug in ('bok-ecos-producer-price-commodity', 'kcs-item-trade-gw');

do $$
declare n integer;
begin
  select count(*) into n from reference.source_interfaces
   where slug in ('bok-ecos-producer-price-commodity', 'kcs-item-trade-gw')
     and production_access_state = 'production_approved';
  if n <> 2 then raise exception 'expected both UMPI sources promoted, found %', n; end if;

  -- The schema already refuses approval without permitted terms on both axes; assert it held
  -- rather than assuming the update was allowed for the right reason.
  select count(*) into n from reference.source_interfaces
   where slug in ('bok-ecos-producer-price-commodity', 'kcs-item-trade-gw')
     and (terms_review_state <> 'permitted' or data_use_terms_state <> 'permitted');
  if n <> 0 then raise exception 'a UMPI source was promoted without permitted terms on both axes'; end if;

  -- The ambiguity survives the promotion. This is the assertion that stops a future reader --
  -- or a future migration -- from treating "production_approved" as "rights resolved".
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces si on si.id = sup.source_interface_id
   where si.slug = 'bok-ecos-producer-price-commodity'
     and sup.effective_to is null
     and sup.rights_classification = 'ambiguous_requires_legal_review'
     and sup.notes = 'founder_accepted_risk';
  if n <> 4 then
    raise exception 'the BOK founder-accepted ambiguity was lost during promotion, found % open determinations', n;
  end if;

  -- The Customs interface carries no ambiguity and should not acquire one.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces si on si.id = sup.source_interface_id
   where si.slug = 'kcs-item-trade-gw'
     and sup.effective_to is null
     and sup.rights_classification = 'ambiguous_requires_legal_review';
  if n <> 0 then raise exception 'the Customs interface acquired an ambiguous determination'; end if;

  -- Promotion is not publication. Nothing downstream exists yet.
  select count(*) into n from pipeline.umpi_publications;
  if n <> 0 then raise exception 'promotion created % publication(s)', n; end if;
  select count(*) into n from pipeline.umpi_index_bases;
  if n <> 0 then raise exception 'promotion created % index base(s)', n; end if;
end $$;
