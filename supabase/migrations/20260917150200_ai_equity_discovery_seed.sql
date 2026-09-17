-- The first AI Equity Universe review cycle: discovery seeds, real filings, and four
-- determinations that admit nobody.
--
-- The Phase 2E and 2F research produced a ledger of names with tiers and verdicts beside them.
-- That ledger seeds discovery here and nothing else. Every tier, every layer and every verdict
-- in this file is re-derived from a filing retrieved for this cycle, and where the filing does
-- not support the research ledger's conclusion, the filing wins. It does, twice.
--
-- The outcome is that no issuer is eligible. That is the system working rather than failing:
--
--   NVIDIA        pending              both Tier 2 prongs evidenced verbatim; the extraction
--                                      behind them is model-assisted and unverified by a human
--   Palantir      contested            the filing enumerates four platforms, two of which it
--                                      describes as data-operations software, and says the AI
--                                      platform is "seamlessly bundled" rather than separately
--                                      sold -- so E5 bites and E6 bars the brand from rescuing it
--   Salesforce    insufficient_evidence  the only AI-specific figure disclosed is an ARR
--                                      run-rate, which E8 bars from establishing anything
--   Baidu         pending              the offering is evidenced; the Route A scale metric sits
--                                      in a table that did not survive text extraction
--
-- Everything else is queued: discovered, not yet reviewed. A queued candidate with no review row
-- is an honest state, and inventing insufficient_evidence rows for issuers nobody has opened
-- would be a worse record than an empty one.
--
-- A note on who extracted this. The passages below were located by a language model, and their
-- presence in the cited bytes is mechanically checkable: each document's SHA-256 is recorded and
-- each passage appears verbatim in the document with that hash. What is not mechanically
-- checkable is the judgement that a passage satisfies a methodology test. So every claim here is
-- extraction_method 'model_assisted' and human_verification 'unverified', which the schema's own
-- constraint then forbids from being establishing evidence. Clearing that gate is a human's
-- signature, not a migration's.

-- --------------------------------------------------------- the methodology under review

insert into reference.methodologies (id, slug, name, document_path) values
  ('a1000000-0000-4000-8000-000000000001', 'ai-equity-universe',
   'Urdais AI Equity Universe', 'docs/methodology/ai-equity-universe.md')
on conflict (slug) do nothing;

insert into reference.methodology_versions
  (id, methodology_id, version, status, document_path, content_hash)
values
  ('a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   '0.3.0-draft', 'draft', 'docs/methodology/ai-equity-universe.md',
   '0b17d712105c0ecc7a45d24737c75dc03bc82265d6d9b9acc58d7e57089464b2')
on conflict (methodology_id, version) do nothing;

-- ------------------------------------------------------------ unresolved parameters

-- tau_B and the issuer cap are recorded as drafts because the methodology marks them unresolved.
-- A draft carries no effective date, and the eligibility trigger looks for an approved parameter
-- in force, so the presence of these rows admits nothing. They exist so the research candidate is
-- written down somewhere other than a comment, and so that approving one is a visible, dated,
-- attributed act rather than an edit.
insert into reference.methodology_parameters
  (methodology_version_id, parameter_key, numeric_value, status, rationale)
values
  ('a1000000-0000-4000-8000-000000000002', 'tau_b', 0.10, 'draft',
   'Tier 3 Route B materiality floor. UNRESOLVED. 10% is the current research candidate from Phase 2D/2E and has not been calibrated; the founder decision of 17 September 2026 was explicitly not to ship it as an active convention. While this row is draft it has no effective date, and pipeline.check_eligibility_review() refuses every Route B admission because no approved tau_b is in force.'),
  ('a1000000-0000-4000-8000-000000000002', 'issuer_cap', 0.10, 'draft',
   'Single-issuer weight cap c. UNRESOLVED. Phase 2F re-ran cap feasibility against the tiered framework and did not settle a value. Recorded as a draft candidate so that the parameter has an identity before it has a number.');

-- ----------------------------------------------------------------- the review cycle

-- A development cycle. pipeline.check_eligibility_review() will not let a determination from one
-- reach publication_state 'published', and review_cycles_development_never_approved will not let
-- the cycle itself be approved. Both are structural: this cycle cannot produce a live universe
-- however its rows are edited.
insert into reference.ai_universe_review_cycles
  (id, label, methodology_version_id, cycle_kind, status, evidence_cutoff, notes)
values
  ('a1000000-0000-4000-8000-000000000010', 'dev-2026-09',
   'a1000000-0000-4000-8000-000000000002', 'development', 'evidence_collection',
   timestamptz '2026-09-17T00:00:00Z',
   'First AI Equity Universe review cycle. Purpose is to exercise the discovery and evidence path end to end against real filings, not to produce a universe. Evidence cutoff 17 September 2026: a filing published after that instant is out of scope for this cycle even if it would change a determination.');

-- ------------------------------------------------------------------------- candidates

-- Discovery seeds. These names came from the Phase 2E and 2F research ledgers, and that is the
-- only thing they brought with them. domicile_country is country of incorporation, which is why
-- several China-operating issuers are recorded as Cayman Islands: the methodology warns against
-- reading a receipt or a holding structure as exposure to a geography, and recording the
-- incorporation honestly is what makes that warning checkable later.
insert into reference.issuers (issuer_key, canonical_name, domicile_country) values
  ('nvidia',                 'NVIDIA Corporation',                                     'US'),
  ('palantir-technologies',  'Palantir Technologies Inc.',                             'US'),
  ('salesforce',             'Salesforce, Inc.',                                       'US'),
  ('microsoft',              'Microsoft Corporation',                                  'US'),
  ('alphabet',               'Alphabet Inc.',                                          'US'),
  ('amazon-com',             'Amazon.com, Inc.',                                       'US'),
  ('meta-platforms',         'Meta Platforms, Inc.',                                   'US'),
  ('broadcom',               'Broadcom Inc.',                                          'US'),
  ('advanced-micro-devices', 'Advanced Micro Devices, Inc.',                           'US'),
  ('micron-technology',      'Micron Technology, Inc.',                                'US'),
  ('arista-networks',        'Arista Networks, Inc.',                                  'US'),
  ('marvell-technology',     'Marvell Technology, Inc.',                               'US'),
  ('super-micro-computer',   'Super Micro Computer, Inc.',                             'US'),
  ('vertiv-holdings',        'Vertiv Holdings Co',                                     'US'),
  ('coreweave',              'CoreWeave, Inc.',                                        'US'),
  ('c3-ai',                  'C3.ai, Inc.',                                            'US'),
  ('soundhound-ai',          'SoundHound AI, Inc.',                                    'US'),
  ('oracle',                 'Oracle Corporation',                                     'US'),
  ('tesla',                  'Tesla, Inc.',                                            'US'),
  ('tsmc',                   'Taiwan Semiconductor Manufacturing Company Limited',     'TW'),
  ('samsung-electronics',    'Samsung Electronics Co., Ltd.',                          'KR'),
  ('sk-hynix',               'SK hynix Inc.',                                          'KR'),
  ('asml-holding',           'ASML Holding N.V.',                                      'NL'),
  ('arm-holdings',           'Arm Holdings plc',                                       'GB'),
  ('baidu',                  'Baidu, Inc.',                                            'KY'),
  ('alibaba-group',          'Alibaba Group Holding Limited',                          'KY'),
  ('tencent-holdings',       'Tencent Holdings Limited',                               'KY'),
  ('sensetime-group',        'SenseTime Group Inc.',                                   'KY'),
  ('cambricon-technologies', 'Cambricon Technologies Corporation Limited',             'CN')
on conflict (issuer_key) do nothing;

insert into pipeline.issuer_candidates (review_cycle_id, issuer_id, review_state, notes)
select 'a1000000-0000-4000-8000-000000000010', i.id, 'queued',
       'Discovered from a research ledger. No tier, layer or verdict was carried across.'
  from reference.issuers i
 where i.issuer_key in (
   'nvidia','palantir-technologies','salesforce','microsoft','alphabet','amazon-com',
   'meta-platforms','broadcom','advanced-micro-devices','micron-technology','arista-networks',
   'marvell-technology','super-micro-computer','vertiv-holdings','coreweave','c3-ai',
   'soundhound-ai','oracle','tesla','tsmc','samsung-electronics','sk-hynix','asml-holding',
   'arm-holdings','baidu','alibaba-group','tencent-holdings','sensetime-group',
   'cambricon-technologies');

-- The discovery record. discovery_channel 'research_seed' is the load-bearing value: it says
-- this issuer is here because a research document named it, which is a reason to look and not a
-- reason to admit. Two documents, so two reasons, recorded against the candidates each covered.
insert into pipeline.candidate_discoveries
  (candidate_id, discovery_channel, discovery_reason, discovery_source, discovered_by)
select c.id, 'research_seed',
       'Named in the Phase 2E tiered exposure research sample as a company to examine. The sample''s tier and verdict were deliberately not carried over.',
       'docs/research/ugai/phase-2e-tiered-equity-exposure.md', 'Urdais research'
  from pipeline.issuer_candidates c
  join reference.issuers i on i.id = c.issuer_id
 where c.review_cycle_id = 'a1000000-0000-4000-8000-000000000010'
   and i.issuer_key not in ('baidu','alibaba-group','tencent-holdings','sensetime-group','cambricon-technologies');

insert into pipeline.candidate_discoveries
  (candidate_id, discovery_channel, discovery_reason, discovery_source, discovered_by)
select c.id, 'research_seed',
       'Named in the Phase 2F China/Hong Kong sanity check as a company whose treatment would test the tiers. That test is a reason to review, not a finding.',
       'docs/research/ugai/phase-2f-china-hk-sanity-check.md', 'Urdais research'
  from pipeline.issuer_candidates c
  join reference.issuers i on i.id = c.issuer_id
 where c.review_cycle_id = 'a1000000-0000-4000-8000-000000000010'
   and i.issuer_key in ('baidu','alibaba-group','tencent-holdings','sensetime-group','cambricon-technologies');

-- ---------------------------------------------------------------------- the documents
--
-- No pipeline.source_retrievals rows accompany these. There is no EDGAR collector: the four
-- documents below were fetched by hand during a research phase, under the declared User-Agent
-- and contact address the access policy asks for and well inside its ten-per-second ceiling.
-- Writing collector telemetry for a collector that does not exist would put a fiction in the one
-- table whose job is to say what actually ran, so the provenance lives entirely on the document
-- row: the URL it came from, the hash of what came back, when, and under which grant.
--

-- The table stores no bytes. The URL says where it was, the hash says what it was, and the
-- quoted passages on the claims say what it said -- and the three together let anyone re-fetch
-- the document and check every word of this cycle without Urdais redistributing a filing.
insert into pipeline.evidence_documents
  (id, source_interface_id, permission_grant_id, canonical_url,
   document_type, document_label, fiscal_period, period_end, published_at, retrieved_at,
   content_hash, byte_length, capture_method, notes)
values
  ('a1300000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000101',
   '5e000000-0000-4000-8000-000000000201', 
   'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm',
   'form_10k', 'NVIDIA Corporation, Annual Report on Form 10-K', 'FY2026',
   date '2026-01-25', date '2026-02-25', timestamptz '2026-09-17T00:00:02Z',
   '73d81f5a111abcf72426c840871e76f5f5edc9631f436d495a86b6f87306d58b', 1967816,
   'automated_retrieval', null),
  ('a1300000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000101',
   '5e000000-0000-4000-8000-000000000201', 
   'https://www.sec.gov/Archives/edgar/data/1321655/000132165526000011/pltr-20251231.htm',
   'form_10k', 'Palantir Technologies Inc., Annual Report on Form 10-K', 'FY2025',
   date '2025-12-31', date '2026-02-17', timestamptz '2026-09-17T00:00:05Z',
   'a4fef9542c4d1a99a9265df88948e5a115223940db01a0bd01f1d8b6c00acd46', 2192014,
   'automated_retrieval', null),
  ('a1300000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000101',
   '5e000000-0000-4000-8000-000000000201', 
   'https://www.sec.gov/Archives/edgar/data/1108524/000110852426000056/crm-q4fy26xexhibit991.htm',
   'form_8k', 'Salesforce, Inc., Current Report on Form 8-K, Exhibit 99.1 (Q4 and FY26 results)',
   'Q4 FY2026', date '2026-01-31', date '2026-02-25', timestamptz '2026-09-17T00:00:07Z',
   'e0d7391684a2ff88475758bc5314513037a5b464b00d1261699454832795ec60', 586272,
   'automated_retrieval',
   'An earnings release furnished as an exhibit. Its figures are management''s own presentation rather than audited statements, which is part of why the Agentforce number below can corroborate and cannot establish.'),
  ('a1300000-0000-4000-8000-000000000004', '5e000000-0000-4000-8000-000000000101',
   '5e000000-0000-4000-8000-000000000201', 
   'https://www.sec.gov/Archives/edgar/data/1329099/000119312526109289/d38065d20f.htm',
   'form_20f', 'Baidu, Inc., Annual Report on Form 20-F', 'FY2025',
   date '2025-12-31', date '2026-03-17', timestamptz '2026-09-17T00:00:12Z',
   '16a242f31d42b99f202abf7b51317fbc0223732f9136f6f9ec4fe813f2e17ff5', 6674808,
   'automated_retrieval',
   'Baidu files with the SEC as a foreign private issuer, so its annual disclosure is reachable under a permitted collection path even though its Hong Kong listing''s filings are not.');

-- ------------------------------------------------------------------------- the claims

-- Every row is model_assisted and unverified, and therefore corroborating. The schema would
-- reject any of them as establishing without a named human in verified_by, which is the intended
-- behaviour and the reason no determination below is 'eligible'.
insert into pipeline.evidence_claims
  (id, evidence_document_id, issuer_id, evidence_class, claim_type, quoted_passage,
   numeric_value, value_unit, value_currency, fiscal_period, extraction_method, human_verification)
select v.id, v.doc, i.id, v.cls, v.ctype, v.passage,
       v.num, v.unit, v.cur, v.period, 'model_assisted', 'unverified'
  from (values
    -- NVIDIA, Prong A: what the product is for, in the issuer''s own words.
    ('a1400000-0000-4000-8000-000000000001'::uuid, 'a1300000-0000-4000-8000-000000000001'::uuid,
     'nvidia', 'corroborating', 'qualifying_activity',
     'accelerating compute-intensive workloads, such as AI, data processing, graphics, robotics, and scientific computing',
     null::numeric, null::text, null::char(3), 'FY2026'),
    -- NVIDIA, Prong B: a historical statement about what drove the year, not guidance, so E8
    -- does not reach it.
    ('a1400000-0000-4000-8000-000000000002'::uuid, 'a1300000-0000-4000-8000-000000000001'::uuid,
     'nvidia', 'corroborating', 'principal_driver_statement',
     'growth in fiscal year 2026 was driven by data center compute and networking platforms for accelerated computing and AI solutions',
     null, null, null, 'FY2026'),

    -- Palantir, condition 1: the complete enumeration of commercial lines, from the filing.
    ('a1400000-0000-4000-8000-000000000011'::uuid, 'a1300000-0000-4000-8000-000000000002'::uuid,
     'palantir-technologies', 'corroborating', 'product_line_enumeration',
     'We have built four principal software platforms, Palantir Gotham (“Gotham”), Palantir Foundry (“Foundry”), Palantir Apollo (“Apollo”), and our Artificial Intelligence Platform (“AIP”).',
     null, null, null, 'FY2025'),
    -- Palantir, condition 3: the filing itself presents Apollo as supporting the other platforms.
    ('a1400000-0000-4000-8000-000000000012'::uuid, 'a1300000-0000-4000-8000-000000000002'::uuid,
     'palantir-technologies', 'corroborating', 'qualifying_activity',
     'Apollo is our continuous delivery platform, enabling the orchestration of upgrades of services and assets every day to manage the underlying infrastructure that hosts our other platforms.',
     null, null, null, 'FY2025'),
    -- Palantir: the AI platform as the filing describes it.
    ('a1400000-0000-4000-8000-000000000013'::uuid, 'a1300000-0000-4000-8000-000000000002'::uuid,
     'palantir-technologies', 'corroborating', 'qualifying_activity',
     'AIP is our generative artificial intelligence (“AI”) platform, which provides secure connectivity to third-party-provided large language models (“LLMs”), a development toolchain for building AI-powered agents and automations, an array of AI-enabled end user applications, a broad evaluations framework for governing AI workflows in production, and more.',
     null, null, null, 'FY2025'),
    -- Palantir: Foundry as the filing describes it -- data operations, not learned perception.
    ('a1400000-0000-4000-8000-000000000014'::uuid, 'a1300000-0000-4000-8000-000000000002'::uuid,
     'palantir-technologies', 'corroborating', 'qualifying_activity',
     'Foundry is our foundational data operations platform, which provides the core capabilities for data management, logic authoring, systemic mapping development through Palantir Ontology (“Ontology”), analytics, and workflow development.',
     null, null, null, 'FY2025'),
    -- Palantir: the sentence that triggers E5. Bundling is the opposite of the separate
    -- commercialisation the exclusion requires.
    ('a1400000-0000-4000-8000-000000000015'::uuid, 'a1300000-0000-4000-8000-000000000002'::uuid,
     'palantir-technologies', 'corroborating', 'separate_commercialisation',
     'AIP is seamlessly bundled with existing Palantir offerings such as the Foundry, Gotham, and Apollo platforms.',
     null, null, null, 'FY2025'),

    -- Salesforce: the only AI-specific figure disclosed, and an ARR run-rate rather than revenue.
    ('a1400000-0000-4000-8000-000000000021'::uuid, 'a1300000-0000-4000-8000-000000000003'::uuid,
     'salesforce', 'corroborating', 'recurring_revenue',
     'Agentforce ARR reached $800 million, up 169% year-over-year, and we''ve closed 29,000 deals, up 50% quarter-over-quarter.',
     800000000, 'annual_recurring_revenue', 'USD', 'Q4 FY2026'),

    -- Baidu: the offering is named in the filing; its scale is not extracted here.
    ('a1400000-0000-4000-8000-000000000031'::uuid, 'a1300000-0000-4000-8000-000000000004'::uuid,
     'baidu', 'corroborating', 'qualifying_activity',
     'AI Cloud Infrastructure, AI Applications and AI-native Marketing Services',
     null, null, null, 'FY2025')
  ) as v(id, doc, issuer_key, cls, ctype, passage, num, unit, cur, period)
  join reference.issuers i on i.issuer_key = v.issuer_key;

-- ------------------------------------------------------------------- the determinations

insert into pipeline.eligibility_reviews
  (id, review_cycle_id, issuer_id, methodology_version_id, status,
   candidate_primary_tier, final_primary_tier, tier3_route, value_chain_layers,
   qualifying_role, materiality_basis, gating_reason,
   evidence_cutoff, review_date, reviewer, publication_state)
select v.id, 'a1000000-0000-4000-8000-000000000010', i.id,
       'a1000000-0000-4000-8000-000000000002', v.status,
       v.cand_tier, null, v.route, v.layers,
       v.qrole, v.mbasis, v.gating,
       timestamptz '2026-09-17T00:00:00Z', date '2026-09-17', 'Urdais research', 'internal'
  from (values
    ('a1500000-0000-4000-8000-000000000001'::uuid, 'nvidia', 'pending', 2::smallint, null::text,
     null::text[],
     'Designs and sells the accelerators that AI compute systems are built from.',
     'The FY2026 filing attributes the year''s growth to data center compute and networking platforms for accelerated computing and AI solutions, which is the principal_driver_in_filing route rather than a disclosed product-family revenue line.',
     'Both Tier 2 prongs are evidenced by verbatim passages from the FY2026 10-K and nothing adverse was found. The review stays pending because the extraction is model-assisted and unverified: under the methodology only establishing evidence may support an admission, and a machine-extracted claim is not establishing until a named human has verified it. Clearing this needs a signature, not more evidence.'),

    ('a1500000-0000-4000-8000-000000000002'::uuid, 'palantir-technologies', 'contested',
     1::smallint, null,
     null,
     null,
     null,
     'The research ledger proposed Tier 1; the filing does not support it. The 10-K enumerates four principal platforms and describes two of them, Gotham and Foundry, as data integration and data operations software, without evidencing material dependence on learned perception or learned policy (E7). Apollo is non-qualifying but passes the ancillary-support test on the filing''s own words. AIP is a qualifying AI platform, but the filing states it is "seamlessly bundled with existing Palantir offerings", which is E5: capability embedded in existing products without separate commercialisation. No platform-level revenue is disclosed, so no line is separately disclosed either. E6 bars the name, the self-description and the market''s classification from closing the gap. Resolving this needs disclosure that separates AIP commercially, or a determination that Gotham and Foundry qualify on their own functionality -- neither of which this filing provides.'),

    ('a1500000-0000-4000-8000-000000000003'::uuid, 'salesforce', 'insufficient_evidence',
     3::smallint, 'B',
     null,
     null,
     null,
     'The only AI-specific quantity Salesforce discloses is Agentforce ARR of $800 million, an annual run-rate. E8 bars run-rate, booking and pipeline measures from establishing eligibility, so there is no qualifying revenue figure to put over consolidated revenue and no r_i_lower to compute. Independently, Route B admission is gated on an approved tau_B, and none exists: the parameter is recorded here as a draft with no effective date, so pipeline.check_eligibility_review() would refuse the admission even if the ratio were derivable. Two separate reasons, either sufficient.'),

    ('a1500000-0000-4000-8000-000000000004'::uuid, 'baidu', 'pending', 3::smallint, 'A',
     null,
     null,
     null,
     'The FY2025 20-F names AI Cloud Infrastructure, AI Applications and AI-native Marketing Services among its revenue contributions, which evidences the offering. Route A additionally needs a scale indicator at evidence rank 1 or 2, and that figure sits in a tabular disclosure that did not survive text extraction in this pass. This is an extraction gap, not an evidence gap: the number is in the document. Pending until structured extraction of the 20-F revenue tables, which is a known and scoped piece of work rather than an open question.')
  ) as v(id, issuer_key, status, cand_tier, route, layers, qrole, mbasis, gating)
  join reference.issuers i on i.issuer_key = v.issuer_key;

update pipeline.issuer_candidates c
   set review_state = 'in_review', last_reconsidered_at = timestamptz '2026-09-17T00:00:00Z'
  from reference.issuers i
 where i.id = c.issuer_id
   and c.review_cycle_id = 'a1000000-0000-4000-8000-000000000010'
   and i.issuer_key in ('nvidia','palantir-technologies','salesforce','baidu');

-- --------------------------------------------------------------- structured assessments

-- NVIDIA: both prongs, each pointing at the claim that carries it.
insert into pipeline.tier2_assessments
  (review_id, prong_a_category, prong_a_product, prong_a_evidence_id,
   prong_b_route, prong_b_satisfied, prong_b_basis, prong_b_evidence_id)
values
  ('a1500000-0000-4000-8000-000000000001', 'ai_accelerator',
   'Data center GPU compute platforms', 'a1400000-0000-4000-8000-000000000001',
   'principal_driver_in_filing', true,
   'The FY2026 10-K states that the year''s growth was driven by data center compute and networking platforms for accelerated computing and AI solutions. That is a statement about realised performance in the filing itself, not guidance, so E8 does not reach it.',
   'a1400000-0000-4000-8000-000000000002');

-- Palantir: the enumeration, line by line. This is the table earning its place -- the shape of
-- the finding is only visible once all four lines are written down beside each other.
insert into pipeline.tier1_product_lines
  (review_id, line_name, qualifies, ancillary_support, separately_disclosed, basis, evidence_claim_id)
values
  ('a1500000-0000-4000-8000-000000000002', 'Palantir Gotham', false, false, false,
   'The filing describes Gotham as integrating data across domains and sensors to improve situational awareness and accelerate decision-making. Data integration for human decision support, without disclosed material dependence on learned perception or learned policy, is not evidenced as a qualifying AI product on this filing (E7).',
   'a1400000-0000-4000-8000-000000000011'),
  ('a1500000-0000-4000-8000-000000000002', 'Palantir Foundry', false, false, false,
   'The filing calls Foundry a "foundational data operations platform" providing data management, logic authoring, ontology mapping, analytics and workflow development. Each capability named is deterministic data software; none evidences learned perception or learned policy (E7).',
   'a1400000-0000-4000-8000-000000000014'),
  ('a1500000-0000-4000-8000-000000000002', 'Palantir Apollo', false, true, false,
   'Non-qualifying and not separately disclosed, but the filing presents it as supporting the issuer''s own platforms: it manages "the underlying infrastructure that hosts our other platforms". This is the ancillary-support test satisfied on primary evidence rather than inferred.',
   'a1400000-0000-4000-8000-000000000012'),
  ('a1500000-0000-4000-8000-000000000002', 'Artificial Intelligence Platform (AIP)', true, false, false,
   'Qualifying on the filing''s own description -- a generative AI platform with LLM connectivity, an agent toolchain and AI-enabled applications. But the filing also states AIP is "seamlessly bundled with existing Palantir offerings", and no platform-level revenue is disclosed, so E5 applies: capability embedded in existing products without separate commercialisation at material scale.',
   'a1400000-0000-4000-8000-000000000013');

-- Salesforce and Baidu: the Tier 3 assessments that did not complete, and why.
insert into pipeline.tier3_assessments
  (review_id, route, offering, generally_available, separately_contracted,
   scale_metric, scale_evidence_rank, scale_value, scale_currency, scale_period,
   qualifying_revenue, consolidated_revenue, r_i_lower, satisfied, basis, evidence_claim_id)
values
  ('a1500000-0000-4000-8000-000000000003', 'B', 'Agentforce', true, true,
   'annual recurring revenue', 4, 800000000, 'USD', 'Q4 FY2026',
   null, null, null, false,
   'ARR is a run-rate, and E8 bars run-rate measures from establishing eligibility; it is recorded at evidence rank 4, where it may corroborate and can never satisfy. Neither side of the Route B ratio is therefore derivable from this disclosure, and tau_B is unresolved in any case.',
   'a1400000-0000-4000-8000-000000000021'),
  ('a1500000-0000-4000-8000-000000000004', 'A', 'Baidu AI Cloud', true, true,
   null, null, null, null, 'FY2025',
   null, null, null, false,
   'The offering is named in the 20-F as a revenue contribution category, which evidences general availability and separate contracting. The rank 1 or 2 scale indicator Route A requires was not extracted: it is disclosed in a revenue table that text extraction did not preserve.',
   'a1400000-0000-4000-8000-000000000031');

-- ------------------------------------------------------------- exclusions evaluated

-- Recorded for the two reviews where an exclusion actually decided something. An evaluated-but-
-- not-applied row is worth keeping; a row for every code on every review would be ceremony, and
-- the reviews that have not reached exclusion screening should not pretend they have.
insert into pipeline.review_exclusions (review_id, exclusion_code, applied, basis, evidence_claim_id)
values
  ('a1500000-0000-4000-8000-000000000002', 'E5', true,
   'AIP, the only qualifying line, is stated by the filing to be "seamlessly bundled with existing Palantir offerings such as the Foundry, Gotham, and Apollo platforms", and no platform-level revenue is disclosed. Capability embedded in existing products, priced within them, without separate commercialisation at material scale.',
   'a1400000-0000-4000-8000-000000000015'),
  ('a1500000-0000-4000-8000-000000000002', 'E6', true,
   'Applied as a bar rather than a finding: the issuer''s name, its self-description as an AI company, and its classification by third parties were all excluded from the assessment. Without E6 this review would likely have reached a different answer, which is precisely what the exclusion is for.',
   null),
  ('a1500000-0000-4000-8000-000000000002', 'E7', true,
   'Gotham and Foundry are described in the filing in terms of data integration, ontology mapping, analytics and workflow -- programmed data operations. Material dependence on learned perception or learned policy is not evidenced for either.',
   'a1400000-0000-4000-8000-000000000014'),
  ('a1500000-0000-4000-8000-000000000003', 'E8', true,
   'Agentforce ARR is a forward-looking run-rate of the same family as bookings and pipeline. It may corroborate and cannot establish, which removes the only AI-specific quantity in the disclosure from the Route B computation.',
   'a1400000-0000-4000-8000-000000000021'),
  ('a1500000-0000-4000-8000-000000000001', 'E1', false,
   'Evaluated and not applicable. The Tier 2 assessment rests on what the product is and what the filing says drove revenue, not on the identity of the customers buying it.',
   null),
  ('a1500000-0000-4000-8000-000000000001', 'E2', false,
   'Evaluated and not applicable. The accelerator is embodied in the AI computing system rather than being equipment used to manufacture one; E2 reaches the fabrication toolchain, not the part that ships inside the machine.',
   null),
  ('a1500000-0000-4000-8000-000000000001', 'E3', false,
   'Evaluated and not applicable. No part of the assessment relies on supplying power, cooling, buildings or colocation to sites that host AI compute.',
   null),
  ('a1500000-0000-4000-8000-000000000001', 'E6', false,
   'Evaluated and not applicable. The determination cites the product description and the driver-of-growth statement in the filing, not the issuer''s branding, its index membership or its share-price behaviour.',
   null),
  ('a1500000-0000-4000-8000-000000000001', 'E8', false,
   'Evaluated and not applicable. The Prong B passage states what drove growth in the fiscal year just reported; it is a historical statement in the filing, not guidance, backlog or a target.',
   null),
  ('a1500000-0000-4000-8000-000000000001', 'E9', false,
   'Evaluated and not applicable. The issuer reports substantial positive consolidated external revenue.',
   null);
