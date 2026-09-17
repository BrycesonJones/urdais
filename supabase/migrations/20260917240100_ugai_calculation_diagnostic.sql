-- The first calculation attempt, and why there is no index.
--
-- Recorded rather than discarded, for the same reason the snapshot diagnostic is: "UGAI cannot be
-- calculated from the currently available inputs" is this engine's answer, and an answer with its
-- reasons attached is worth more than an empty table.
--
-- Nothing is initialized. No divisor row exists, no index shares exist, the base date is unset,
-- and it must stay unset: the methodology sets the base date at "the date of UGAI's first live
-- published observation", so initializing it now would date the series from a day nothing was
-- published. The base level of 1,000 is not a starting value waiting to be written down; it is
-- the definition of the first published level, and there has not been one.

-- ------------------------------------------------------------ the methodology itself
--
-- UGAI's own methodology had never been registered. Phases 5.1 to 5.6 all referenced the parent
-- universe -- which is the document that governs eligibility, weighting and the issuer cap -- and
-- nothing had yet needed to cite the index methodology itself. A calculation does: the level, the
-- divisor rule and the base convention are all defined here and not in the parent, so a
-- calculation that could not name its own methodology version would be unreproducible.

insert into reference.methodologies (slug, name, document_path) values
  ('ugai', 'Urdais Global AI Index', 'docs/methodology/ugai.md')
on conflict (slug) do nothing;

insert into reference.methodology_versions
  (methodology_id, version, status, document_path, content_hash)
select m.id, '0.2.0-draft', 'draft', 'docs/methodology/ugai.md',
       'a7e3eba2861507ab8cb833f44d3dac77a050a62465871da02c40dcfe02a53a41'
  from reference.methodologies m where m.slug = 'ugai'
on conflict (methodology_id, version) do nothing;

insert into pipeline.ugai_calculations
  (id, calculation_date, state, methodology_version_id, snapshot_id, block_reason, notes)
select 'e0000000-0000-4000-8000-000000000001', date '2026-09-17', 'blocked',
       mv.id, s.id,
       'No UGAI level can be calculated. The basket does not exist and the arithmetic never begins: the only universe snapshot is blocked, so there is no effective constituent set; no index shares have been set, because setting them requires a production-eligible snapshot and the implementation close of a reset that has no approved calendar; and no divisor exists, because the base divisor is MV_base / 1000 and MV_base needs a basket. Each of the five snapshot blockers is inherited unchanged -- a draft issuer cap, cap infeasibility at two eligible issuers, no rights-cleared price for either of them, no established free-float factor anywhere, and an unresolved reconstitution calendar -- and this phase adds two of its own: UGAI''s FX fixing convention is unresolved, so no rule designates which daily rate a calculation takes, and the stale-input tolerance that decides whether an observation publishes as delayed is unresolved too.',
       'A development run against the real state. The base date is deliberately unset and no divisor was initialized; the engine''s arithmetic is proven against isolated fixtures in supabase/tests/370, inside a transaction that rolls back.'
  from reference.methodology_versions mv
  join reference.methodologies m on m.id = mv.methodology_id and m.slug = 'ugai'
  left join pipeline.universe_snapshots s on s.id = 'd0000000-0000-4000-8000-000000000001'
 where mv.version = '0.2.0-draft';

-- Publication readiness, check by check. Several fail, several cannot be assessed, and two wait
-- on parameters -- which is the distinction the four-outcome model exists to preserve. A single
-- boolean here would say "not publishable" and lose every reason why.

insert into pipeline.ugai_publication_checks
  (calculation_id, check_name, result, parameter_key, basis)
values
  ('e0000000-0000-4000-8000-000000000001', 'production_snapshot_valid', 'failed', null,
   'The only universe snapshot is blocked. Five independent blockers, each sufficient on its own, and none of them an engineering gap this phase could close.'),
  ('e0000000-0000-4000-8000-000000000001', 'divisor_valid', 'unavailable', null,
   'No divisor exists. The base divisor is MV_base / 1000 and MV_base requires a production-eligible basket, so this is downstream of the snapshot rather than a separate failure.'),
  ('e0000000-0000-4000-8000-000000000001', 'all_constituent_inputs_present', 'failed', null,
   'Neither eligible issuer has a rights-cleared price, and no free-float factor is established for any security, so no constituent could be valued even if a basket existed. The methodology''s missing-data rule permits carrying a close for a holiday, a stale session or a suspension, and none of those applies: there is no prior close to carry.'),
  ('e0000000-0000-4000-8000-000000000001', 'no_unresolved_corporate_action', 'passed', null,
   'The one recorded corporate action is TSMC''s ordinary cash dividend, whose treatment the methodology states explicitly -- no price or share adjustment, no divisor change, for a price index. It is not a member in any case. No action awaits a treatment decision.'),
  ('e0000000-0000-4000-8000-000000000001', 'methodology_parameters_approved', 'parameter_unresolved', 'issuer_cap',
   'The issuer cap is a draft parameter with no effective date. So are every investability minimum, the FX fixing convention, and the reconstitution calendar. A production calculation cannot rest on any of them.'),
  ('e0000000-0000-4000-8000-000000000001', 'stale_input_tolerance', 'parameter_unresolved', 'stale_input_tolerance',
   'The methodology defines a stale observation and says an observation publishes as delayed when stale inputs exceed a tolerance -- and states that the tolerance, by count and by weight, is unresolved. Without it there is no rule for classifying a publishable level as delayed, which is a publication question rather than a calculation one.'),
  ('e0000000-0000-4000-8000-000000000001', 'source_rights_permit_publication', 'failed', null,
   'Nasdaq refuses collection, storage, derivative works and products based on its content, and both eligible issuers list there. The level itself would be Urdais''s own derived output and publishable in principle -- the methodology is explicit that the public layer is never licensed market data -- but there is no lawful path to the inputs that would produce it.'),
  ('e0000000-0000-4000-8000-000000000001', 'attribution_available', 'passed', null,
   'The credits that would be owed are recorded and renderable: the Taiwan Open Government Data License for TWSE prices and CBC exchange rates, and the ECB citation for euro reference rates. This check passes today and would need re-checking against whatever US source eventually supplies prices.'),
  ('e0000000-0000-4000-8000-000000000001', 'lineage_complete', 'unavailable', null,
   'There is no calculation to trace. Assessable only once a level exists.');
