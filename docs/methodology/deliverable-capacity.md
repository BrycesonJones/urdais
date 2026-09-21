# Urdais Deliverable Capacity — 0.1.0-draft

**Status: draft. Nothing may be published under this version.** It defines no market formula and produces no value. It exists so that the schema can hold a methodology reference, and so that the rule "a draft cannot publish" is enforceable rather than aspirational.

## What deliverable capacity is

The amount of load a power system or locality can physically and reliably serve at a planning horizon, after accounting for recognised resource capability, imports and transfer limits, and other binding delivery constraints.

## What it is not

It is not installed generation capacity, not nameplate capacity, not a resource adequacy *requirement*, not a transmission thermal rating, and not interconnection queue capacity. Each of those is published alongside it by at least one market, and each would produce a plausible wrong number if substituted.

## Why there is no universal formula

PD-4A research concluded that no defensible cross-market equation exists. The markets accredit capacity on different bases, over different delivery periods, against different reliability standards, and publish locational limits in incompatible forms. A single formula would have to discard whichever part of each market's definition did not fit.

The approach is therefore market-specific native capability methodologies mapped into a common semantic interface. The interface is what PD-4B builds; the methodologies are per-market and each must be signed before it produces a published value.

## The four quantities

| Kind | Meaning | Examples |
| --- | --- | --- |
| `capability` | What the system can supply, on the source's own accreditation | ERCOT CDR total, CAISO NQC, ISO-NE qualified capacity |
| `requirement` | What the system is obliged to hold | PJM Reliability Requirement, MISO PRMR, ISO-NE ICR |
| `constraint` | What the network permits | CETL, CIL, CEL, MIC, MCL, TSL |
| `derived_quantity` | What Urdais concluded | a deliverable capacity result |

The classification is recorded by the adapter that read the value and is never re-derived from the publisher's term.

## Rules that hold before any formula is written

- A requirement is never a capability. A constraint is never supply.
- Source-published quantities and Urdais-derived results live in different tables.
- Every derived result names its methodology version and freezes the exact input rows it was computed from.
- No quarterly interpolation.
- No seven-market aggregate.
- No locational result unless the market's own equation supports one.
- A draft methodology version cannot produce a publicly publishable result.

## Direction for V1

Indicative only, pending per-market sign-off: ERCOT protocol-prescribed CDR total capacity; PJM RTO cleared UCAP plus FRR, with the locational formula deferred until in-LDA UCAP is confirmed public; CAISO the NQC stack, with MIC stored separately as a constraint; NYISO NYCA capability, with locality derivation deferred; ISO-NE Existing Qualified Capacity. MISO and SPP are modelled internally only and remain blocked from public publication under the current rights policy.
