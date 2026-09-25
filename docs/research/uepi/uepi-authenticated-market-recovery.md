# UEPI authenticated-market recovery — ERCOT and ISO-NE

**Internal. Not routed, not registered in the docs catalog.** The methodology authority remains the
frozen [UEPI V1 specification](./uepi-v1-specification.md) at 1.0.0, digest
`14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a`, unchanged by this phase.

**No production write of any kind.** The UEPI-1 foundation migration is still not applied to
UrdaisProd, no UEPI observation exists there, and no API, read model, surface or cron was added.

## Outcome

| Market | Before | After | State |
| --- | --- | --- | --- |
| ERCOT | no adapter — credential | adapter, 3 real fixtures, 13+ months reachable | **READY** |
| ISO-NE | no adapter — no observed payload | adapter, 3 real fixtures, 13+ months reachable | **READY_WITH_CAVEAT** — internal only, publication awaits the legal review §J.3 names |
| PJM | no adapter — credential and membership | unchanged, out of scope | **BLOCKED_AUTH** |

Six of the seven markets now have an evidence-backed adapter.

## Authentication

**ERCOT** uses the documented ROPC flow against `ercotb2c.b2clogin.com`, which returns an id token
valid for an hour. The token is acquired once, held in memory, reused until five minutes before
expiry and re-acquired when the API refuses it — never written to disk, never returned to a caller
in a loggable form, never requested per day. Requests carry `Authorization: Bearer` and
`Ocp-Apim-Subscription-Key`.

**ISO-NE** uses HTTP Basic over TLS. The header is built per request from the configured credential
and is treated as a password in plaintext, because base64 is encoding rather than encryption.

Redaction is structural rather than remembered: `credentials.ts` owns the secrets, every URL that
reaches an error or a stored retrieval passes through `redactUrl`, secret-bearing headers are
replaced by name, and a publisher's own error text is scrubbed of known secrets before it is used.
A test suite asserts the negative: distinctive sentinel credentials must not appear in any thrown
error, message or header record. A production check confirmed the same against the database — the
stored retrieval rows contain none of the five secrets.

## What the payloads settled

Both sources matched the frozen specification. Nothing contradicted it, and two open items closed.

**ERCOT — daylight saving, previously "expected, unverified".** The authenticated NP4-190-CD
response returns 23 rows on spring forward, omitting the hour-ending label entirely (01:00, 02:00,
**04:00** … 24:00), and 25 rows in autumn where hour-ending 02:00 appears twice and `DSTFlag`
separates them: the daylight-time occurrence is `true` (48.25 on 2 November 2025) and the
standard-time repeat is `false` (46.44). ERCOT is the only UEPI source that resolves a repeated hour
with a flag.

One correction came out of that file. ERCOT labels an hour by its **starting** clock hour plus one,
not by the wall clock an hour later: the hour beginning 01:00 CST on a spring-forward day ends at
03:00 CDT and is labelled `02:00`. A reader that computed the label from the ending time would ask
the file for an hour it does not contain.

**ISO-NE — the schema, previously derived rather than observed.** `HourlyLmps.HourlyLmp[]` with
`BeginDate`, `Location`, `LmpTotal`, `EnergyComponent`, `CongestionComponent` and `LossComponent`,
exactly as the derived schema had them. Location 4000 is `.H.INTERNAL_HUB`, type `HUB`.

`BeginDate` carries an explicit offset — `2026-09-23T00:00:00.000-04:00` — which settles the hour
convention the specification recorded as unresolved: **hour beginning**, with the instant stated by
the source. Transition days return 23 and 25 hours, and the repeated local hour is separated by the
offset itself (`-04:00` then `-05:00`). This is the only UEPI source that hands over unambiguous
instants; nothing in the adapter counts rows or trusts their order.

## Fixtures

Six authenticated payloads, committed complete, each catalogued with its digest:

| File | Market | Operating day | Bytes | Digest |
| --- | --- | --- | --- | --- |
| `ercot-2026-09-23.json` | ERCOT | ordinary | 2,447 | `6c9cc034…5d9375a1` |
| `ercot-2026-03-08.json` | ERCOT | spring forward | 2,403 | `3dc85f39…53876c15` |
| `ercot-2025-11-02.json` | ERCOT | fall back | 2,490 | `63d0f9cc…be51bc87` |
| `isone-2026-09-23.json` | ISO-NE | ordinary | 4,840 | `334123d7…e34ead559` |
| `isone-2026-03-08.json` | ISO-NE | spring forward | 4,622 | `200f8434…cb35533dc` |
| `isone-2025-11-02.json` | ISO-NE | fall back | 5,031 | `f708b507…5e9c423f1` |

None contains a credential: ERCOT's token and key travel in headers, and the settlement point is a
query parameter, so the response holds one hub rather than the footprint.

## Coverage and verification

Both markets answered for **2024-11-03**, comfortably beyond the thirteen-month target, and both
transition days release through the full path (23 and 25 hours).

A local backfill of 2026-09-21..23 wrote three released days per market. `npm run uepi:verify`
recomputed all six from their stored hours exactly. Re-running skipped all six and wrote nothing.
Daily values were then recomputed independently, in Python, straight from the raw payloads:
ERCOT 2026-09-23 = 44.251250 and ISO-NE 2026-09-23 = 33.567500, both matching the stored values.

## One defect this phase found in its own code

The retrieval layer grew credential support and the backfill kept passing only the caller's
options, so every authenticated request went out bare and ERCOT answered 401 for a whole range.
From the outside that is indistinguishable from a rejected credential. Fixed, and pinned by a
regression test. A second, smaller one: a missing credential surfaced as "could not be reached",
sending an operator to a publisher's status page for a problem that is in `.env`. It now reports
`AUTHENTICATION_REQUIRED` and names the absent variable.

## Rights: unchanged

No classification, permission, disposition or attribution moved. ERCOT keeps its attribution
posture and remains publishable; ISO-NE keeps `ambiguous_requires_legal_review`.

What did change for ISO-NE is its **posture**, from `not_built` to `internal_only` — the narrow
step the evidence supports. It may now be ingested, calculated and stored; it may not be displayed,
and the publication gate refuses it exactly as it refuses PJM, MISO and SPP. Publication still
waits on the legal review the specification names, which is a founder decision and not a
consequence of a credential working.

## Migration

One, `20261022100000_uepi_authenticated_market_evidence.sql`, and the phase brief expected none.
It records observation and grants nothing: `dst_evidence` moves to `verified` for ERCOT and CAISO,
ISO-NE's `hour_convention` becomes `hour_beginning` with `dst_evidence` verified, and ISO-NE's
posture becomes `internal_only`. A verification block in the migration itself refuses to let the
posture distribution drift, and a test asserts the SQL touches no rights table.

CAISO is included because UEPI-2 captured and committed both of its transition days and did not
update the row, which left a release gate refusing days the repository already holds proof for.

## Still open

- **PJM**: a subscription key, and separately a membership before anything derived may be published.
- **ISO-NE publication**: the legal review.
- Unchanged methodology questions: CAISO `MGHG`, MISO BPM-005, PJM pnode-1 weighting, SPP `BAA`
  cutover date, publication-lag clock times, per-feed revision behaviour.
- Production activation of the UEPI-1 foundation migration, which remains unapplied.
