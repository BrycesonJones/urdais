# UCPI-H100 Backend Foundation

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 13 September 2026 for Phase 3 of the H100 production sequence. It describes the Supabase/PostgreSQL foundation that persists what the methodology says must exist. It does not restate methodology, and nothing in it changes a methodology decision.

## 1. Scope

Phase 3 builds the vessel. It establishes the hosted development project `UrdaisDev`, the repository-local Supabase environment, and a migration-defined schema that can represent UCPI-H100-SXM end to end without information loss: methodology and specification versions, instrument identity, the source registry, retrieval provenance, immutable raw offers, versioned normalized observations, and eligibility assessments.

It builds nothing that fills the vessel. There is no collector, no HTTP call to any provider, no scheduler, no normalization algorithm, no eligibility evaluator, no seller reduction, no calculation, no publication table, no public API, no frontend integration, and no production project.

## 2. Relationship to Phase 2

UCPI-H100-SXM 0.1.1-draft closed the child's rules and, in its **Ingestion Field Contract**, classified every field a future ingestion system must produce as required raw, required derived, optional diagnostic, nullable by methodology, or nullable but blocking P2. That contract is this schema's requirements document. Section 22 maps every field in it to a storage destination.

Phase 2 also left five parameters deliberately unresolved: the bundle envelope level, the seller-reduction rule, the numerical freshness ages and price carry limit, marketplace seller-identifier stability, and four numerical publication gates. **None of those is encoded here.** The schema stores the evidence needed to decide them later and constrains nothing to a value that has not been approved (section 23).

The governing principle is unchanged: methodology determines what the system must know; the backend implements the system required to know it.

## 3. Environment model

| Environment | What it is | Who writes to it |
|---|---|---|
| Local cluster | A throwaway PostgreSQL 16 cluster under `.local/pg`, managed by `scripts/db/local.sh`, no Docker required | The developer, via the harness |
| CI database | A PostgreSQL 17 service container, matching the hosted engine | The `database` job in `ci.yml` |
| `UrdaisDev` | The hosted Supabase development project, ref `scwwjoyouohfrwylalha`, region `us-east-1`, PostgreSQL 17 | Tested migrations only, applied explicitly |
| `UrdaisProd` | Does not exist. Reserved name for a future production project | Nobody, yet |

Repository migrations under `supabase/migrations/` are the single source of truth. The local harness and CI bootstrap the Supabase platform roles that a vanilla PostgreSQL lacks (`scripts/db/supabase-roles.sql`, never applied to the hosted project) and then apply migrations from zero, in order, one transaction each, recording each version in `supabase_migrations.schema_migrations` exactly as the hosted project does. Two consecutive from-zero replays must pass; that is the deterministic-bootstrap check.

`UrdaisDev` runs on the same PostgreSQL major version as CI. The local cluster is one major version behind because that is what is installed; the DDL used here is identical across 16 and 17, and CI is the authoritative check against 17.

**Parity is verified structurally, not assumed.** `scripts/db/schema-fingerprint.sql` digests the columns, constraints, indexes, triggers, functions, RLS flags, policies and role privileges of both schemas. Run against the local database and the hosted project, it produced identical digests for all eight components at the end of Phase 3 (260 columns, 171 constraints, 61 indexes, 9 triggers, 4 functions, 21 tables with RLS, 0 policies, 21 privilege rows), and the 249-row ISO reference set matched by row digest as well. Any future divergence between the repository and `UrdaisDev` shows up as a digest mismatch.

The repository knows its development project through the git-ignored `supabase/.temp/project-ref`, written by `supabase link`, and through the non-secret `SUPABASE_PROJECT_REF` in `.env.example`. No database password, access token, or service-role key is committed anywhere.

## 4. Entity relationships

```text
reference.methodologies ──< reference.methodology_versions
        │                              │
        └──< reference.instruments ──< reference.instrument_spec_versions ──┘ (parent version)

reference.providers ──< reference.source_interfaces ──< pipeline.source_retrievals ──< pipeline.raw_offers
                                   │                              │                          │
                                   ├──< reference.region_mappings ┘ (evidence retrieval)     │
                                   └──< reference.native_identifiers ──> reference.market_entities ──< reference.entity_roles
                                                                                     │
reference.iso_countries <── reference.canonical_regions <── reference.region_mappings │
        │                              │                                             │
        └──────────────┐               │                                             │
                       ▼               ▼                                             ▼
                 pipeline.normalized_observations (one raw offer × one spec version, superseding)
                       │                    │
                       │                    └──< pipeline.observation_evidence ──> pipeline.source_retrievals
                       ▼
                 pipeline.eligibility_assessments (P0/P1/P2, superseding)
                       ├──< pipeline.eligibility_exclusions  ──> reference.exclusion_reasons
                       └──< pipeline.eligibility_diagnostics ──> reference.diagnostic_codes
```

Every foreign key on the lineage chain is `ON DELETE RESTRICT`. Nothing cascades.

## 5. Schemas

Two internal schemas, neither present in the API-exposed list (`supabase/config.toml` keeps the default `["public", "graphql_public"]`).

**`reference`** holds Urdais-owned, slowly changing, versioned data: methodology lineage, instruments, the source registry, market entities and roles, the ISO 3166-1 reference set, canonical regions, region mappings, native identifiers, and the two vocabularies. Fourteen tables.

**`pipeline`** holds data-bearing tables that later phases write: retrievals, raw offers, normalized observations, evidence links, assessments, exclusions and diagnostics. Seven tables.

## 6. Table responsibilities

| Table | Responsibility | Mutability |
|---|---|---|
| `reference.methodologies` | A methodology family (UCPI) | Migration-managed |
| `reference.methodology_versions` | One version of a methodology document, with status, hash, effective interval | Migration-managed |
| `reference.instruments` | A published or proposed instrument (UCPI-H100-SXM) | Migration-managed |
| `reference.instrument_spec_versions` | One child specification version, tied to its parent methodology version | Migration-managed |
| `reference.providers` | An external company or publisher | Operational |
| `reference.source_interfaces` | One concrete interface Urdais reads, with class, access and production-approval state | Operational |
| `reference.market_entities` | A commercial party | Operational |
| `reference.entity_roles` | Seller / operator / marketplace / marketplace-host roles on an entity | Operational |
| `reference.iso_countries` | The 249 officially assigned ISO 3166-1 alpha-2 codes, from the IANA tz database | Migration-managed reference set |
| `reference.canonical_regions` | Adopted canonical countries; each code must exist in `iso_countries` | Migration-managed |
| `reference.region_mappings` | Versioned native-value → country mapping, may be unresolved | Versioned; intervals closed, never deleted |
| `reference.native_identifiers` | Source-native IDs, their canonical mapping, their stability status | Operational registry |
| `reference.exclusion_reasons` | The 26 methodology exclusion codes with stage and category | Migration-managed |
| `reference.diagnostic_codes` | The 7 methodology diagnostic codes | Migration-managed |
| `pipeline.source_retrievals` | One interaction with a source, with enumeration assessment | **Append-only, all roles** |
| `pipeline.raw_offers` | One source record, as the source expressed it | **Append-only, all roles** |
| `pipeline.normalized_observations` | One interpretation of one raw offer under one spec version | **Supersede-only** |
| `pipeline.observation_evidence` | A retrieval that supports one assertion of an interpretation | **Append-only** |
| `pipeline.eligibility_assessments` | P0/P1/P2 outcome for one interpretation under one spec version | **Supersede-only** |
| `pipeline.eligibility_exclusions` | Named stage failures on an assessment | **Append-only** |
| `pipeline.eligibility_diagnostics` | Named properties on an assessment that remains eligible | **Append-only** |

## 7. Raw versus normalized

A raw offer is what the source said. A normalized observation is what Urdais concluded. They are different tables with different lifetimes, and the same fact appears in both in different vocabularies:

| Fact | Raw (`raw_offers`) | Normalized (`normalized_observations`) |
|---|---|---|
| Geography | `native_region`, `native_geolocation` = "Virginia, US" | `canonical_region_code` = US, via `region_mapping_id` |
| Product | `native_product_label`, `native_form_factor`, `native_gpu_memory_mb` | `instrument_id` + `hardware_identity_grade` |
| Seller | `native_host_id`, `native_seller_id` | `seller_entity_id` |
| Operator | `native_operator_id` (almost always null) | `operator_entity_id` + `operator_attribution_basis` |
| Availability | `native_availability_value` = "false" or "HIGH" | `availability_state` = sold_out, `availability_evidence_grade` = 2 |
| Topology | `native_gpu_count`, `native_minimum_gpu_count`, `native_machine_fraction` | `minimum_gpu_count`, `whole_node_required`, `topology_class` |
| Tenancy | `native_tenancy_fields` | `tenancy_grade` + an `observation_evidence` row |
| Price | `native_price`, `native_currency`, `native_billing_unit`, components | `normalized_price`, USD, accelerator-hour, `price_conversion` |
| Tax | `native_tax_fields` | `tax_basis` + `tax_basis_evidence` |

Every raw `native_*` column is nullable because source reality is sparse; the full record is always in `raw_payload`. Typed columns exist for the facts the methodology evaluates, so eligibility never has to parse JSON.

## 8. Methodology lineage

`methodologies → methodology_versions` and `instruments → instrument_spec_versions → methodology_versions`. A trigger rejects a spec version that references a version of a different methodology. Both version tables carry a CHECK that a `draft` has no effective date, so no draft can ever be given a production effective date by accident.

**Lineage consistency is database-enforced downstream as well.** `instrument_spec_versions` exposes `(id, instrument_id, methodology_version_id)` as a unique key, and `normalized_observations` references that whole triple with one composite foreign key, so its three lineage columns can only ever be a combination that exists as one spec-version row: an H200 instrument paired with the H100 spec, or the H100 spec paired with an unrelated methodology version, cannot be stored. `normalized_observations` in turn exposes `(id, instrument_spec_version_id, methodology_version_id)`, and `eligibility_assessments` references that triple, so an assessment's spec version and methodology version must equal those its observation was produced under. Four negative tests prove each mismatch is rejected; the reprocessing test still shows one raw offer coexisting under two spec versions. No Phase 5 code is trusted to keep these aligned.

Seeded, with fixed UUIDs and the SHA-256 of each document at `main` e0ec563:

| Row | Version | Status | Hash |
|---|---|---|---|
| UCPI methodology | 0.1.0-draft | draft | `08c15e64…4dc4b1a` |
| UCPI-H100-SXM spec | 0.1.1-draft | draft | `a0d8c49f…0edceec` |

The instrument's lifecycle status is `launch_blocked`. Its output unit is `USD / H100 SXM accelerator-hour`. Markdown remains the authoritative methodology; these rows identify versions and never carry methodology prose.

## 9. Identity model

`market_entities` is a party; `entity_roles` attaches any of `seller`, `operator`, `marketplace`, `marketplace_host` with optional evidence and interval. The methodology's five identities resolve as follows: seller, operator and marketplace are roles; a marketplace host is a seller role plus a marketplace-host role on the same entity; the **capacity source** is derived (operator where determinable, seller otherwise) and stored on each normalized observation as `capacity_source_entity_id` for lineage, never as a role.

`operator_entity_id` is nullable and is expected to be null on every observation at launch. Nothing infers it; an `observation_evidence` row with role `operator_attribution` is the only way it is supported.

## 10. Source model

`providers` are companies. `source_interfaces` are the things Urdais reads. Source class is one of the seven classes observed in Phase 2 (offer interface, catalog/price interface, availability interface, product reference documentation, hardware reference documentation, provider terms documentation, price surface). Access class (`public_unauthenticated`, `api_key`, `account_authentication`, `documentation`, `sales_only`, `unknown`) and production-access state (`research_usable`, `production_review_pending`, `production_approved`, `production_blocked`) are operational metadata. Two CHECKs encode the methodology's operational prerequisite: `production_approved` requires `terms_review_state = 'permitted'`, and `not_permitted` terms force `production_blocked`.

**No provider and no source interface is seeded.** The tables can represent Vast, Lambda, RunPod, Azure and the rest; no row says they are constituents.

## 11. Region mappings

`reference.iso_countries` holds the 249 officially assigned ISO 3166-1 alpha-2 codes, generated from the IANA Time Zone Database's public-domain `iso3166.tab` (current to ISO/TC 46 N1127, 2024-02-29). `canonical_regions.code` is a foreign key into it, so **membership in ISO 3166-1 is proven, not approximated**: a well-formed but unassigned pair such as `ZQ` fails the FK. Two CHECKs remain as a clearer first line: format, and exclusion of the user-assigned and exceptionally reserved codes (`AA`, `AC`, `CP`, `CQ`, `DG`, `EA`, `EU`, `EZ`, `FX`, `IC`, `SU`, `TA`, `UK`, `UN`, `ZZ`, `QM`–`QZ`, `XA`–`XZ`). **`EU` cannot be inserted as a canonical region.** No country is adopted in Phase 3; adoption is a migration alongside the evidence for its first mapping.

`region_mappings` records `source_interface_id`, the exact `native_region_value`, `mapping_status` of `mapped` or `unresolved`, `canonical_region_code` and `confidence` (both required when mapped, both null when unresolved, by CHECK), free-text `evidence`, an optional `evidence_retrieval_id`, a `version`, and an effective interval. A partial unique index allows one open-ended mapping per native value per interface; a new version closes the old interval first. A CoreWeave "EU" table heading is stored as an `unresolved` row and produces `REGION_UNRESOLVED` downstream; the schema cannot store a representative country for it.

## 12. Retrieval provenance

`source_retrievals` is inserted once, after the response or error is known, with a collector-supplied `idempotency_key`. It records what was asked (`request_method`, `request_url`, `request_parameters`), what came back (`response_status`, `response_content_type`, `response_hash`, `response_byte_length`, `response_body` for structured payloads or `raw_artifact_ref` for large ones, `record_count`, `source_pagination`), what the source claimed (`source_claimed_complete`), what Urdais concluded (`enumeration_assessment`, `enumeration_evidence`), and any `error`. A successful response must retain at least a hash.

## 13. Timestamp semantics

Three distinct times, kept on both raw and normalized rows:

| Column | Meaning | Default |
|---|---|---|
| `observed_at` | When Urdais retrieved or re-observed the source | none; required |
| `source_effective_at` | When the source itself says the price took effect | **none; nullable; never derived from `observed_at`** |
| `availability_observed_at` | When Urdais last directly re-observed the availability evidence | none; required whenever an availability value is present |

`availability_observed_at` is not an availability-change time and not a provider event time; the column comments say so. A test asserts that none of these columns carries a default and that a row with `source_effective_at` null stays null.

## 14. Enumeration completeness

`enumeration_assessment` is a typed, CHECK-constrained column on every retrieval: `complete`, `incomplete`, `unknown`, or `claimed_complete_observed_incomplete`. The last is the Phase 2 case and is only storable when `source_claimed_complete is true`. It reaches the assessment layer through the `ENUMERATION_INCOMPLETE` diagnostic; the lineage from a diagnostic back to the retrieval that earned it runs assessment → normalized observation → raw offer → retrieval.

## 15. Eligibility persistence

`eligibility_assessments` records `p0`, `p1`, `p2` as booleans with CHECKs `p1 ⇒ p0` and `p2 ⇒ p1`, plus `input_status` from the family's input vocabulary (`valid`, `stale`, `ineligible`, `unavailable`, `conflicted`) with a CHECK that `p2` is `valid` or `stale` and that a `valid` input is `p2`. It references the normalized observation, the spec version and the methodology version through one composite foreign key, so the versions on an assessment are necessarily the versions of its observation, and the same observation carries one current assessment per spec version.

## 16. Exclusions versus diagnostics

Two tables, two vocabularies, no shared string array. `eligibility_exclusions.reason_code` references the 26 seeded `exclusion_reasons`, each tagged with the stage it fails (3 at P0, 7 at P1, 16 at P2). A trigger rejects an exclusion whose stage the assessment passed. `eligibility_diagnostics.diagnostic_code` references the 7 seeded `diagnostic_codes` and carries a `detail` JSONB for values such as a carry age. A diagnostic on a `p2 = true` assessment is legal; an exclusion on one is not.

## 17. Versioning

Every normalized observation and every assessment references an `instrument_spec_version_id` and a `methodology_version_id`, and composite foreign keys guarantee those references agree with each other and with the instrument (section 8). Region mappings carry their own version and the observation references the specific mapping row. The same raw offer under spec 0.1.1 and a future 0.1.2 yields two coexisting rows, verified by test.

## 18. Immutability

Two trigger functions in `pipeline`. `forbid_mutation()` raises on any UPDATE or DELETE and is attached to `source_retrievals`, `raw_offers`, `observation_evidence`, `eligibility_exclusions` and `eligibility_diagnostics`. It fires for superusers too. `allow_only_supersession()` is attached to `normalized_observations` and `eligibility_assessments`; it permits exactly one UPDATE, setting `superseded_by_id`, `superseded_at` and `supersession_reason` together on a not-yet-superseded row with no other column changed, and rejects DELETE. Independently of the triggers, `service_role` holds no UPDATE or DELETE privilege on the evidence tables and no DELETE on the interpretation tables.

Supersession within one transaction is: update the old row with the new row's id, then insert the new row. The self-referencing FK is `DEFERRABLE INITIALLY DEFERRED` so the sequence is possible, and the one-current partial unique index is satisfied at the insert.

## 19. Idempotency

Retrievals: `idempotency_key` is unique; a retried write conflicts and is skipped. Raw offers: `(retrieval_id, row_ordinal)` is unique, so re-inserting a retrieval's rows is a no-op; `record_hash` is indexed for content checks. Identical observations at different times are different rows by design, verified by test. No provider is assumed to have stable offer IDs; `source_native_offer_id` is nullable and indexed, never a key.

## 20. Access and RLS

Option A, internal schemas, with Option B layered on top. Neither schema is API-exposed. `anon` and `authenticated` hold no privilege at schema, table, sequence or function level, and default privileges for future objects revoke them too. Every table has RLS enabled with zero policies. `service_role` has USAGE and the per-table privileges the immutability model allows. The security test impersonates `anon` and `authenticated` against all 21 tables for SELECT and INSERT and confirms `insufficient_privilege`, confirms `service_role` can read as a positive control, and asserts the privilege matrix via `has_table_privilege`.

## 21. Indexes

All indexes are justified by an access pattern named in the Phase 3 brief:

| Index | Pattern |
|---|---|
| `source_retrievals (source_interface_id, requested_at desc)` | Latest retrievals by source |
| `raw_offers (retrieval_id, row_ordinal)` | Offers by retrieval; also the idempotency key |
| `raw_offers (observed_at desc)` | Raw rows by date |
| `raw_offers (native_seller_id / native_host_id, observed_at desc)` partial | Rows by seller |
| `raw_offers (record_hash)` | Content-identity checks |
| `normalized_observations (raw_offer_id, instrument_spec_version_id)` partial unique | One current interpretation per spec |
| `normalized_observations (instrument_id, observed_at desc)` partial | H100 rows by date |
| `normalized_observations (instrument_id, canonical_region_code, observed_at desc)` partial | Observations by country and time |
| `normalized_observations (seller_entity_id, observed_at desc)` partial | Rows by seller |
| `eligibility_assessments (instrument_spec_version_id, calculation_date)` partial on `p2` | P2 population by date |
| `region_mappings (source_interface_id, native_region_value)` partial unique | One current mapping |
| `region_mappings (source_interface_id, native_region_value, effective_from desc)` | Mapping lookup as of a time |

## 22. Field-contract mapping

Every field in the Phase 2 Ingestion Field Contract, its classification there, and where it lives here.

| Methodology field | Classification | Storage location | Nullable? | P2 implication |
|---|---|---|---|---|
| Source identity | Required raw | `source_retrievals.source_interface_id` | No | — |
| Source class | Required raw | `source_interfaces.source_class` | No | — |
| Access class | Required raw | `source_interfaces.access_class` | No | Never an eligibility attribute |
| Provider identity | Required raw | `source_interfaces.provider_id` | No | — |
| Seller identity | Required raw | `raw_offers.native_seller_id` / `native_host_id`; `normalized_observations.seller_entity_id` | Raw yes; normalized yes | Absent canonical seller blocks P2 at evaluation |
| Marketplace identity | Nullable by methodology | `raw_offers.native_marketplace_id`; `normalized_observations.marketplace_entity_id` | Yes | None |
| Operator identity, basis, evidence | Nullable by methodology | `normalized_observations.operator_entity_id`, `operator_attribution_basis`; `observation_evidence` role `operator_attribution` | Yes | None; `OPERATOR_UNDETERMINED` diagnostic |
| Provider offer identifier | Required raw | `raw_offers.source_native_offer_id` | Yes (not every source has one) | — |
| Provider product / SKU | Required raw | `raw_offers.source_native_product_id` | Yes | — |
| Raw source reference | Required raw | `source_retrievals.request_url`, `response_hash`, `response_body` / `raw_artifact_ref`; `raw_offers.raw_payload` | No | — |
| Collection timestamp | Required raw | `raw_offers.observed_at`; copied to normalized | No | — |
| Source-effective timestamp | Nullable by methodology | `raw_offers.source_effective_at`; copied to normalized | **Yes, no default** | `SOURCE_EFFECTIVE_TIME_ABSENT` diagnostic |
| Availability observation timestamp | Required derived | `raw_offers.availability_observed_at`; `normalized_observations.availability_observed_at` | Yes until availability present | `AVAILABILITY_STALE` when aged out |
| Calculation date | Required derived | `eligibility_assessments.calculation_date` | Yes until Phase 6 | — |
| Native price | Required raw | `raw_offers.native_price` numeric | Yes (quote-only) | `QUOTE_REQUIRED` |
| Native currency | Required raw | `raw_offers.native_currency` | Yes | — |
| Billing unit and granularity | Required raw | `raw_offers.native_billing_unit` | Yes | `UNIT_UNRESOLVED` |
| Normalized price | Required derived | `normalized_observations.normalized_price` numeric, `normalized_currency`, `normalized_unit`, `price_conversion` | Yes until normalized | — |
| Mandatory fee components | Required raw where decomposed | `raw_offers.native_price_components`, `native_fee_fields`; `normalized_observations.mandatory_fee_interpretation` | Yes | — |
| Usage-dependent charges | Optional diagnostic | `normalized_observations.usage_dependent_charges` | Yes | None |
| Minimum spend / commitment | Nullable by methodology | `raw_offers.native_minimum_spend`, `native_commitment`; `normalized_observations.minimum_commitment` | Yes | None |
| Promotional indicators | Optional diagnostic | `raw_offers.native_promotional_fields`; `normalized_observations.promotional_indicators` | Yes | `PROMOTIONAL_PRICE` at P1 if the rate is promotional |
| Tax basis | Nullable but flagged | `raw_offers.native_tax_fields`; `normalized_observations.tax_basis`, `tax_basis_evidence` | Yes | `TAX_BASIS_INCLUSIVE` blocks; `unresolved` is a diagnostic |
| Accelerator vendor, model, architecture | Required raw | `raw_offers.native_vendor`, `native_gpu_model`, `native_architecture` | Yes | `WRONG_HARDWARE` at P0 |
| Form factor | Nullable but blocks P2 | `raw_offers.native_form_factor` | Yes | `HARDWARE_VARIANT_UNRESOLVED` at P0 |
| Device memory | Nullable but blocks P2 | `raw_offers.native_gpu_memory_mb` | Yes | `HARDWARE_VARIANT_UNRESOLVED` at P0 |
| Identity evidence grade | Required derived | `normalized_observations.hardware_identity_grade` | Yes until normalized | — |
| Accelerator count | Required raw | `raw_offers.native_gpu_count`; `normalized_observations.gpu_count` | Yes | — |
| Minimum purchasable count | Nullable but blocks P2 | `raw_offers.native_minimum_gpu_count`; `normalized_observations.minimum_gpu_count`, `minimum_topology_source_field` | Yes | `MINIMUM_TOPOLOGY_UNKNOWN` at P1 |
| Machine / node accelerator total | Optional diagnostic | `raw_offers.native_machine_gpu_total`; `normalized_observations.machine_gpu_total` | Yes | None |
| Whole-node requirement | Required derived | `normalized_observations.whole_node_required` | Yes until normalized | `WHOLE_NODE_REQUIRED` at P1 |
| Machine-occupancy fraction | Optional diagnostic, never a device fraction | `raw_offers.native_machine_fraction`; `normalized_observations.machine_fraction` | Yes | None |
| Native region identifier | Nullable but blocks P2 | `raw_offers.native_region` | Yes | `REGION_UNRESOLVED` |
| Finest disclosed geography | Nullable by methodology | `raw_offers.native_geolocation`, `native_geography_extra` | Yes | None |
| Canonical region | Required derived | `normalized_observations.canonical_region_code` | Yes | `REGION_UNRESOLVED` |
| Region mapping version, confidence | Required derived | `normalized_observations.region_mapping_id` → `region_mappings.version`, `confidence` | Yes | — |
| Raw availability signal | Nullable but blocks P2 | `raw_offers.native_availability_value`, `native_availability_fields` | Yes | `AVAILABILITY_UNKNOWN` |
| Canonical availability state | Required derived | `normalized_observations.availability_state` | Yes until normalized | `UNAVAILABLE`, `WAITLISTED`, `QUOTE_REQUIRED` |
| Availability evidence grade | Required derived | `normalized_observations.availability_evidence_grade` | Yes until normalized | `AVAILABILITY_EVIDENCE_INSUFFICIENT`; `AVAILABILITY_GRADE_3` diagnostic |
| Quantity at which availability established | Required derived where conditional | `normalized_observations.availability_quantity` | Yes | — |
| Procurement mode | Nullable but blocks P2 | `raw_offers.native_procurement_mode`; `normalized_observations.procurement_mode` | Yes | `WRONG_PROCUREMENT_MODE` at P1 |
| Preemptibility | Nullable but blocks P2 | `raw_offers.native_preemptible`, `native_bid_fields`; `normalized_observations.preemptible` | Yes | `PREEMPTIBLE` at P1 |
| Price formation | Optional diagnostic | `normalized_observations.price_formation` | Yes | None |
| Service product | Nullable but blocks P2 | `normalized_observations.service_product` | Yes | `WRONG_SERVICE_PRODUCT` at P1 |
| Tenancy evidence and grade | Nullable but blocks P2 | `raw_offers.native_tenancy_fields`; `normalized_observations.tenancy_grade`; `observation_evidence` role `tenancy` | Yes | `TENANCY_UNRESOLVED` at P1; `FRACTIONAL_OR_SHARED_DEVICE` at P0 |
| vCPU per accelerator | Blocks P2 once envelope exists | `raw_offers.native_vcpu`; `normalized_observations.vcpu_per_accelerator` | Yes | `BUNDLE_OUT_OF_ENVELOPE` once a level exists |
| Host memory per accelerator | Blocks P2 once envelope exists | `raw_offers.native_host_memory_mb`; `normalized_observations.host_memory_gb_per_accelerator` | Yes | Same |
| Local storage per accelerator | Blocks P2 once envelope exists | `raw_offers.native_storage_gb`; `normalized_observations.storage_gb_per_accelerator` | Yes | Same |
| Intra-node and inter-node interconnect | Blocks P2 once envelope exists | `raw_offers.native_nvlink`, `native_network`; `normalized_observations.intra_node_interconnect`, `inter_node_fabric` | Yes | Same |
| Seller-level representative price, eligible offer set, reduction rule | Required derived | **Phase 6**; the eligible offer set is reconstructible from current assessments | — | — |
| Capacity-source identity, attribution status, collapse rule | Required derived | `normalized_observations.capacity_source_entity_id`, `operator_attribution_basis`; collapse rule is **Phase 6** | Yes | — |
| Input status and exclusion reason | Required derived | `eligibility_assessments.input_status`; `eligibility_exclusions` | No | — |

**Fields not representable: none.** The two absences the methodology names, a seller-stated availability-change time and a source-effective price time, are represented as absences: the first has no column because no source has it, the second is nullable.

## 23. Open methodology parameters, deliberately not encoded

| Parameter | Status | What the schema stores instead |
|---|---|---|
| Bundle envelope level | Unresolved | Per-accelerator vCPU, memory, storage, interconnect on every observation; no bound in any CHECK |
| Seller-reduction rule | Provisional, unratified | Every eligible interpretation with its offer set reconstructible; `ENUMERATION_INCOMPLETE` on the retrieval and the diagnostic; no rule column |
| `price_max_age`, `availability_max_age`, `reference_data_max_age` | Unresolved | `observed_at`, `source_effective_at`, `availability_observed_at` on every row; `PRICE_STALE` / `AVAILABILITY_STALE` codes exist; no age in any CHECK |
| Price carry limit | Unresolved | `PRICE_CARRIED` diagnostic with `detail` for the age; no limit encoded |
| Marketplace seller-identifier stability | Unresolved | `native_identifiers.stability_status` defaults to `unresolved` and cannot be raised without evidence |
| Minimum participants, weakest-grade share, carried share, unresolved-tax share | Unresolved | Assessments and diagnostics that a Phase 6 gate can count; no threshold anywhere |

No CHECK constraint mentions 125 GB, 24 hours, 1 hour, 3 participants, or 20%.

## 24. Phase 4 attachment points

Collectors write `source_retrievals` (one row per interaction, after completion, with an idempotency key and an honest `enumeration_assessment`) and `raw_offers` (one row per record, with `raw_payload` and every `native_*` the source exposes). They register `providers` and `source_interfaces` first, leaving `production_access_state` at `research_usable` until terms are reviewed. They may upsert `native_identifiers` with observation times but never raise `stability_status` without evidence.

## 25. Phase 5 attachment points

Normalization reads current `raw_offers`, writes `normalized_observations` under a spec version, links `observation_evidence`, and consults `region_mappings` as of the observation time. Eligibility writes `eligibility_assessments` with `p0`/`p1`/`p2` and the named `eligibility_exclusions` and `eligibility_diagnostics`. Re-normalization supersedes rather than edits.

## 26. Phase 6 attachment points

Calculation introduces the publication layer: calculation runs, seller-level observations with the reduction rule applied, capacity-source collapse, regional medians and percentiles, published UCPI observations with status, percentage change and composition disclosure. Those tables attach above `eligibility_assessments` where `p2` is true for a `calculation_date`. None exists yet, and a test asserts none does.

## 27. Hosted `UrdaisDev` lifecycle

Created 13 September 2026 in organization "Bryceson's Apps", region `us-east-1`, PostgreSQL 17, at a recurring cost the owner approved. Linked from this repository with `supabase link`. Receives only migrations that have passed the local replay, applied explicitly and recorded in `supabase_migrations.schema_migrations` with the repository's version numbers, so `supabase db push` and the hosted history agree. Never modified by hand: a correction is a new migration. Holds Urdais reference rows only; no provider, no observation, no value. PR CI never connects to it.

## 28. Explicit non-goals

No collector, scraper, scheduler, cron, queue or worker. No HTTP call to any provider. No normalization or eligibility code. No seller reduction, calculation, or publication table. No public API endpoint. No frontend change. No Supabase Storage bucket, Auth flow, Edge Function, Realtime or Stripe work. No generated TypeScript types committed: nothing consumes them yet and the CLI's generator requires Docker locally. No production project, no production data, no production UCPI value. No provider seeded as a constituent. No unresolved methodology parameter given a value.
