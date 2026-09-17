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

### 5.3 — Public end-of-day price sources

`pipeline.price_observations`: security, listing, venue, trading date, close, currency, unit, source, source timestamp, retrieval timestamp, session status, supersession, rights state. Raw official close, **unadjusted**; corporate actions never rewrite a stored price.

Source discovery per venue, in the order the plan requires: official exchange source, then official regulator or government source, then exchange-hosted historical files, then a reputable public source whose terms permit the use. A venue with no credible public source is left `price_source_state = 'unavailable'` with the reason recorded — not filled from a consumer finance page.

### 5.4 — Shares, float, corporate actions

Effective-dated `shares_outstanding_observations` (value, unit, effective date, observation date, source, evidence hash, revision lineage). Sources: issuer filings, SEC XBRL, exchange filings, corporate-action notices. **Today's share count is never used for a historical date.**

`free_float_observations` kept deliberately separate from shares, and separate again from foreign-ownership headroom, so `accessible free float` remains a computed quantity rather than a collapsed one. **`free_float_factor` is never defaulted to 1** for an unknown issuer: unknown float makes a security unavailable, and the unavailability is published.

`corporate_actions`: effective-dated ledger with original notices retained — splits, reverse splits, dividends, special distributions, rights issues, spin-offs, mergers, acquisitions, delistings, ticker and share-class changes.

### 5.5 — FX, representative security, investability

FX reuses the UBWI architecture and its two already rights-cleared interfaces, `ecb-euro-reference-rates` and `cbc-exchange-rates`, extended to the currencies the universe actually contains. **Two known frictions to surface rather than paper over**: UBWI stores local-currency-per-USD while UGAI requires USD per unit, and a central-bank patchwork has heterogeneous fixing times where `ugai.md` proposes a single global instant. If public sourcing cannot satisfy the methodology, **the conflict is surfaced before the methodology is changed**.

Representative-security engine: eligible listings → venue and access eligibility → the methodology's ordered tie-breaks → exactly one security, with the selection inputs and tie-break recorded as evidence. The method chooses; nobody picks the easier line by hand.

Investability screens as **versioned parameters**, never constants in code.

### 5.6 — Universe snapshots and capped weighting

Immutable versioned snapshots carrying universe version, methodology version, review/publication/effective dates, members, representative securities, primary tiers, value-chain layers, eligibility evidence ids, investability state, capitalization inputs, base weights, exclusions and unavailable members, and coverage limitations. Published snapshots are superseded, never mutated.

Weighting exactly as documented: accessible free-float market cap → uncapped weights → issuer cap `c` → normalized base weights. **`c` is a versioned parameter with no default.** Publication is blocked until a parameter set explicitly approves a value; the research preference for 8% is not a silent default.

### 5.7 — Calculation, divisor, publication

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

## 10. Remaining blockers for 5.3

1. **A named reviewer.** Nothing can be admitted until a human verifies extractions and signs a determination. This is now the top of the critical path, ahead of any data work.
2. **`τ_B` and issuer cap `c`** remain unresolved drafts. Route B admission and capped weighting are both blocked until they are approved through the parameter table.
3. **Structured extraction of filing tables.** Baidu's case generalises: segment and product revenue live in tables that plain text extraction loses. Route A cannot be evidenced at scale without this.
4. **Non-US evidence has no automated path.** HKEXnews is prohibited; OpenDART needs a registered key; MOPS is unreviewed. Manual capture is supported by the schema and does not scale, which is a coverage constraint 5.3 onward must disclose rather than hide.
5. **Public end-of-day price sources** — untouched, and the subject of 5.3.
