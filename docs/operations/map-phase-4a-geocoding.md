# Map Phase 4A: immediate geocoding queue

Run date: **18 September 2026**.

This is the canonical operational record for the Phase 4A conversion of supported physical locations to coordinates. It joins the original Phase 1 facility package, the Class B location remediation, and the approved global data-center expansion without turning geocoding into facility research.

## Inputs and queue

- `URDAIS_MAP_RESEARCH_PHASE_1.md`: the stable 78-facility baseline.
- `docs/operations/map-class-b-42-location-remediation.md`: 28 address-only Class B records.
- `URDAIS_GLOBAL_DATA_CENTER_EXPANSION.md`: 47 address/campus rows meeting the queue rules, 15 overlapping the Class B set and 32 incremental facilities.
- `data/map/facilities.v1.json`: the canonical structured facility dataset, now contract `/2`.

The final queue is **60 unique facilities**: all 28 Class B address-only records plus 32 incremental global-only records. City-only rows and every explicit human-review/entity-grain hold were excluded before provider access. No facility was discovered through the geocoder.

Five pairs/groups intentionally share identical queries, so the 60-item queue produced **55 cached provider requests** rather than repeating the same lookup for colocated entities.

## Provider workflow

No approved geocoder existed in the repository. The bounded command in `scripts/map/geocode-address-queue.ts` therefore uses the public Nominatim endpoint under its published usage policy:

- explicit `--fetch` is required for network access;
- requests are serialized with at least 1.1 seconds between calls;
- the user agent identifies Urdais and its repository;
- only 429 and 5xx responses receive bounded retries, at most three attempts;
- each response is written to `data/map/geocoding/nominatim-cache.v1.json` immediately;
- cache keys are SHA-256 of country code plus normalized query, making reruns deterministic and preventing repeat calls;
- up to five raw candidates, full address metadata, provider category/type, importance, query, timestamps, and the selected raw result are retained.

The geocoder transforms a researched location claim. It is never evidence that the facility exists. The original source URLs and the exact documented location remain on both the queue and facility record.

## Review results

| Outcome | Count |
| --- | ---: |
| `geocoded_ready` | 25 |
| `geocoded_review` | 8 |
| `geocode_no_match` | 26 |
| `geocode_conflict` | 1 |
| `skipped_identity_hold` | 0 |

The 25 ready results divide into **8 existing Phase 3 facilities** and **17 global-only facilities**. The 32 global-only records divide into 17 ready/public research and 15 internal review (10 no-match, 4 review, 1 conflict). Reviewed overrides are explicit in `data/map/geocoding/review-decisions.v1.json`; notably, the Vantage Santa Clara I result was rejected because it resolved to a Digital Realty-labelled building with a different postal code.

Precision always comes from the research. No result upgrades street to building, and no city, postcode, municipality, county, or state centroid is accepted as ready. Several provider results that returned only a road remain in review even though they had valid coordinates.

## Canonical dataset and public states

The canonical dataset now contains **110 facilities**: the original 78 plus the 32 authorized facilities already present in the global research artifact. All keep their stable research IDs.

Existing schema conventions provide the required state model:

| Product meaning | Existing state | Public map |
| --- | --- | --- |
| Verified / fully approved | `published` | yes, after map-safety filters |
| Public research | `research` | yes, after the same map-safety filters |
| Internal review | `review_required` | no |
| Rejected | rejection register, not a facility row | no |

`research` is not a category and the four infrastructure categories are unchanged. The public read query admits `published` and `research` only when the row is current, non-city map eligible, has evidence, has admissible positioning evidence under methodology 2.0.0, has a live lifecycle, and satisfies the compute-relationship rule for power infrastructure. The public response derives `verified` or `research` for a minimal popup indicator; it does not expose internal confidence or review notes.

## Before and after

| Measure | Before | After |
| --- | ---: | ---: |
| Canonical facilities | 78 | 110 |
| Map-eligible coordinates | 36 | 61 |
| Verified/public and map eligible | 29 | 29 |
| Research/public and map eligible | 0 | 25 |
| Total public map candidates after state and position gates | 29 | 54 |

Exactly **25 records were promoted to map eligibility**. Seven pre-existing map-eligible records remain `review_required`, so the resulting 61 map-eligible records consist of 54 public candidates and 7 internal-review records.

After the update, the canonical dataset has **36 address-only records**, **1 city-only record**, and **22 `review_required` records**. The source artifacts' explicit identity-grain holds remain separate and untouched: 13 in the global expansion and 3 in the Class B remediation. None entered this queue.

## Import and safety notes

The dry-run importer accepts all 110 facilities with no errors (digest `41bba87d3616eadad923a1bdeec8246568abf8fae45189467ce0c580d4d16689`). It reports 29 `published`, 59 `research`, 22 `review_required`, 61 map eligible, 215 evidence records, 614 claims, 91 facts, 135 aliases, and 20 relationships. A transactional write was exercised only against the throwaway local database; the public read returned 54 records (29 verified and 25 research) and passed its response validator. No hosted database was modified.

Shared coordinates are retained intentionally for distinct entities at one site, including the three Equinix Slough IBXs. A shared position is never a deduplication key. The cache and result files retain provider output; the canonical facility record retains only reviewed ready coordinates and a concise transformation note.

## Exact next phase: Address Research Queue

The next phase should start from canonical records that are not map eligible and lack a supported building/campus/street location. It should:

1. exclude all `review_required` entity-grain conflicts into a separate entity-resolution queue;
2. research addresses only from Tier 1 operator/government/property sources first, retaining source-native facility IDs and aliases;
3. require a documented non-city location before creating a geocoding item;
4. run newly supported locations through this same cached review workflow;
5. classify safe results as public `research`, keep ambiguous results `review_required`, and promote to `published` only through the existing full approval gates;
6. never use city or metro centroids as interim pins.

This should be an address-evidence pass, not another broad facility-discovery pass.
