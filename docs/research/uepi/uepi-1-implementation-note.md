# UEPI-1 — implementation note

**Internal. Not routed, not registered in the docs catalog.** The methodology authority is the frozen
[UEPI V1 specification](./uepi-v1-specification.md) at version 1.0.0; this note records what UEPI-1
built against it and what it deliberately did not.

**UEPI-1 does not make UEPI production-live.** No source adapter exists, no ingestion runs, no cron
is scheduled, no backfill has been performed, and no UEPI value has been published. The demo UEPI
family on `/markets/uepi` is untouched and still says it is demo data.

## What this phase is

The substrate, so that UEPI-2 can be mechanical: seven adapters in, canonical observations out,
with the methodology and the electricity-price arithmetic already settled and tested.

## Specification freeze

| Field | Value |
| --- | --- |
| Slug | `uepi` |
| Version | `1.0.0`, status `approved` |
| Document | `docs/research/uepi/uepi-v1-specification.md` |
| Digest | `14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a` |

Registered in `reference.methodologies` and `reference.methodology_versions`, which is the
mechanism Flexible Capacity and Grid Buildout Velocity already use. **Authorisation is a registry
read**: `assertSpecificationApproved` checks that the version is registered, approved, and carries
the digest the code was written against. The file on disk authorises nothing, because `docs/` is
absent from the serverless bundle.

The approved artefact is the specification itself. A public methodology page derived from its §C
will come later with its own row and digest; it supersedes nothing. A rule change is a new version,
never an edit: `reference.methodology_versions` is append-only in practice, and the database refuses
to release a value whose claimed digest is not the registered one.

## Core contracts

`src/lib/uepi/`

| Module | What it owns |
| --- | --- |
| `types.ts` | The three layers — raw source record, normalized hourly observation, released daily value — plus the construct, derivation, posture and quality vocabularies |
| `benchmarks.ts` | The seven canonical benchmarks, mirroring `reference.power_price_benchmarks`; a test proves the mirror and the migration agree |
| `methodology.ts` | Specification identity, digest, the registry gate, and the two operational constants (six stored decimal places, the plausibility guard) |
| `operating-day.ts` | The market operating day as instants: 23, 24 or 25 hours derived from the zone, never assumed |
| `decimal.ts` | Exact decimal sum and mean. A float pipeline would not reproduce the input digest |
| `calculate.ts` | `calculateDailyValue`: pure, order-independent, digest-producing |
| `release.ts` | `evaluateRelease`: twelve named refusal reasons, and two intents — internal release and public release |
| `rights.ts` | A typed wrapper over `@/lib/rights/publication`; UEPI adds posture, and restates no policy |
| `fixtures.ts` | Synthetic hours for tests. No real market file is parsed or committed in this phase |

Database: `reference.power_price_benchmarks`, `pipeline.raw_uepi_price_records`,
`pipeline.uepi_price_observations`, `pipeline.uepi_daily_values`, `pipeline.uepi_ingestion_runs`
(migration `20261021100000_uepi_foundation.sql`). Raw records are append-only; observations and
released values supersede rather than update. A partial day cannot be stored at all — the
completeness equality is a check constraint, not only a rule in code.

## Version linkage

The specification version and digest are stamped onto every calculation, and `uepi_daily_values`
refuses a row whose `methodology_version_id` is not an approved UEPI version, or whose
`specification_digest` is not that version's registered `content_hash`. Tests follow the version
from normalized inputs through the calculation into the released shape.

## Negative-return policy

Wholesale prices can be zero or negative — SPP's North Hub daily mean was −$0.11/MWh on
12 April 2026 — and ordinary percentage return breaks in ways that still print a plausible number.
The rule (§D) now lives in `src/lib/market-change.ts` and applies to every series, not only UEPI:

- the absolute change is always computed and always shown;
- a percentage is published only when **both** endpoints are strictly positive;
- direction always comes from the sign of the absolute change;
- a withheld percentage carries the reason, and "no comparison exists" stays distinct from
  "a percentage would mislead".

Two shared defects were fixed rather than worked around:

- **`src/lib/market-ranges.ts`** guarded only a zero base, so a negative base returned a
  sign-inverted percentage. It now refuses both, through the one shared rule. No currently
  published Urdais series can go non-positive, so no published number changes.
- **`src/components/charts/detailed-market-chart.tsx`** fell back to plotting raw values while the
  axis still read `%`. The basis decision, the plotted values and the axis label now come from one
  call (`src/components/charts/plot-basis.ts`), a percent axis is possible only when every series
  has a strictly positive base, and a refused rebase drops the comparison and says why.

## Rights gating

The classifications come from the specification and are not upgraded. Two gates, both of which must
pass: Urdais's own posture for the series, and the terms determination for the purpose.

| Series | Classification (public derived display) | Posture | Public at V1 |
| --- | --- | --- | --- |
| `uepi-ercot` | reusable with attribution | publishable | yes, with attribution |
| `uepi-caiso` | ambiguous, legal review | publishable | yes, under founder-accepted risk |
| `uepi-nyiso` | ambiguous, legal review | publishable | yes, under founder-accepted risk |
| `uepi-pjm` | unsuitable without permission | internal only | no |
| `uepi-miso` | unsuitable without permission | internal only | no |
| `uepi-spp` | unsuitable without permission | internal only | no |
| `uepi-iso-ne` | ambiguous, legal review | not built | no — no credential, no observed payload |

Retention is a separate determination from display, because the answers differ: PJM's terms permit
internal use and forbid derived redistribution, while MISO's clause is broad enough that internal
retention is itself unresolved and is recorded that way.

## What remains for later phases

- **UEPI-2**: the seven source adapters, normalization from real files, and historical backfill.
  Committed fixtures for the dated files the research parsed belong to that phase.
- **UEPI-3**: the read model, the public API, the surface, and retiring the demo family.
- **UEPI-4 and later**: the scheduled run, production backfill, freshness monitoring, and the
  unattended-rollover closeout gate.
- **ISO-NE**: not before a credential exists and one authenticated day — including a transition
  day — has been parsed.

## Known residue

`src/lib/uepi/operating-day.ts` carries its own zone-offset primitive. `src/lib/flexible-capacity/period.ts`
and `src/lib/uavi/snapshot.ts` each carry one too. Converging the three is a cleanup with its own
risk to two shipped products, and it was not taken on inside this phase.
