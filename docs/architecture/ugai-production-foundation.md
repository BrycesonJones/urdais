# UGAI production foundation — implementation plan and Phase 5.1–5.2 record

**Status: internal architecture document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It implements no methodology and changes none. The governing documents are `docs/methodology/ai-equity-universe.md` (0.3.0-draft) and `docs/methodology/ugai.md` (0.2.0-draft), both merged.

**Founder decision this plan proceeds under:**

> Urdais will not wait for commercial data vendors to build UGAI. Publicly obtainable sources will be used wherever technically and legally defensible, and missing coverage will be disclosed rather than fabricated.

Phases 2C, 4 and 4A remain the record of what commercial data would add and what it would cost. They are no longer a precondition. **The guardrail is that implementation does not pretend the licensing problem disappeared**: every source carries an explicit rights state, and the published surface discloses where redistribution rights are not independently verified.

---

## 1. Architecture discovered

Inspected before designing; this records what the foundation had to fit into.

**Schemas.** Two internal schemas, `reference` (slowly changing, versioned, Urdais-owned) and `pipeline` (data-bearing, retrieval and observation). Neither is exposed through PostgREST. RLS is enabled on every table with **no policies**; `anon` and `authenticated` hold no privileges at any level; `service_role` reaches them by platform design. Default privileges in `20260913060000_schemas_and_privileges.sql` already grant and revoke correctly, so a new table needs only `enable row level security`.

**Two shared mutation guards**, both defined in that same migration and reused across products:
- `pipeline.forbid_mutation()` — rejects UPDATE and DELETE outright. Attached to raw evidence.
- `pipeline.allow_only_supersession()` — permits exactly one UPDATE, the one that marks an un-superseded row superseded, and rejects every other change. Attached to interpretation tables.

**Rights machinery.** `reference.source_interfaces` gates on two axes (`terms_review_state`, `data_use_terms_state`) with constraints that block `production_approved` unless terms are `permitted`. `reference.permission_grants` records the basis. `pipeline.source_retrievals` carries `retrieval_purpose` (`research` / `production`) and a trigger requiring a production retrieval to name a grant on a production-approved interface.

**Evidence convention.** Terms are cited, never stored: a `termsArtifact` carries URL, content hash, byte length, HTTP status, retrieval timestamp, and the **decisive clause quoted verbatim**, with `attributionRequired` where the licence demands it. `src/lib/ubwi/rights.ts` is the reference implementation.

**Migrations.** `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, applied in filename order. `npm run migrations:check` runs in CI and rejects duplicate version prefixes, comparing against the merge target on a pull request. Existing migration files are never edited.

**Database tests.** `supabase/tests/NNN_name.sql`, each wrapped `begin … rollback`, run by `npm run db:test`; `db:replay` runs reset → migrate → test twice to prove migrations bootstrap deterministically from zero. **These do not run in CI** — CI runs migrations:check, lint, typecheck, vitest and build — so they are a local gate that must be run deliberately.

**A tripwire worth knowing about.** `supabase/tests/070_security.sql` asserts that the number of tables in `reference` and `pipeline` **exactly equals** the length of an explicit list it carries. Adding any table without registering it there fails the suite. That is deliberate: it makes a new table a conscious act with a security review attached.

**Product precedents.** UCPI (retrieval → raw offers → normalized observations → eligibility → calculation runs → regional observations → publications), UBWI (calculations, publication gates, frozen publications), UTVI (retrievals, snapshots, model observations, calculations, publications). All append-only with supersession; none overwrites a published print. `pipeline.calculation_runs` is hardwired to UCPI's UTC-day calendar by CHECK and **cannot host UGAI**, whose cutoff is "after the last constituent session and the FX fixing for the date" — UGAI needs its own run table, exactly as UBWI and UTVI each did.

---

## 2. Layering

```
public sources → retrieval → raw evidence → security master → eligibility
  → market observations → actions/shares/float → FX → universe snapshot
  → UGAI calculation → publication → API → frontend
```

Every transformation is reproducible from the rows beneath it, and every row cites the retrieval that produced it.

---

## 3. Phase 5.1–5.8 plan

Each slice is a separate PR. A slice lands only when its own tests and the full validation gate pass.

### 5.1 — Rights model and equity reference foundation ✅ *this PR*

Rights model extended to express storage, post-termination retention, reconstruction, and publication per output. Security master: venues, issuers, securities, listings, identifiers, and the relationships between them. No eligibility, no market data. Detail in §4–§5.

### 5.2 — Eligibility evidence and candidate universe ✅ *this PR*

Built as planned, with two departures recorded in §8. Detail in §8–§9.

`pipeline.eligibility_reviews` (issuer, review date, methodology version, status, primary tier, value-chain layers, qualifying role, materiality basis, reviewer, effective date, supersession) and `pipeline.eligibility_citations` (the primary evidence each determination rests on: document, URL, hash, retrieval, the quoted sentence).

Invariants: exactly one primary tier per `eligible` issuer; `Tier1 + Tier2 + Tier3 = Eligible` asserted per snapshot; statuses mutually exclusive and matching the methodology's five (`eligible`, `pending`, `contested`, `insufficient_evidence`, `rejected`); non-eligible statuses may carry a candidate tier but never count.

**Route B gating**: Tier 3 Route B admission is blocked while `τ_B` is unresolved. Tier 1, Tier 2 and Tier 3 Route A are unaffected. The gate is a parameter check, not a code constant.

Candidate discovery is recorded as a reproducible method, not a list: the query or listing that produced the candidate set, dated, so a future reconstitution can re-run it. **The Phase 2E/2F research samples may seed discovery and may not seed determinations** — every production eligibility row needs fresh evidence review under the merged methodology.

Retrieval path for filings: SEC EDGAR for US issuers, issuer annual reports and 20-F/6-K elsewhere, official exchange and regulator filings, official results releases only where the evidence hierarchy permits. Raw evidence and hashes preserved. **No LLM-only classifier**: extraction may be assisted, but a determination cites primary evidence and names a reviewer.

### 5.3 — Public end-of-day price sources ✅ *this PR*

Built. One venue implemented, one venue found to have no permitted source. Detail in §14.

`pipeline.price_observations`: security, listing, venue, trading date, close, currency, unit, source, source timestamp, retrieval timestamp, session status, supersession, rights state. Raw official close, **unadjusted**; corporate actions never rewrite a stored price.

Source discovery per venue, in the order the plan requires: official exchange source, then official regulator or government source, then exchange-hosted historical files, then a reputable public source whose terms permit the use. A venue with no credible public source is left `price_source_state = 'unavailable'` with the reason recorded — not filled from a consumer finance page.

### 5.4 — Shares, float, corporate actions ✅ *this PR*

Built. Shares and corporate actions have real sources; free float has none. Detail in §16.

Effective-dated `shares_outstanding_observations` (value, unit, effective date, observation date, source, evidence hash, revision lineage). Sources: issuer filings, SEC XBRL, exchange filings, corporate-action notices. **Today's share count is never used for a historical date.**

`free_float_observations` kept deliberately separate from shares, and separate again from foreign-ownership headroom, so `accessible free float` remains a computed quantity rather than a collapsed one. **`free_float_factor` is never defaulted to 1** for an unknown issuer: unknown float makes a security unavailable, and the unavailability is published.

`corporate_actions`: effective-dated ledger with original notices retained — splits, reverse splits, dividends, special distributions, rights issues, spin-offs, mergers, acquisitions, delistings, ticker and share-class changes.

### 5.5 — FX, representative security, investability ✅ *this PR*

Built. Six currencies resolve, one does not, and every issuer is unassessable for a different reason. Detail in §18.

FX reuses the UBWI architecture and its two already rights-cleared interfaces, `ecb-euro-reference-rates` and `cbc-exchange-rates`, extended to the currencies the universe actually contains. **Two known frictions to surface rather than paper over**: UBWI stores local-currency-per-USD while UGAI requires USD per unit, and a central-bank patchwork has heterogeneous fixing times where `ugai.md` proposes a single global instant. If public sourcing cannot satisfy the methodology, **the conflict is surfaced before the methodology is changed**.

Representative-security engine: eligible listings → venue and access eligibility → the methodology's ordered tie-breaks → exactly one security, with the selection inputs and tie-break recorded as evidence. The method chooses; nobody picks the easier line by hand.

Investability screens as **versioned parameters**, never constants in code.

### 5.6 — Universe snapshots and capped weighting ✅ *this PR*

Built. The engine's answer on real data is that no production snapshot can be formed. Detail in §20.

Immutable versioned snapshots carrying universe version, methodology version, review/publication/effective dates, members, representative securities, primary tiers, value-chain layers, eligibility evidence ids, investability state, capitalization inputs, base weights, exclusions and unavailable members, and coverage limitations. Published snapshots are superseded, never mutated.

Weighting exactly as documented: accessible free-float market cap → uncapped weights → issuer cap `c` → normalized base weights. **`c` is a versioned parameter with no default.** Publication is blocked until a parameter set explicitly approves a value; the research preference for 8% is not a silent default.

### 5.7 — Calculation, divisor, publication ✅ *this PR*

Built. The engine's answer on real data is that no level can be calculated. Detail in §22.

UGAI's own run table (not `pipeline.calculation_runs`), constituent calculations, index shares, divisor history with every change's cause and before/after market values, daily observations, publications, revisions. Append-only with supersession; a published print is never overwritten.

**Publication fails closed.** No publication where: the methodology version is not approved · the parent universe version is invalid · an unresolved parameter was used · `n × c < 1` · a required price is missing · required FX is missing beyond tolerance · required float is unknown · the representative security is invalid · a corporate-action state is unresolved · lineage is incomplete. Every refusal returns an explicit diagnostic.

Base date is the **first legitimate live publication**; base value 1,000.00. No backdating.

### 5.8 — API and frontend

`/api/ugai` on the contract the UTVI route established: validate the response against its own contract and answer 500 rather than serve an unchecked number; return a null snapshot with a reason while nothing is published.

Frontend states, honestly: *not yet published* / *building universe* / *coverage incomplete* before publication — **never a fake level**. When live: level, percentage change, observation date, methodology version, universe version, publication timestamp, coverage status. Ranges appear only as real observations accumulate, using the low-frequency range helpers in `src/lib/market-ranges.ts`.

**Rights-aware publication**: the rights records gate the published fields. If index-level publication is permitted, constituent publication unknown and weight publication prohibited, the surface shows the level, the methodology and the coverage, and withholds the weights. Calculating something is not permission to publish it.

**Known defect to fix before UGAI publishes a second observation**: `earliestAcceptableBase` in `market-ranges.ts` rejects Friday's close as a Monday 1D base, so a Mon–Fri index loses its 1-day range every Monday. Confirmed by execution in Phase 1A. Fix belongs in 5.8.

---

## 4. Phase 5.1 — rights model

`reference.permission_grants` gains twelve rights booleans, a layer, a termination obligation, a retention limit, a venue scope, and evidence columns. Migration `20260917120000_rights_model_extension.sql`.

**`covers_index_use` is kept, not replaced.** It is read by `src/lib/ucpi/runtime/daily-run.ts`, `src/lib/frontier/store.ts`, `src/lib/utvi/store.ts` and four SQL tests. Renaming it would break production code for no benefit in this slice. It remains the coarse legacy gate; `covers_index_calculation` is the precise successor and is backfilled from it.

**Axes.** Use: `covers_collection` (existing), `covers_internal_use`, `covers_index_calculation`. Retention: `covers_storage`, `covers_historical_retention`, `covers_post_termination_retention`, `covers_historical_reconstruction`. Publication, one per output: `covers_index_level_publication`, `covers_constituent_publication`, `covers_weight_publication`, `covers_membership_change_publication`. Redistribution: `covers_raw_redistribution`, expected false throughout.

**`rights_layer`** — `publisher` / `vendor` / `exchange` / `regulator` / `issuer` / `other`. It exists because a vendor grant otherwise looks like full coverage: a vendor may licence its own data and convey nothing about the exchange whose prices it redistributes.

**`termination_obligation`** — `none` / `cease_use` / `delete_all` / `delete_except_derived` / `unspecified`. `delete_all` is the Phase 2C disqualifier made queryable; `delete_except_derived` is the shape one vendor's terms actually take.

**Three constraints that encode methodology rather than taste:**
1. A grant may not assert post-termination retention while obliging deletion of everything.
2. An index level that may not be calculated may not be published.
3. Constituents, weights and membership changes presuppose the level may be published.

**Backfill, stated as the two inferences it is:** `covers_index_calculation := covers_index_use` (direct semantic mapping) and `covers_internal_use := covers_collection` (collection was always reviewed for a purpose). Everything else stays false.

**False means "not established by review", not "prohibited"** — matching the registry's existing `not_reviewed` philosophy. Only `termination_obligation` records a positive prohibition.

---

## 5. Phase 5.1 — equity reference model

Migration `20260917120100_equity_reference_foundation.sql`. Seven tables in `reference`, all RLS-enabled, all effective-dated where the methodology needs history. **Nothing is UGAI-specific**: no tiers, weights, prices or eligibility.

| Table | Holds |
|---|---|
| `venues` | MIC, operating MIC, name, country, default currency, IANA timezone, `support_state`, `price_source_state`, `rights_state` |
| `issuers` | Urdais-issued `issuer_key`, canonical name, domicile, LEI, status, active interval |
| `securities` | Issuer, security type, share class, denomination currency, depositary-receipt flag and ratio, status, active interval |
| `listings` | Security, venue, ticker, **price currency**, **price unit**, status, primary flag, effective interval |
| `security_identifiers` | Effective-dated ISIN, FIGI variants, SEDOL, CUSIP, local codes, with source and evidence URL |
| `security_relationships` | `depositary_receipt_of`, `share_class_sibling_of`, `successor_of` |
| `issuer_relationships` | `parent_of`, `successor_of`, with ownership percentage |

**Four shapes the methodology forces:**

1. **Issuer, security and listing are three things.** Collapsing any pair makes *one issuer → one membership → one representative security* unrepresentable: a company with an ordinary line and an ADR is one membership and two securities; a security cross-listed on two venues is one security and two listings.
2. **Currency lives in two places and they differ.** `securities.denomination_currency` is what the security is denominated in; `listings.price_currency` is what it trades in. `listings.price_unit` (`major`/`minor`) is recorded rather than assumed, because pence-against-pounds is a hundredfold error no range check catches.
3. **Identifiers are rows, not columns.** They change and must stay attached to what they identified at the time. A ticker is a label on a listing, never an identity.
4. **A receipt and its underlying are one issuer.** Enforced by trigger, because the alternative lets one company enter a universe twice.

**Uniqueness rules, all scoped to current rows so history stays true of its own interval:** at most one current primary listing per security; at most one current ticker per venue; one current ISIN per security. **FIGI is deliberately excluded** from the uniqueness rule — share-class and composite FIGIs are shared across listings by design, and a uniqueness constraint there would reject correct data.

**`reference.check_security_relationship()`** validates edge shape: a receipt edge runs receipt → underlying within one issuer; a sibling edge joins two non-receipt lines of one issuer; succession is the only type permitted to cross issuers.

### 5.2 deliberately excludes

Prices, shares, float, corporate actions, FX, snapshots, weights, calculation, publication, API and frontend — and, deliberately, any admission. 5.2 builds the apparatus that decides eligibility and runs it once; it does not produce a universe.

### 5.1 deliberately excludes

Eligibility, prices, shares, float, corporate actions, FX, snapshots, weights, calculation, publication, API and frontend. Each has its own slice. Building them against a foundation that could not represent a dual-listed issuer would mean rebuilding them later.

---

## 6. Security review

- All seven new tables have RLS enabled with no policies, matching every other table in these schemas.
- `anon` and `authenticated` receive nothing: default privileges from the foundation migration revoke at schema, table, sequence and function level, and `070_security.sql` asserts both roles are refused SELECT on each table by name.
- New tables are registered in `070_security.sql`, whose exact-count assertion would otherwise fail.
- Neither schema is exposed through PostgREST, so none of this reaches the public API by default. **The API serves published datasets, never these tables.**
- No vendor terms text is stored — only a URL, a hash, and the decisive clause, on the convention the source registry already uses. Rights evidence is retained internally and is not public by default.
- `reference.all_valid_mics` and `reference.check_security_relationship` are `reference`-schema functions; default privileges revoke execution from `anon` and `authenticated`.

---

## 7. Blockers carried into 5.2, and what happened to them

1. **`τ_B` unresolved** — **addressed, still unresolved.** Recorded as a `draft` row in `reference.methodology_parameters` with the 10% research candidate and no effective date. `pipeline.check_eligibility_review()` refuses every Tier 3 Route B admission unless an `approved` `tau_b` is in force at the review date. Approving it is a dated, attributed act the parameter table enforces; it is not an edit to a constant.
2. **Issuer cap `c` unresolved** — recorded the same way, as a draft with no effective date. Nothing in 5.2 consumes it; it has an identity before it has a number.
3. **Investability minima provisional** — untouched. Belongs to 5.5.
4. **Candidate discovery method undefined** — **resolved.** `pipeline.candidate_discoveries` records the channel and the dated reason each candidate entered. The first cycle's candidates all entered through `research_seed`, which is the channel that confers no eligibility significance, and `310` asserts that every candidate has a discovery row and that no seeded discovery claims a stronger channel.
5. **Evidence retrieval terms** — **resolved for the launch geography.** Four filing systems reviewed on both axes and recorded in `reference.source_interfaces` with dated clause evidence. SEC EDGAR permits collection under a declared User-Agent and a 10/second ceiling and is silent on data use; HKEXnews prohibits text and data mining in terms; OpenDART is a keyed official API silent on commercial use; Taiwan's MOPS terms were not located. None is production-approved.
6. **Reviewer identity** — **partially resolved, and it is now the binding constraint.** The schema records a reviewer and an independent check, and refuses a check whose reviewer is the same person. Who signs is still a governance decision, and §8 explains why nothing in the first cycle could be admitted without one.

---

## 8. Phase 5.2 — what was built, and the two departures

Eleven tables: two in `reference` (`methodology_parameters`, `ai_universe_review_cycles`) and nine in `pipeline` (`issuer_candidates`, `candidate_discoveries`, `evidence_documents`, `evidence_claims`, `eligibility_reviews`, `tier1_product_lines`, `tier2_assessments`, `tier3_assessments`, `review_exclusions`).

The chain is: a **cycle** fixes an evidence cutoff and a methodology version → **candidates** enter through a recorded **discovery** channel → **documents** are cited by URL and SHA-256, never stored → **claims** quote one passage from one document about one issuer, carrying an evidence class → a **review** reaches a status under those claims, with tier-specific structured assessments and the exclusions it evaluated beside it.

Four gates are enforced in the database rather than in application code:

- A development cycle cannot publish, and cannot be approved into one that can.
- A review's evidence cutoff must equal its cycle's, so a determination cannot quietly use later evidence than its cycle admits.
- Tier 3 Route B admission requires an approved `tau_b` in force **at the review date** — point-in-time, not present-tense.
- A machine-extracted claim is not establishing evidence until a named human has verified it.

Determinations are append-only and supersede rather than update, and one issuer holds at most one live determination per cycle.

### Departure 1 — no collector telemetry was written

The plan assumed evidence would arrive through `pipeline.source_retrievals`. No EDGAR collector exists; the four documents in the first cycle were fetched by hand during a research phase. Writing retrieval rows for a collector that does not exist would put a fiction in the table whose only job is to record what ran, and it would have tripped the `090` and `110` policy assertions that say no collector has run. Provenance therefore lives entirely on the document row — URL, hash, byte length, retrieval time, and the permission grant it was made under. A real collector in a later slice will write retrievals and link them; the column is there and nullable.

### Departure 2 — the first cycle admits nobody

This was not the expected outcome and it is the correct one. Four issuers were reviewed against real filings retrieved for the cycle:

- **NVIDIA — `pending`.** Both Tier 2 prongs are evidenced by verbatim passages from the FY2026 10-K and nothing adverse was found. It is not admitted because the extraction behind those passages is model-assisted and unverified, and the methodology does not let machine output establish anything until a human signs for it.
- **Palantir — `contested`.** The research ledger proposed Tier 1; the filing does not support it. The 10-K enumerates four platforms, describes two of them (Gotham, Foundry) as data integration and data-operations software without evidencing learned perception or learned policy, and states that AIP is *"seamlessly bundled with existing Palantir offerings"* — which is E5. No platform-level revenue is disclosed, and E6 bars the name and the self-description from closing the gap. Apollo passes the ancillary-support test on the filing's own words.
- **Salesforce — `insufficient_evidence`.** The only AI-specific quantity disclosed is Agentforce ARR, a run-rate that E8 bars from establishing anything. Independently, Route B is gated on an unresolved `tau_b`. Two reasons, either sufficient.
- **Baidu — `pending`.** The offering is evidenced in the 20-F; the Route A scale indicator sits in a revenue table that text extraction did not preserve. An extraction gap, not an evidence gap.

The remaining twenty-five candidates are `queued` with no review row, which is the honest record of "discovered, not yet opened". Inventing `insufficient_evidence` rows for issuers nobody has read would be a worse record than an empty one.

**What this demonstrates:** the apparatus refused to admit the most AI-branded name in the sample on its own disclosure, and refused to inherit a tier from research. That is the behaviour the phase was built to produce. The single change that would move NVIDIA to `eligible` is a named human verifying four already-quoted passages — which is a governance step, not an engineering one.

---

## 9. Phase 5.2 — security review

- All eleven new tables have RLS enabled with no policies, and all eleven are named in `070_security.sql`, whose exact-count assertion would otherwise fail.
- `anon` and `authenticated` receive nothing; neither schema is exposed through PostgREST.
- `evidence_documents` and `evidence_claims` are append-only via `pipeline.forbid_mutation()`; `eligibility_reviews` permits only supersession.
- No filing bytes are stored. A document row holds a URL, a hash and a length; a claim holds one quoted passage. Anyone can re-fetch the document, check the hash and check every word of a determination, and Urdais republishes nothing.
- `reference.source_interfaces.terms_evidence` carries the decisive clauses for all four filing systems with the date they were read, on the convention the source registry already uses.
- `310_ai_equity_eligibility_evidence.sql` asserts the seeded state directly: no admission, nothing published, no approved `tau_b`, every document hashed, every candidate discovered through a recorded channel, and every automatically retrieved document sourced from an interface whose terms permit it.

---

## 10. Phase 5.2 amendment — methodology 0.4.0-draft and the first admission

The first production review was not only a test of the apparatus; it was a test of the rules, and the rules failed it. Palantir was marked `contested` because two provisions combined badly: Tier 1 required substantially every enumerated line to qualify on its own, and E5 excluded an AI capability that the filing described as integrated across the issuer's other platforms rather than sold separately. **The result was that an issuer could be penalised precisely because its AI was structurally integrated** — which inverts the question the universe exists to ask. That is a rule defect, not an edge case, and it was only visible because the first review was run against a real filing rather than against the research ledger.

Founder decision of 17 September 2026: broaden the methodology to recognize AI-integrated platform companies, and approve the governance path for the NVIDIA verification.

### What changed in the methodology (0.3.0-draft → 0.4.0-draft)

- **Tier 1 gains a second route.** Route N is the existing AI-native whole-issuer enumeration, unchanged in all four conditions and in the 75% safe harbour. **Route P** admits an issuer whose commercial platform is materially organized around deploying, operating, or enabling AI or ML systems for customers, on five conjunctive conditions: customer-facing AI capability, platform centrality, operational role, commercial scale, and an unrelated-business guard. Route P requires no separately reported AI revenue where the capability is structurally integrated and separate accounting does not exist.
- **E5 is narrowed**, not deleted. It previously excluded bundled AI capability generally; it now excludes AI that is *incidental* to its host product, and **bundling is expressly removed as a ground for exclusion on its own**. The governing sentence is: integration is not disqualifying, incidental AI is.
- **The Tier 1 Route P / Tier 3 boundary is stated explicitly**, turning on whether AI defines the platform identity — with Route P expressly unavailable as a way around the unresolved `τ_B`.

No fourth tier. Tier 2 embodiment and E2, the Route A scale hierarchy, `τ_B`, the issuer cap, value-chain layers, one primary tier per issuer, and the eligibility/availability separation are all untouched.

### What changed in the schema

One column and one table, both mirroring shapes that already existed. `eligibility_reviews.tier1_route` (`ai_native` | `ai_integrated_platform`) parallels `tier3_route`, and `pipeline.tier1_platform_assessments` parallels `tier2_assessments` and `tier3_assessments` — Route P is a judgement about one platform against five conditions, which is not what `tier1_product_lines` encodes, and reinterpreting the enumeration columns to mean something else would have been worse than adding a table.

Writing the new constraint surfaced a **latent defect in the Tier 3 constraint written in 5.2**: `check (tier3_route is null or final_primary_tier = 3 or candidate_primary_tier = 3)` evaluates to null — and therefore passes — when a review carries a non-matching final tier and a null candidate tier, so a Tier 2 determination could have claimed a Tier 3 route. No seeded row exercised it, so nothing recorded is wrong. Both constraints now use `is not distinct from`. This is the second time three-valued logic has quietly opened a gate in this schema; the first was the empty-MIC-array check in 5.1.

### Two cycles, because the first cycle was not wrong

`dev-2026-09b` re-reviews the same filings at the same evidence cutoff under 0.4.0-draft. The first cycle's determinations are **superseded, not edited**: they were correct under 0.3.0-draft, and rewriting them would falsify the record of what the rules used to say. The lineage is walkable in both directions, and `320` asserts that the prior cycle still records the E5 finding it actually made.

`0.3.0-draft` also stays a **draft**. It was never approved and publishes nothing, so there is nothing to retire; marking it `superseded` would both overstate what it was and trip the standing assertion that no methodology outside the live products is non-draft. Which version governed a determination is read from that determination's own `methodology_version_id`.

### Outcomes

**NVIDIA — `eligible`, Tier 2.** Both cited FY2026 10-K passages were re-fetched from EDGAR at 2026-09-17T14:50:49Z; the document hashed identically to the recorded value and both passages appear verbatim. Bryceson Jones verified that correspondence and is recorded as the independent named reviewer. **The eligibility basis is the filing evidence, which did not change** — `320` asserts the tier, the route and both cited claim IDs are identical across the supersession. The verification satisfied the methodology's requirement that machine-extracted evidence be confirmed by a named human before it may establish anything; had the passages not matched, the record would show a rejection.

**Palantir — `eligible`, Tier 1 via Route P.** The methodology objection went first: E5 no longer applies (recorded `applied = false`, against `applied = true` in the prior cycle), and the filing's statement that AIP lets customers derive value *"via the combination of our existing software platforms with generative AI models"* is evidence of structural integration rather than of a bundled feature. Condition 4 rests on disclosed adoption — 954 customers at 31 December 2025 against 711 a year earlier — and $4.5 billion of recognized platform revenue, neither forward-looking. The governance gate went second, and is recorded in §12.

**Salesforce — `insufficient_evidence`, unchanged.** Route P was considered and fails condition 5: Agentforce is an AI capability inside a large CRM business, and AI does not define Salesforce's platform identity, so the methodology directs it to Tier 3. There, E8 still bars the ARR run-rate and `τ_B` is still unresolved. **This is the amendment not being a general loosening**, and it is asserted as such.

**Baidu — `pending`, unchanged.** The blocker was never a rule.

Both gates — methodology and governance — are independently enforced, and this amendment moved the first of them.

---

## 12. Phase 5.2 amendment — the Palantir verification, and a scoping error worth keeping

Founder approval of 17 September 2026 closed the governance gate on Palantir. The determination moved from `pending` to `eligible` at Tier 1 Route P, superseding rather than replacing the gated row.

Two things happened and the record keeps them apart. **Mechanically**, the FY2025 10-K was re-fetched from EDGAR at `2026-09-17T16:08:15Z`; it hashed to `a4fef954…`, identical to the value recorded when the document was first cited, and all six passages appear verbatim. That establishes the quotations are real and unaltered — it is not a human verification and does not substitute for one. **For governance**, Bryceson Jones reviewed and approved the six quoted passages, which is what the methodology requires before machine-extracted evidence may establish an admission.

### The scoping error

The pull request described *"three unverified passages"* as the remaining gate. **That was wrong**, and it nearly produced a false record. The Route P assessment cites five claims, one per condition, and the three originally named covered only conditions 2 and 4. Conditions 1, 3 and 5 cited three other passages — the platform enumeration, the Apollo description, the AIP description — which were not in the original approval.

Promoting only the first three and admitting the issuer would have meant three of five Route P conditions resting on unverified machine extraction, with a named human's signature implying otherwise. The remaining three were put to the founder explicitly and approved before the migration was written.

Two lessons are worth keeping. First, **a claim about what is blocking a determination must be derived from the determination's own citations**, not written from memory — the prose said three because three claims were added that day, not because three claims carried the conditions. Second, `320` now asserts the general form of this directly: every condition of a Tier 1 Route P admission must cite establishing, human-verified evidence, and no admitted issuer anywhere may rest on unverified establishing evidence. A future scoping mistake fails the suite instead of reaching the record.

Claims `…0014` and `…0015` — the Foundry description and the "seamlessly bundled" sentence — were deliberately **not** promoted. They supported the superseded cycle-A finding, no live condition cites them, and they were not put to the founder. `320` asserts they remain unverified, which is what stops a verification from quietly sweeping up everything attached to an issuer.

### Outcome

The universe holds **two** eligible issuers: NVIDIA at Tier 2 and Palantir at Tier 1 Route P, each on human-verified establishing evidence from a statutory filing. Cycle A still records Palantir as `contested` under 0.3.0-draft with E5 applied, and the cycle-B `pending` row is preserved with its gating reason intact. Nothing was rewritten to look like it always agreed.

---

## 14. Phase 5.3 — end-of-day equity prices

Prices are the first UGAI slice to touch market data, and the failure modes change character. An eligibility error is visible in prose; a price error is silent. A hundredfold unit slip, a close attached to the wrong line of a dual listing, an adjusted series standing in for an official one, and a fabricated holiday close all look exactly like correct rows. So most of this slice is refusal.

### A dependency that was not there

Phase 5.2 seeded 29 issuers and nothing below them, correctly: eligibility is a question about a company. Prices are not — a close attaches to a line, on a venue, in a currency, in a unit — so the security master was empty and there was nothing for a price to reference. It is populated here from primary evidence only: the Section 12(b) registration tables on NVIDIA's and Palantir's own Form 10-K cover pages, and TWSE's own daily publication for TSMC. Three listings, on three venues.

No ISIN, CUSIP, SEDOL or FIGI was seeded. Those come from identifier authorities Urdais has not licensed, and a plausible-looking identifier nobody verified is worse than an absent one, because it will be trusted.

### The source review, and the result that matters

Applied in the stated order — official exchange, then official regulator, then exchange historical files, then a public provider whose terms expressly permit the use. Two venues reviewed, opposite outcomes:

- **XTAI, Taiwan Stock Exchange — permitted, implemented.** The official TWSE OpenAPI publishes the daily close for every listed line, and separately publishes the venue's own trading calendar. Its service metadata states *"本平臺提供臺灣證券交易所服務API，歡迎各位介接使用"* — everyone is welcome to connect and use it — and declares its licence as the Taiwan Open Government Data License, whose clause 2.1 grants a *"perpetual, worldwide, non-exclusive, irrevocable, royalty-free"* licence to compile and adapt the data *"for any purpose, including but not limited to making all kinds of Derivative Works either as products or services."* An index is a derivative work offered as a product, so this reaches calculation and publication, not merely internal use. It even reaches post-termination retention and historical reconstruction — the axis Phase 4 found no commercial vendor would grant.
- **XNAS and XNGS, Nasdaq — refused, unavailable.** Nasdaq's website terms grant a licence *"solely for your personal, non-commercial use"*, and state that the content may not be *"store\[d\] for subsequent use"*, may not have *"derivative works"* created from it, and may not form the basis of *"products or services"*. Scraping and data mining are named and prohibited, and unlike HKEXnews the prohibition covers *"any automated or manual process"*, so manual transcription is not an alternative route either. The official close is a licensed exchange product under the UTP and CTA plans; the SEC publishes filings, not prices. The remedy is a written data agreement, which is procurement, not engineering.

**Nasdaq is the venue both currently eligible issuers list on.** The pipeline therefore runs against the venue where the rights exist and is blocked at the venue UGAI most needs — which is the honest state, and is recorded as a venue `price_source_state` of `unavailable` with the clause behind it rather than as an empty table that looks like work not yet done.

### Attribution as a condition, not a courtesy

OGDL clause 3.2 requires attribution and states that *"If User fails to comply with the attribution requirement, the rights granted under this License shall be deemed to have been void ab initio."* An unattributed observation was therefore never lawfully collected. `permission_grants` gained `attribution_required` and `attribution_text` to express that, and the price gate refuses a row that omits the credit where the grant makes it a condition. The wording is stored verbatim and never paraphrased, on the same rule the UTV index already follows for OpenRouter's CC BY terms.

### The canonical observation

`pipeline.price_observations` stores the raw official close and nothing derived. There is no adjusted-close column anywhere in the schema or in the TypeScript types, because a field that exists is eventually written to and a split-adjusted number in a raw-close column cannot be recovered. Corporate actions will adjust at read time in 5.4.

The row carries `listing_id` and nothing redundant. A listing already determines its security, venue, currency and unit, and copying those onto the observation would create four ways for one row to contradict itself; they are validated against the listing on insert instead, at the only moment a contradiction could enter.

`pipeline.check_price_observation()` refuses: a date outside the listing's effective interval, an official close on a non-active listing, a currency or unit that disagrees with the listing, a grant belonging to a different interface, a grant not covering collection or storage, a grant whose `covered_venues` excludes this listing's venue, a missing attribution where the licence makes it a condition, and a production-purpose observation on an interface that is not production-approved.

Session status is explicit: `traded`, `exchange_holiday`, `no_official_close`, `source_unavailable`. A price exists **if and only if** the session traded, so a fabricated holiday close is unrepresentable rather than merely discouraged. Nothing carries a prior close forward — that is a calculation policy, and a calculation cannot apply a policy to a gap it cannot see.

### Corrections

Append-only. A corrected official close is a new row that supersedes its predecessor, and the original value stays readable, because "what did we believe on the day" is a question an index has to be able to answer afterwards. One live observation per listing, date and purpose, so the original must leave the partial index before the correction enters it — the same deferred forward-reference ordering the Palantir supersession needed.

Idempotency is keyed on what the observation describes — source, venue, code, date, purpose — never on when the collector ran. A re-read that returns the same close writes nothing; one that returns a different close is a correction.

### Two Postgres gotchas worth carrying forward

`numeric` NaN compares **greater than** every other value and is **equal to itself**. So `close_price > 0` admits NaN, and a `close_price <> close_price` self-inequality guard never fires. The working check is an explicit `close_price <> 'NaN'::numeric`. This is the third time three-valued or non-IEEE numeric semantics have quietly opened a gate in this schema, after the empty-MIC array in 5.1 and the nullable tier comparison in 5.2.

### Deliberately not built

No cron and no schedule. `npm run ugai:prices` is a manual, bounded invocation, and it refuses `--mode production` outright regardless of what the registry says — production verification is the next phase, and letting this script be the first thing to exercise the production gate would answer that phase's question by default. No index level, divisor, weight, snapshot, FX, shares, float, corporate action, publication, API or frontend.

### Venue and source coverage

- **XTAI** · Taiwan Stock Exchange · TW · TSMC (2330, TWD, major) · TWSE OpenAPI · official exchange · **permitted, both axes** · **implemented** · no blocker
- **XNAS** · Nasdaq Stock Market · US · Palantir (PLTR, USD, major) · nasdaq.com · exchange website · **refused, both axes** · **not implemented** · no public source; needs a written exchange data agreement
- **XNGS** · Nasdaq Global Select Market · US · NVIDIA (NVDA, USD, major) · nasdaq.com · exchange website · **refused, both axes** · **not implemented** · same as its operating market

The remaining 26 candidate issuers have no seeded listings and therefore no venue coverage requirement yet. On the Phase 2F geography the future universe will need XNAS, XNYS, XTAI, XKRX, XHKG and the Chinese venues; of those, only XTAI has a cleared source today, and HKEXnews is already recorded as prohibiting automated retrieval.

---

## 16. Phase 5.4 — capitalization inputs

Five tables, because shares, holder-level ownership, free float, accessibility and corporate actions disagree about what they are keyed on, how often they change, what a revision means and what it means for one to be missing. A single `equity_fundamentals` row would have to pick one answer and would be wrong four times.

The invariant the slice exists to enforce: **unknown free float stays unknown, and never becomes 1.0.** Treating absence as full float inflates precisely the issuers Urdais knows least about, while producing an index that looks complete. So `float_observations.float_state` is mandatory and `free_float_factor` is null unless that state is `established` — a biconditional constraint, no column default, and no code path anywhere in `src/lib/ugai/capitalization` that produces a factor from silence.

### Shares outstanding: three securities, three different answers

- **NVIDIA — established.** `dei:EntityCommonStockSharesOutstanding` = 24,100,000,000 effective 2026-08-21, reported 2026-08-26. Single share class, so the cover-page concept is an unambiguous scalar. The two dates differ and are stored separately, which is what makes a historical calculation possible: a count published on the 26th was not knowable on the 22nd.
- **TSMC — established, as `issued`.** TWSE publishes 已發行普通股數 = 25,932,370,067, which reconciles exactly against paid-in capital 259,323,700,670 divided by the NT$10 par value. The adapter performs that division as a check and rejects a mismatch, which catches a misread column for free. Recorded as `issued`, **not** relabelled `outstanding` — the difference is treasury stock.
- **Palantir — deliberately not recorded.** A multi-class issuer. `dei:EntityCommonStockSharesOutstanding` does not exist for it, and the `us-gaap` concept the flat XBRL API does serve has had its share-class dimension stripped, so whether 2,402,897,000 is Class A alone or every class summed is not established. The master holds only the listed Class A line. Attaching an all-class figure to it would be a wrong number that looks right, so the adapter has **no fallback** and the table has no row.

`share_count_type` is mandatory with no default and no `unspecified`. The adapter refuses `WeightedAverageNumberOfSharesOutstandingBasic` and `CommonStockSharesAuthorized` by name: an EPS denominator is a weighted average over a period and authorized shares are a ceiling nobody has issued.

### Free float: no source exists, in any reviewed geography

This is the substantive finding, recorded as rows with a stated basis rather than as absence.

- **United States.** `dei:EntityPublicFloat` is a genuine, official, primary float measure — NVIDIA USD 4.0tn at 2025-07-25, Palantir USD 299.3bn at 2025-06-30. It is a **currency amount at one fiscal date, not a factor.** Deriving a factor needs a market capitalization at that same date, which the parent methodology does not authorise; and "held by non-affiliates" is not the free-float population — it excludes officers, directors and ten-percent holders while *including* strategic corporate holders an index would normally remove. Recorded as evidence on the float row, with `float_state = 'unavailable'`.
- **Taiwan.** TWSE publishes director and supervisor shareholding balances (share counts) and a list of holders above ten percent that carries **names without percentages**. TSMC appears in the latter not at all. Those are float *inputs*; they are not a float population, because strategic corporate holders, cross-holdings and government stakes appear in neither list. Summing them would produce a confident number wrong in an unknown direction.
- **Hong Kong.** Blocked earlier and for a different reason: HKEXnews prohibits text and data mining in terms (Phase 5.2). Substantial-shareholder disclosures and CCASS data exist, but collection rights are refused, so content feasibility was not assessed — the rights answer already settles it.
- **South Korea.** OpenDART carries major-shareholder disclosures, but its terms are silent on commercial use and remain `under_review`, and no key has been registered. Also unassessed for content, for the same reason.

**No geography yields a free-float factor.** The model therefore does what it should: a future calculation meets an explicit `unavailable` state rather than a missing join, and cannot proceed by accident.

A `derived_from_holdings` determination method exists and is deliberately hard to use — a constraint requires a `methodology_reference` before a derived factor can be stored at all, so summing insider holdings into a float needs the methodology to have authorised it first.

### Accessibility: three inputs, never one number

`foreign_ownership_limit_percent`, `foreign_ownership_current_percent` and `foreign_headroom_percent` are separate columns and no accessible-float factor is computed. Collapsing them now would destroy the ability to say **why** accessible float sits below free float for a given security, which is the only reason to keep them at all. A test asserts no `accessible_float_factor`, `free_float_market_cap` or `index_weight` column exists anywhere in the schema.

`unknown` carries no figures by constraint, so an unknown accessibility can never read as unrestricted. The US rows are `no_limit_evidenced` — a search found nothing, which is a weaker claim than a positive grant of open access and a stronger one than silence. Taiwan is `unknown`: TWSE publishes foreign holding ratios by sector and a top-twenty aggregate, neither of which is a per-security limit or usage figure.

### Corporate actions: recorded, never applied

Sixteen action types. Ratios are stored as a numerator/denominator pair, never a decimal — a 3-for-2 split stored as 1.5 has already lost the issuer's own terms. Cash amounts require a currency. Date coherence is enforced across announcement, ex, record and payment dates.

**The Phase 5.3 boundary holds and is tested directly:** recording a split does not change a raw `price_observations` row, and the test additionally proves the price row cannot be edited at all, so no amount of calculation convenience can adjust it. The ledger supplies transformation inputs a later read-time calculation applies.

TSMC's TWD 7.000001 cash dividend is seeded from TWSE's own ex-rights notice table. The adapter emits several actions from one notice where the source describes several — a company can go ex on a cash dividend, a stock dividend and a rights subscription on the same date, and the fixture covers all three shapes.

### Rights

One shared gate, `pipeline.check_capitalization_rights()`, with an explicitly pinned `search_path` rather than a mutable one. It requires the grant to belong to the named interface, to cover collection and storage, and to supply any attribution its licence makes a condition. A row with **no** grant is permitted only where the family allows a sourceless determination — which is how "nobody publishes this" gets recorded for float and accessibility.

New interfaces: `sec-xbrl-company-concepts` (same EDGAR access policy, collection permitted, data use unaddressed, production-review-pending), and three TWSE OpenAPI endpoints under the Open Government Data License already settled in 5.3 — company basic data, ex-rights notices, insider holdings.

### Deliberately not built

No representative-security selection, investability, universe snapshot, weight, issuer cap, divisor, FX, total return or index level. No cron, no production ingestion, no production rows.

---

## 18. Phase 5.5 — FX, representative security, investability

Three failure modes shaped this slice, each of which produces something that looks correct: an FX rate inverted twice is still a plausible exchange rate; a representative security chosen because Urdais had data for it is still a valid security; and a screen that "failed" because nobody measured it is still a boolean. None is caught by reading a row, so all three are caught by refusing to store them.

### Two discrepancies found on inspection

**The FX sources had no grants.** `ecb-euro-reference-rates` and `cbc-exchange-rates` have existed since UBWI, both reviewed `permitted` on both axes — but neither had a single `permission_grants` row, so there was nothing to reuse. The ECB grant here is built from the ECB's own copyright statement, re-read for this phase.

**There was no FX observation table.** UBWI converts inline at the point of use. So the sources and their rights are reused; the canonical model is new.

### FX

The methodology fixes the orientation and leaves the fixing open, and both facts are in the schema. `X_i,t` is USD per one unit of the price currency, "never inverted per currency" — a constraint, not a convention anyone has to remember. The fixing source and time are recorded as an unresolved draft parameter, because the methodology says exactly that.

The column that earns its place is `derivation`. No source publishes what UGAI needs:

- **USD per EUR** — ECB publishes it directly.
- **USD per JPY, GBP, HKD, KRW, CNY** — cross via EUR: (USD per EUR) ÷ (currency per EUR), with both legs stored as their own rows and referenced.
- **USD per TWD** — would require inverting Taiwan's central bank rate.

A trigger **re-derives every inverted and cross rate from its recorded components** and refuses one that does not reproduce, which is what catches a double inversion, a leg taken from the wrong day, and a cross assembled against the wrong bridge. Carrying a stale fixing forward is permitted — the methodology says so explicitly — but it is a flagged state naming the day it came from, never a silent copy.

**TWD did not resolve at the time of this phase.** The ECB publishes no New Taiwan dollar reference rate — which is why UBWI needed a second FX source at all — and Taiwan's central bank did not resolve from the review environment, so no rate was retrieved and none was invented. The consequence was that XTAI, the only venue Urdais holds a rights-cleared price source for, was the only venue whose currency it could not convert. **Superseded: §19 closes this gap through CBC dataset 7232.**

### Representative security

The methodology's order, implemented exactly: retain an eligible incumbent before comparing anything; otherwise greatest three-month ADTV in USD; on an exact tie only, ordinary over receipt, then issuer-designated primary, then ascending ISIN, then ascending MIC.

The rule the engine exists to refuse is the one nobody writes down. **A candidate whose turnover was never measured is not a candidate with zero turnover**, so a comparison in which any eligible line is unmeasured returns `undeterminable` rather than crowning whichever line happened to be measured — a larger unmeasured line would have won. A suspended line cannot win on stale turnover either.

**Availability is not an input to selection.** It is not in the candidate shape, and a test asserts it never becomes one. The methodology is explicit that a selection resolving to an unsupported venue "produces an availability constraint … not a change of representative security to a more convenient line", so the selection row carries `selection_state` and `availability_state` in separate columns and **there is no state in this schema meaning "we chose the line we had data for."**

All three seeded selections are `selected` **and** `constrained`, for three different reasons.

### Investability

Evaluated per criterion, never as one boolean, with four outcomes rather than two. `unavailable` means an input is missing; `parameter_unresolved` means the methodology has not set the threshold. Neither is a failure, and collapsing them into one is how a universe quietly admits issuers nobody measured.

Constraints make that structural: a criterion cannot be `passed` or `failed` without **both** an observation and a threshold, so an unresolved minimum can never be treated as satisfied; `parameter_unresolved` must name the parameter it waited for; and `unavailable` carries no observation at all.

The screens come from the methodology, which states that the "numerical minima, suspension tolerances, and entry/retention buffers are unresolved". They are recorded as draft parameters — the same treatment `τ_B` received. `min_listing_record_months = 3` is the one with a number, because the methodology states three months as a *proposed operational convention*, and is explicit that it "is not evidence that a specific liquidity threshold is adequate".

### The diagnostic, and what it shows

Every evaluation returns `unavailable`. Not one criterion anywhere is marked `failed`, because nothing was measured well enough to fail.

- **NVIDIA** — representative NVDA/XNGS, sole eligible line. Price unavailable (Nasdaq refuses every axis), float unavailable, turnover and trading frequency unmeasurable in consequence. Listing record **passes**: 235 days against the 90-day convention. Foreign headroom is `parameter_unresolved` — the input is as good as it gets (`no_limit_evidenced`) and the threshold does not exist. FX **passes**: the price currency is USD, so the conversion is the identity rate.
- **Palantir** — representative PLTR/XNAS. Same, plus no unambiguous share count for a multi-class issuer, so accessible capitalization has no numerator before price or float are even considered. Listing record passes at 260 days.
- **TSMC** — the instructive one. Price **available**, share count established and reconciled, turnover published under the same licence. And still unassessable: at the time of this phase no USD rate existed for the TWD (**since closed — §19**, leaving the fixing convention rather than the source as the constraint), float is unavailable, and one collected session stands against a three-month window. Its trading-frequency criterion is `unavailable` rather than a low ratio, because the shortfall is uncollected data and not sessions the issuer did not trade — recording it as a frequency would assert the opposite. TSMC is also a candidate whose thematic review has not completed.

### Deliberately not built

No universe snapshot, weight, index share, divisor, cap or index level. Tests assert that no such column or table exists anywhere in `pipeline`.

---

## 19. Follow-up — the New Taiwan dollar, sourced

Phase 5.5 left TWD as the one launch currency with no route to USD, which meant XTAI — the only venue with a rights-cleared price source — was the only venue whose prices could not be converted. This closes the **source and rights** half of that gap and nothing else.

**The source.** Central Bank of the Republic of China (Taiwan), open dataset **7232**, identifier `A59000000N-000045`: *"The closing exchange rate of the New Taiwan Dollar against the US dollar in the interbank market"*, served as JSON from `https://cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day`, daily from 2 January 2008.

**The orientation.** CBC publishes **TWD per one USD** — 31.881, not 0.031 — the inverse of UGAI's canonical `X`. The published rate is stored **as published**, and the UGAI rate is a separate `inverted` row pointing at it. Relabelling at parse time would destroy the only evidence that an inversion happens at all, and an inversion applied twice restores the original number while looking entirely ordinary. The Phase 5.5 trigger re-derives it: `USD per TWD = 1 / 31.881 ≈ 0.0313666`.

**The rights.** The interface has been marked permitted on both axes since UBWI and **had no permission grant**, so nothing could consume it. One now exists, against the same Open Government Data License read in full for the TWSE OpenAPI in Phase 5.3 — perpetual, irrevocable, reaching derivative works as products or services and therefore index calculation and publication of derived outputs, conditional on attribution. The attribution names the agency, dataset 7232, its title and the licence, and states that the Bank does not endorse Urdais or any derived index.

**What was not done, and why.** Live retrieval could not be performed: `cpx.cbc.gov.tw` and `www.cbc.gov.tw` both fail DNS resolution from the build environment, while `openapi.twse.com.tw` and `data.gov.tw` resolve normally. The observation is a **researched value recorded as such** on the row itself, with no response hash or byte length claimed for bytes nobody received. The interface's three rights states were also left untouched: `reference.guard_terms_recheck()` refuses a rights-state change unaccompanied by a newly retrieved terms artifact, this session retrieved none, and the guard is correct.

### The distinction this follow-up preserves

> **TWD source availability is solved. UGAI's fixing-time methodology is still unresolved.**

Knowing where to get a daily TWD close is a different question from deciding *which* daily close UGAI uses — same-day CBC fixing, latest available before the calculation cutoff, or previous business day. That parameter stays draft, and a test asserts a source change did not approve it.

Accordingly TSMC's FX criterion moves from `unavailable` to **`parameter_unresolved`**, naming `fx_fixing_convention` — and no further. Its overall result stays `unavailable`: free float is still unpublished, one collected session still stands against a three-month window, and its thematic review is still pending. The superseded evaluation survives with its original finding.

The adapter imposes **no Monday-to-Friday calendar**. Taiwan runs Saturday make-up workdays that carry legitimate observations, and a weekday filter would silently discard them; what happens on a date with no fixing belongs to the unresolved convention, not to a parser.

---

## 20. Phase 5.6 — universe snapshots and capped weights

The methodology's weighting input is exact, and two words in it decided most of this slice:

`M_i(t) = Σ over eligible distinct ordinary classes k [ P_ik × N_ik × f_ik × X_ik ]`

**N is outstanding shares.** Not issued — the difference is treasury stock. Taiwan publishes 已發行, *issued*, so the one share count Urdais holds for its one priceable security is the wrong type. The valuation gate refuses it rather than normalising it away, which is the concrete form of "report and fail closed rather than silently normalize".

**`f` is one factor, not two multiplied.** The methodology defines it as "the accessible free-float factor after overlapping strategic and foreign-access restrictions are reconciled" and requires that an overlapping stake not be deducted twice — then describes that reconciliation conceptually without reducing it to an algorithm. So there is no `accessibility_factor` column and no rule here forms `f` from its components. Phase 5.4 holds float and accessibility as separate inputs precisely because no approved derivation joins them, and that gap propagates: no `f`, no valuation.

### Snapshot lifecycle

Three tables. `universe_snapshots` is immutable and never a live query over current tables — a snapshot whose inputs can move is not a snapshot. `snapshot_constituents` holds **one row per issuer, enforced by a unique constraint**, which is what makes one-issuer-one-membership structural rather than remembered: a dual listing cannot become two weights. `snapshot_constituent_inputs` holds one term of the Σ per class, each factor beside the observation it came from, so the product can be re-checked rather than trusted — and a trigger does re-check it.

States are `development`, `ready_for_review`, `production_eligible`, `blocked`, `superseded`. A development snapshot can be blocked or reviewed like any other; what it can never be is publishable.

**An eligible issuer that cannot be valued stays in the snapshot** as `eligible_unavailable` with its reason. The methodology is explicit that such an issuer "is recorded as eligible with its availability constraint stated, and the resulting coverage gap is published rather than resolved by declaring the issuer ineligible" — so silently dropping it is the one outcome the rule forbids, and a test asserts against it.

### Capping

`w_i = min(c, λ × M_i)` with `Σ w_i = 1`, reached by the procedure the methodology states: cap the overweight and **repeatedly** redistribute in proportion to uncapped capitalization. Repeatedly is the operative word — redistributing one issuer's excess raises everyone else and can push the next-largest over the cap in turn, so a single pass produces weights that satisfy nothing and look plausible. A test covers exactly that case (70/28/1/1 at c = 0.4, where the second issuer binds only after the first does).

Arithmetic is exact integer arithmetic at a fixed 1e-30 scale, not floating point. Weights are a shared-denominator problem and IEEE-754 has no shared denominator; accumulating divisions in doubles leaves a residual someone is then tempted to assign to the largest constituent. The residual here is allocated by largest remainder — deterministic, cannot breach the cap, and not an arbitrary rule the methodology never defined.

**Feasibility.** `n × c ≥ 1` is necessary, and the methodology states it twice with two different `n`: once on "positive-weight companies" and once, as the publication gate, on "the count of issuers with status Eligible". **Those diverge whenever an eligible issuer cannot be valued**, so both counts are stored and both must hold. Where feasibility fails the snapshot is withheld with a reason — never a relaxed cap, added ineligible companies, or equal weights.

### The real-data result

A development run against the real universe is recorded as **blocked**, with five independent blockers, any one sufficient:

1. the issuer cap is a **draft** parameter with no effective date or approver;
2. cap feasibility fails regardless — two eligible issuers at the 10% research candidate give `n × c = 0.2` against the 1 required;
3. neither eligible issuer has a rights-cleared price;
4. no free-float factor is established anywhere, so `f` has no value;
5. the reconstitution calendar is itself unresolved, so there is no scheduled as-of date to form a snapshot against.

Per-constituent: NVIDIA and Palantir are `eligible_unavailable` with their missing factors named; TSMC is `excluded`, because its thematic review is *pending* rather than eligible — an exclusion on thematic grounds, not availability, and worth distinguishing since it is the one issuer Urdais can price.

**No synthetic observation was written against any real issuer.** The valuation and capping proofs run against fixture issuers prefixed `zz-fixture-` inside a transaction that rolls back, and a test asserts no fabricated float factor exists for NVIDIA, Palantir or TSMC.

### Snapshot weighting versus the 5.7 divisor

This phase produces **base weights at a reset**. It does not produce index shares, a divisor, or a level. Phase 5.7 converts base weights into index shares at reset prices, maintains the divisor across corporate actions and membership changes, and calculates the published level — and a test asserts no `ugai_calculations` or `ugai_publications` table exists yet.

---

## 22. Phase 5.7 — the calculation engine

The methodology specifies this phase almost completely, so the schema is shaped by it rather than by convenience:

`MV_t = Σ_i q_i,t × P_i,t × X_i,t` · `UGAI_t = MV_t / D_t`

One sentence governs the design: **UGAI must change because constituent market values changed, not because bookkeeping events altered shares, listings, or capital structure.** The divisor is how that is enforced, and it has exactly one rule —

`D_after = D_before × MV_after / MV_before`

— which every maintenance event reduces to. There are no per-event formulas anywhere in the engine, only per-event decisions about what `MV_after` is, and a trigger re-derives every change and refuses one that does not reproduce.

### Base initialization

`D_base = MV_base / 1000`. The base level is fixed at 1,000.00 and `baseDivisor()` takes only a market value — no date, no level parameter — because the methodology fixes both and a parameter for either would be an invitation. **The base date is "the date of UGAI's first live published observation"**, so a calculation can only be marked as the base observation if it is publication-eligible; marking a blocked or merely-calculated row would date the series from a day nothing went live.

### Index shares, not share counts

`q_i = w_i × MV_s / (P_i,s × X_i,s)` at a reset, then held fixed so weights drift with prices. The methodology is explicit that index shares "are not shares outstanding, not free-float shares, and not a claim about any company's share count", and that a company issuing stock between resets does not change `q`. So `ugai_index_shares.set_by` has **no share-observation option**: the only routes are a scheduled reset, an event-snapshot removal, a corporate-action share adjustment, and a representative-security substitution. Zero is a legitimate value — a departing line ends at `q = 0`.

Weights are never reset daily. Re-weighting between resets would embed a trading rule the methodology rejects, so `as_of_weight` is recorded and never fed back.

### Corporate-action treatments

All implemented as recorded in the methodology, and all reducing to the one divisor rule:

- **no divisor change** — splits, reverse splits, bonus issues, stock dividends in the same security (share and price adjustments are value-neutral); ordinary cash dividends; ticker and name changes; representative-security substitution where value is preserved
- **divisor decreases** — special dividends and capital repayments; merger or acquisition of a member; delisting, cancellation, liquidation; distribution-line removal
- **divisor increases** — rights issues in the money, by the subscription value
- **no adjustment** — out-of-the-money or unpriced rights; trading halts, where the last close is carried and flagged

`change_reason` is a closed list drawn from that enumeration: an event type absent from it has no approved treatment and blocks rather than picking the nearest neighbour. The one unresolved case the methodology itself names is the **maximum holding period for an unpriced distribution line**.

UGAI is a **price index** here. Ordinary dividends cause the price to fall and the index with it; there is no reinvestment and no total-return variant in this phase.

### The missing-data rule

The methodology enumerates seven input conditions and they are not interchangeable, so the schema carries all of them. A market holiday is a **valid prior close** and explicitly not an error; a session that held but produced no close by the cutoff is **stale**, carried and flagged; a suspension is carried and flagged; and a genuinely **missing** observation "may not be imputed". Constraints make that last case unrepresentable rather than merely forbidden — a missing row cannot carry a price or a contribution.

The engine **blocks rather than renormalising** when a constituent cannot be valued. Dropping the name and rescaling the rest would be an imputation by another route, and it would silently change every other constituent's weight.

### Precision

Exact integer arithmetic at a fixed 1e-24 scale, not floating point. A price index compounds daily for years and a level carried in doubles accumulates error nobody can attribute afterwards; the methodology requires that a rounded value never become an input to a subsequent calculation, and never rounding before publication is the cheapest way to guarantee it.

### Calculated is not publishable

A level can be arithmetically correct and unpublishable at the same time, so publication readiness is nine structured checks rather than a boolean — production snapshot, divisor, constituent inputs, unresolved actions, parameters, source rights, attribution, lineage, and the stale-input tolerance. A development divisor cannot carry a publishable level, and neither can a blocked snapshot.

### The real-data result

**Blocked, and nothing is initialized:** no divisor, no index shares, no base date, exactly one calculation row — today's blocked attempt. No synthetic history was generated, and a test asserts the row count.

The basket does not exist, so the arithmetic never begins. The five snapshot blockers are inherited unchanged, and this phase adds two of its own: the **FX fixing convention** is unresolved, so no rule designates which daily rate a calculation takes, and the **stale-input tolerance** that decides whether an observation publishes as delayed is unresolved too.

Of the nine publication checks, two pass — `no_unresolved_corporate_action` (the one recorded action is an ordinary cash dividend with a stated treatment) and `attribution_available` (the TWSE, CBC and ECB credits are recorded and renderable). The rest fail, are unassessable, or wait on a parameter.

### What Phase 5.8 owns

The public series and everything that reaches a reader: the API surface, the frontend, the published observation objects, and the scheduling that would produce a level each day. This phase created **no cron and no production automation** — only deterministic functions a scheduler could later call. A test asserts no `ugai_publications` table exists.

---

## 23. Remaining blockers for 5.8

1. **The issuer cap `c` is unresolved.** Production snapshot formation is structurally impossible until it is approved with an effective date, which the trigger enforces. Even approved at the 10% research candidate, the current eligible set of two fails `n × c ≥ 1` by a wide margin — so the cap and the breadth problem compound. `τ_B` remains an unresolved draft on the same footing, blocking Tier 3 Route B admission.
2. ~~**No USD reference rate for the New Taiwan dollar.**~~ **Closed** — see §19. CBC dataset 7232 supplies the official daily close under a licence reaching index calculation, stored with its inversion lineage. What survives of it is item 6: a source is not a fixing rule.
3. **No free-float factor exists in any reviewed geography.** A methodology decision, not an engineering one. UGAI's weighting is defined on accessible free-float capitalization and no public source publishes a factor for the US, Taiwan, Hong Kong or Korea. The options are to authorise a derivation from partial holdings data with its error characterised, to license factors commercially, or to amend the weighting basis. **Silently substituting full market capitalization is not among them** — and the schema now makes that substitution unrepresentable rather than merely discouraged.
4. **No US price source.** Both currently eligible issuers list on Nasdaq, and Nasdaq refuses every axis the price pipeline needs. Until a written exchange data agreement exists, UGAI can price TSMC and cannot price NVIDIA or Palantir.
5. **Palantir has no usable share count.** The methodology values `N` as *outstanding* shares per class; the flat XBRL API exposes neither the share-class dimension nor, for this issuer, the cover-page concept. The dimensional XBRL frames or the filing itself would have to be parsed.
6. **The FX fixing convention is unresolved**, as is every investability minimum, the reconstitution calendar, and the stale-input tolerance that decides whether a published observation is delayed. A production investability determination is structurally impossible until they are approved, which the trigger enforces. This is now the binding constraint on TWD rather than the source.
7. **Named verification, per issuer.** The governance path has been exercised twice and does not generalise: every admission needs a human to confirm its cited passages, and the scoping error in §12 shows the step is easy to get wrong in the direction of admitting too much. Two issuers verified, twenty-seven candidates not yet reviewed.
8. **Structured extraction of filing tables.** Baidu's case generalises: segment and product revenue live in tables that plain text extraction loses, and Route A cannot be evidenced at scale without it.
9. **Non-US evidence has no automated path.** HKEXnews prohibits automated retrieval, OpenDART needs a registered key, MOPS is unreviewed. Manual capture is supported by the schema and does not scale, which is a coverage constraint to disclose rather than hide.
