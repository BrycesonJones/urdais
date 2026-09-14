-- UCPI-H100-SXM-LISTED 0.1.1-draft: seller legal identity is a participation
-- requirement, not a disclosure.
--
-- Review of the first candidate (five participants, 3.99) found that Nebius
-- could not be shown to be one legal seller. Its Services Agreement
-- (https://docs.nebius.com/legal/agreement, effective 26 June 2026, retrieved
-- 2026-09-14) assigns the contracting entity by customer jurisdiction:
--   "for Customers who registered on the Platform after November 13th, 2025,
--    the contracting entity under this Agreement is Nebius Inc." (United States)
--   "for Customers who registered on the Platform on or after March 11, 2026,
--    the contracting entity under this Agreement is Nebius Israel Ltd" (Israel)
--   otherwise "the contracting entity under this Agreement is Nebius B.V."
-- Its Terms of Use (https://docs.nebius.com/legal/terms-of-use, dated 31 March
-- 2025) name Nebius B.V. alone. A provider-wide listed price that cannot be
-- tied to one contracting entity has no single legal seller behind it, and the
-- family counts sellers by legal identity.
--
-- The 0.1.0-draft text allowed an unevidenced legal identity with disclosure.
-- That was the flaw; 0.1.1-draft excludes it. The earlier observations and
-- assessments stay current under 0.1.0-draft (raw never changes, and an
-- interpretation under a version is a fact about that version); the same raw
-- offers are re-interpreted under 0.1.1-draft, and only 0.1.1-draft carries the
-- candidate. Nebius's legal_name stays null: nothing here asserts an identity.

insert into reference.exclusion_reasons (code, stage, category, description) values
  ('SELLER_LEGAL_IDENTITY_UNRESOLVED', 'P1', 'identity',
   'The seller''s contracting legal entity is not established, or varies by customer jurisdiction so that one listed price cannot be tied to one legal seller. Seller identity is legal identity; a seller that cannot be shown distinct is not counted.');

update reference.market_entities
   set notes = 'No single contracting legal entity behind the provider-wide listed price. Services Agreement (docs.nebius.com/legal/agreement, effective 26 June 2026, retrieved 2026-09-14): "for Customers who registered on the Platform after November 13th, 2025, the contracting entity under this Agreement is Nebius Inc." (US); "for Customers who registered on the Platform on or after March 11, 2026, the contracting entity under this Agreement is Nebius Israel Ltd" (Israel); otherwise "the contracting entity under this Agreement is Nebius B.V.". Terms of Use (dated 31 March 2025) name Nebius B.V. alone. Excluded from UCPI-H100-SXM-LISTED as SELLER_LEGAL_IDENTITY_UNRESOLVED until the listed price can be tied to one contracting entity. Per-GPU-hour HGX H100 on-demand listing (Phase 1 research, 12 September 2026).'
 where slug = 'nebius' and legal_name is null;

insert into reference.instrument_spec_versions (id, instrument_id, methodology_version_id, version, status, document_path, content_hash) values
  ('22222222-0000-4000-8000-000000000202', '22222222-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000112',
   '0.1.1-draft', 'draft', 'docs/methodology/ucpi-h100-sxm-listed.md', 'f59dadf97e60e49fbfeab642666539aa850e38293443c4f2713e9bcabeda333c');

do $$
declare n integer;
begin
  select count(*) into n from reference.market_entities where slug = 'nebius' and legal_name is not null;
  if n <> 0 then raise exception 'a legal name was asserted for Nebius without evidence'; end if;
  select count(*) into n from reference.instrument_spec_versions where instrument_id = '22222222-0000-4000-8000-000000000002' and status <> 'draft';
  if n <> 0 then raise exception 'a sibling version left draft status'; end if;
  select count(*) into n from pipeline.regional_publications;
  if n <> 0 then raise exception 'a publication exists'; end if;
end
$$;
