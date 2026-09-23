# Flexible Capacity — the product surface

**Status: internal operational runbook. Not the public methodology, not routed publicly, and not registered in the docs catalog.** The methodology is `docs/methodology/flexible-capacity.md`, version 1.1.0, and nothing here may change it.

> **FC-4A productizes the read path but does not populate production historical data. Production activation requires FC-4B.**

---

## What FC-4A built

| | |
| --- | --- |
| Read model | `src/lib/flexible-capacity/analytics/read.ts` |
| Contract check | `src/lib/flexible-capacity/analytics/read-contract.ts` |
| Public API | `GET /api/flexible-capacity` |
| Page | `src/app/markets/power-analytics/page.tsx` → `PowerAnalyticsPage` → `FlexibleCapacityChart` |
| Migrations | **none** — FC-3's schema was sufficient |

One read model, two consumers. The API serialises it; the page passes it as a prop. A figure cannot be assembled one way in the API and another way in the UI, and a test asserts both call the same loader.

```
canonical EIA-930 observations
  → FC-3 analytical run
  → persisted validated scenario results
  → FC-4A read model
  → API + Power Analytics page
```

The read model recomputes nothing. The solver is never shipped to the browser: client-side selection only chooses among scenarios that were already solved, validated and stored server-side.

## The two gates

Both are registry reads, and both run before any figure is assembled.

| Gate | Asks | On failure |
| --- | --- | --- |
| `assertMethodologyApproved` | are the rules authorised, and is the digest the one this code was written against? | `availability.reason = methodology_not_approved` |
| `assertPublicationAuthorized` | has every value those rules need actually been decided? | `availability.reason = publication_not_authorized` |

Neither throws out of the read model. A blocked publication is a 200 describing why, not a 500 that reads like an outage. Only an unexpected failure reaches the route's catch and answers 500.

**Version selection is explicit.** Results are read by `methodology_version_id`, so scenarios calculated under superseded 1.0.0 stay stored and can never become current by accident.

## Availability, and why there is no freshness threshold yet

FC-4A distinguishes `available` from `unavailable` and stops there.

Grid Buildout's 72-hour staleness rule is right for a pipeline that re-reads a publisher daily. Flexible Capacity is not that: a scenario is computed over a **complete historical year**, and a 2025 result does not become wrong because a week has passed. Copying a threshold across would invent a health signal nobody measured.

`current` / `stale` semantics are deferred to FC-5, where a defensible basis — analytical publication age against source-vintage completeness — can be established once the product is actually running on a cadence.

## Refused market-years

A refusal is a product result, not an absence. Methodology 1.1.0 declines a market-year for four reasons, and each reaches the surface with its own wording:

| Reason | Shown as |
| --- | --- |
| `contiguous_gap_too_long` | Data gap exceeds the methodology limit |
| `peak_day_incomplete` | The peak day is incomplete |
| `peak_implausible` | Implausible source peak |
| `annual_coverage_below_floor` | Insufficient annual coverage |

The refused year stays in the year selector, labelled `— unavailable`, and renders **no gigawatt figure at all**. Where the newest modelled year was refused and an earlier one was not, the section says so explicitly rather than quietly presenting the earlier year as the latest.

The implausible-peak case is worth its own wording, because the honest explanation is unusual:

> Source data contained an extreme peak inconsistent with the surrounding distribution; the year was excluded rather than corrected.

The refusal detail quotes the publisher's own value. That is deliberate: it tells a reader the year was refused because of what the publisher sent, not because Urdais lost the data, and it is the same value that stays untouched in canonical storage. What never appears anywhere is the 3,597 GW that value would have produced.

## What the section shows

| | |
| --- | --- |
| Headline | `3.59 GW` · Curtailment-enabled headroom · `ERCOT · 2025 · 0.50% annual curtailment allowance` |
| Chart | headroom in GW against the three approved allowances, discrete connected points |
| Observed basis | observed peak with its **local** time, annual coverage, longest data gap, source |
| Diagnostics | equivalent full-load hours, hours with curtailment, events, mean and longest event |
| Disclosure | a scenario-model chip beside the title, and a paragraph above the figures |
| Limitations | collapsed, from `STANDING_LIMITATIONS` on the read model |

Points are discrete and connected, not interpolated. The engine solves the three approved α values; drawing a continuous curve would imply the product can answer for an α nobody computed.

**Equivalent full-load hours are never presented as hours of interruption.** They are an energy equivalence — α × T — and the clock-hour figure sits beside them, usually several times larger because most curtailed hours are shallow. On ERCOT 2025 at 0.50%: 43.8 equivalent full-load hours, 118 clock hours, 25 events.

## Selection

| Control | Default | Behaviour |
| --- | --- | --- |
| Market | ERCOT | resets the year to that market's latest eligible one |
| Modelled year | latest **eligible**, falling back to latest modelled | refused years remain selectable and labelled |
| Curtailment allowance | 0.50% | hidden entirely for a refused year |

Years are never blended. FC-3 measured year-over-year swings of 40 to 76%, so an average across them would describe no year at all.

## The retired mock

`src/data/mock/power-analytics.ts` and `src/types/power-analytics.ts` are **deleted**. Flexible Capacity was their last consumer; FC-1 established that everything else in them had already been superseded by Power Delivery, Interconnection Queue, Transmission Headroom and Grid Buildout.

`src/lib/flexible-capacity/retired-mock.test.ts` scans every runtime file for the retired identifiers and field names — `FLEXIBILITY_CURVE`, `flexibilityScenario`, `unlockedGw`, `interruptibleGw`, `batteryGw`, `flexibleHoursPerYear` and the rest — and fails if any returns. Documentation may discuss them; nothing that ships may use them. The contract check is the one exempted file, because a guard has to spell out what it guards against.

The Power Analytics **demo-data badge is gone**. It said "Demo data except Delivery, Interconnection, Transmission and Buildout"; with Flexible Capacity read-model-backed there is nothing left for it to excuse, and a section with nothing published now says so itself.

## What FC-4B still needs

Nothing in this phase populated production. To activate:

1. Apply the FC migrations to production (`20261019100000`, `20261020100000`).
2. Run the authorised three-year EIA-930 backfill: 2023–2025, seven markets, ~157 requests, ~368k observations, ~45 minutes, ~442 MB.
3. Run the analytics engine to calculate and persist the 1.1.0 scenarios.
4. Verify `/api/flexible-capacity` and the Power Analytics section end to end.

Until then the surface is honest about having nothing: `availability.state = "unavailable"`, `reason = "no_validated_analytics"`, and no figure anywhere.

## What must never be "fixed" by hand

- **A refused market-year.** It is refused because the methodology said so. Modelling it anyway, or substituting a neighbouring year, would publish a number the rules rejected.
- **The absence of a figure.** There is no mock left to fall back to, and that is the point. Serving no number is preferable to serving an unvalidated one.
- **A freshness threshold.** Do not copy Grid Buildout's 72 hours. A scenario over a complete historical year does not go stale on a daily clock.
