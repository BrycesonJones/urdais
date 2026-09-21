# Power Delivery PD-5B: the ERCOT delivery gap in production

**Status:** internal implementation note and activation runbook. The approved methodology is [docs/methodology/power-delivery-gap.md](/docs/methodology/power-delivery-gap.md).

PD-5A decided that one market of seven supports a delivery gap. PD-5B makes that a product: a production calculation path, a read model, a public API, and a frontend surface that says what it is and what it is not.

No schema migration. Productionizing the approved calculator exposed no missing field.

## What is live

| | |
| --- | --- |
| Market | ERCOT, and only ERCOT |
| Points | 10 — summer and winter, 2026 to 2030 |
| Methodology | `power-delivery-gap` 1.0.0 |
| API | `GET /api/power-delivery/gap` |
| Surface | The Delivery section of `/markets/power-analytics` |
| Command | `npm run power-delivery:gap -- --dry-run` \| `--write` |
| Schedule | `/api/cron/power-delivery-gap`, daily at 08:45 UTC |

## One calculation path

The PD-5A calculator *is* the production path; nothing was duplicated. It loads the approved methodology version, the current ERCOT demand vintage and the current capacity results, applies the approved pairing rules, and writes `delivery_gap_results` with `delivery_gap_result_inputs` freezing both rows behind each gap.

The subtraction happens in PostgreSQL, in exact decimal, as `$demand::numeric − $capacity::numeric`. Nothing computes a gap in JavaScript and nothing computes one in a browser. The table checks the result against its own stored inputs, so a row cannot disagree with itself.

Reruns over unchanged inputs write nothing. A restated demand point or capacity result revises only the gaps it touches, superseding rather than editing, and the superseded row keeps the exact input ids it was built from.

## Three lifecycle states, and what each means

The read model carries its own lifecycle rather than letting a caller infer one from an empty series, because empty means four different things and a surface that renders them identically looks broken when it is working.

| State | Meaning |
| --- | --- |
| `live` | A gap exists, may be shown, and its inputs are the ones in force |
| `stale` | A gap exists and may be shown, but a newer source release has been ingested since it was calculated. The values stay and stop being called current |
| `blocked` | A gap exists and a rights determination withholds public display. Retained, not served |
| `not_initialized` | Nothing has been calculated, or no database is configured. Not an outage |

`stale` is detected by comparing the rows each gap froze against the rows the approved pairing would use now — the same function the calculator uses, so the two cannot drift into disagreeing about what "current" means.

## Rights

The strictest input wins. A gap descends from the ERCOT load forecast and the ERCOT capacity report, and either source's determination can withhold it. Removing either permission moves every point to `internal_only` on the next calculation, and the previously publishable rows are superseded rather than deleted.

The surface attributes both source families and states that Urdais calculated the gap, using the attribution text stored against the rights determination rather than a string typed into a component.

## The disclosure

Mandatory and visible next to the chart, in one line:

> **Not ERCOT's reserve margin.** Urdais measures against the full ERCOT Adjusted forecast peak; ERCOT's reserve margin uses firm peak load.

The detail lives behind the methodology link rather than in a paragraph under the chart. The read model's contract validator refuses to serve a response whose disclosure is missing or too short to say anything.

## What the chart does

Grouped bars, one per season and forecast year, around a zero line that is always drawn — because the sign of this number is the whole point. Negative bars render below the axis and are never clipped: capacity ahead of demand is a real and currently common state in the early years.

The tooltip makes the subtraction legible rather than asking a reader to trust a single number:

```
Forecast demand      94,650 MW
Approved capacity  − 104,850 MW
Delivery gap         −10,200 MW
```

The six markets that produce nothing are listed under "Why only ERCOT?", each with a one-line reason drawn from the same canonical list the methodology uses. None of them renders as an empty chart or a zero line.

Time controls implying a dense series (1M/3M/1Y/5Y) are absent: the native horizon here is a forecast year and a season, and nothing is interpolated between them.

## Mock code removed

The quarterly seven-market demo series is gone: `DELIVERY_SERIES`, `DeliveryPoint`, `TODAY_POINT`, `HORIZON_DELIVERY_GAP` and `DELIVERY_GAP_HORIZON_YEAR`. Every assumption in it was wrong about the data that exists — quarterly rather than seasonal, seven markets rather than one, a gap clipped at zero, and a "today" boundary that a pure forecast product does not have.

The remaining Power Analytics sections are still demo data and say so; the page badge now reads "Demo data except Delivery".

## Cost

| | |
| --- | --- |
| Read model | 6 queries, 8 ms |
| API, cold / warm | 62 ms / 12 ms |
| Calculation, first run | ~30 statements, 10 gaps |
| Calculation, no-op rerun | 10 statements, 5 ms |

No N+1: the series is fetched in one query and the two source lookups are one each.

---

# Production activation runbook

Run after this PR is merged and deployed. **This is the only production double-run required.**

### 1. Deploy

Deploy code. There is no migration in this phase, so nothing schema-level to apply.

### 2. Verify the inputs exist in production

```sql
-- Expect one live ERCOT planning vintage and its BA-level seasonal coincident peaks.
select v.native_vintage_key, count(p.id) filter (where p.superseded_by_id is null) as points
  from pipeline.planning_forecast_vintages v
  join reference.grid_areas a on a.id = v.grid_area_id
  join reference.source_interfaces s on s.id = v.source_interface_id
  left join pipeline.planning_forecast_points p on p.vintage_id = v.id
 where a.slug = 'ercot' and s.slug = 'ercot-long-term-load-forecast' and v.superseded_by_id is null
 group by 1;

-- Expect 20 live ERCOT capacity results under deliverable-capacity 1.0.0.
select count(*) from pipeline.deliverable_capacity_results r
  join reference.grid_areas a on a.id = r.grid_area_id
 where a.slug = 'ercot' and r.superseded_by_id is null;
```

If either is empty, run the PD-3 and PD-4 production paths first. **Do not** calculate a gap against inputs that are not there.

### 3. Dry run

```
DATABASE_URL=<production> npm run power-delivery:gap -- --dry-run
```

Expect `lifecycle` `not_initialized` on a first activation, and every one of the seven markets listed.

### 4. One authenticated production write

```
DATABASE_URL=<production> npm run power-delivery:gap -- --write
```

Expect `ercot inserted=10 revised=0`, and every other market reported with `paired=0` and its blocker.

### 5. Verify what was written

```sql
select count(*) filter (where superseded_by_id is null) as live_gaps,
       count(distinct target_season) as seasons,
       count(distinct target_year) as years
  from pipeline.delivery_gap_results;
-- expect: 10, 2, 5

select count(*) from pipeline.delivery_gap_result_inputs;
-- expect: 20

select mv.version from pipeline.delivery_gap_results g
  join reference.methodology_versions mv on mv.id = g.methodology_version_id
 group by 1;
-- expect: 1.0.0
```

Do not compare against hardcoded gap values. Compare the API's numbers against these rows.

### 6. Targeted exact rerun

```
DATABASE_URL=<production> npm run power-delivery:gap -- --write --market ercot
```

Expect `inserted=0 revised=0 unchanged=10`, and the counts in step 5 unchanged. **This is the idempotence gate.** A non-zero revision here means an input moved between the two runs and should be understood before proceeding.

### 7. Verify the API

```
curl -s https://urdais.com/api/power-delivery/gap | jq '{lifecycle, points: (.series|length), version: .methodology.version, negatives: [.series[]|select(.gapMw<0)]|length}'
```

Expect `live`, 10 points, `1.0.0`, and a non-zero count of negatives. A 500 means the response failed its own contract; the reason is in the server log.

### 8. Verify the frontend

Load `/markets/power-analytics`. Confirm: the Delivery section is titled **ERCOT Power Delivery Gap**, carries a **Live** badge, draws bars above and below a visible zero line, shows the "Not ERCOT's reserve margin" line with a working methodology link, names both ERCOT sources, shows a calculation date, and lists the six unavailable markets with reasons.

---

## Still blocking "Power Delivery complete"

Nothing in this phase. After activation the product is live for the market the evidence supports.

Two things are worth stating plainly before the section is declared closed:

1. **Four of the five Power Analytics sections remain demo data.** Interconnection Queue, Transmission Headroom, Grid Buildout and Flexible Capacity are unchanged mock content and are labelled as such. Power Delivery Gap being live does not make the page live.
2. **Coverage is one market by evidence, not by scope choice.** The highest-value widening, in order, is ISO-NE's qualified capacity report, PJM's FRR committed capacity, and the CAISO resource-grain schema decision.
