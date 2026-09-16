/**
 * The human-readable half of the artifact.
 *
 * Generated from the ledger every run, which is safe precisely because the ledger is
 * append-only: nothing here is a source of truth, and deleting this file costs nothing but a
 * regeneration. It says what the study has measured so far and how far it has to go, and it
 * refuses to state a conclusion the run count does not yet support.
 */

import {
  dayAgeLabel,
  evaluateSettlement,
  summarizeByDayAge,
  summarizeByTransition,
  TARGET_RUN_COUNT,
  TRIVIAL_REVISION_PPM,
  type GroupSummary,
  type StudyEntry,
  type StudyState,
} from "./study";

const NA = "—";

const num = (value: number | null, digits = 4): string => (value === null ? NA : value.toFixed(digits));

const pct = (value: number | null): string => (value === null ? NA : `${(value * 100).toFixed(1)} %`);

/** Thousands-separated, from a decimal string, without ever going through a float. */
function groupDigits(value: string | null): string {
  if (value === null || value === "") return NA;
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `−${grouped}` : grouped;
}

function summaryTable(rows: readonly GroupSummary[]): string {
  const header =
    "| Group | Obs | Comparisons | Hash changes | Revision freq. | Exact-stable | Longest stable streak | Mean \\|ppm\\| | Median \\|ppm\\| | Max \\|ppm\\| | Min % | Max % |\n" +
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const body = rows
    .map(
      (row) =>
        `| \`${row.key}\` | ${row.observations} | ${row.comparisons} | ${row.hashChanges} | ${pct(row.revisionFrequency)} | ` +
        `${row.exactStability} | ${row.longestStableStreak} | ${num(row.meanAbsPpm)} | ${num(row.medianAbsPpm)} | ` +
        `${num(row.maxAbsPpm)} | ${num(row.minPct, 8)} | ${num(row.maxPct, 8)} |`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

function bandTable(rows: readonly GroupSummary[]): string {
  const header =
    "| Group | unchanged | recomposed | trace (≤10 ppm) | small (≤100) | noticeable (≤1,000) | material (>1,000) |\n" +
    "|---|---:|---:|---:|---:|---:|---:|";
  const body = rows
    .map(
      (row) =>
        `| \`${row.key}\` | ${row.bands.unchanged} | ${row.bands.recomposed} | ${row.bands.trace} | ` +
        `${row.bands.small} | ${row.bands.noticeable} | ${row.bands.material} |`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

function observationTable(entries: readonly StudyEntry[]): string {
  const header =
    "| Run (UTC) | Target | Age | Total tokens | Content hash | `meta.as_of` | Δ tokens | Δ ppm | Band | Rows ±/Δ |\n" +
    "|---|---|---|---:|---|---|---:|---:|---|---|";
  const body = [...entries]
    .sort(
      (a, b) =>
        a.observation.studyRunDateUtc.localeCompare(b.observation.studyRunDateUtc) ||
        b.observation.dayAge - a.observation.dayAge,
    )
    .map(({ observation: o, revision: r }) => {
      const rows =
        r.rowsChanged === null ? NA : `+${r.rowsAdded ?? 0}/−${r.rowsRemoved ?? 0}/Δ${r.rowsChanged}`;
      const status = o.validationStatus === "ok" ? "" : ` \`${o.validationStatus}\``;
      return (
        `| ${o.studyRunDateUtc}${o.rerunOrdinal > 0 ? ` (re-run ${o.rerunOrdinal})` : ""} | ${o.targetDate} | \`${dayAgeLabel(o.dayAge)}\` | ` +
        `${groupDigits(o.totalTokens)}${status} | \`${o.responseHash === null ? NA : o.responseHash.slice(0, 12)}\` | ` +
        `${o.sourceAsOf ?? NA} | ${groupDigits(r.revisionTokens)} | ${num(r.revisionPpm)} | ` +
        `${r.band === null ? NA : `\`${r.band}\``} | ${rows} |`
      );
    })
    .join("\n");
  return `${header}\n${body}`;
}

/** The whole report. Deterministic given the ledger, the state and the generation time. */
export function renderReport(entries: readonly StudyEntry[], state: StudyState, generatedAt: Date): string {
  const byAge = summarizeByDayAge(entries);
  const byTransition = summarizeByTransition(entries);
  const verdict = evaluateSettlement(entries, state);

  const d1 = byAge.find((row) => row.key === "D-1");
  const d1Note =
    d1 && d1.comparisons === 0
      ? "\n**`D-1` shows no comparisons, and that is structural rather than a finding.** One run per day means a " +
        "date is read once at `D-1`, once at `D-2` and once at `D-3`; it is never read twice at the same age, so " +
        "there is no `D-1` → `D-1` pair to compare. Read the transition table below instead.\n"
      : "";

  const missed =
    state.missedRunDates.length === 0
      ? "None."
      : state.missedRunDates.map((date) => `\`${date}\``).join(", ") +
        " — recorded, not reconstructed. A missed day extends the study rather than shortening it.";

  return `# UTVI Settlement Study — Results

**Generated file. Do not edit by hand** — regenerate with \`npm run utvi:settlement-study:report\`, which reads the
append-only ledger and touches no network. Method and operation: [settlement-study-runbook.md](settlement-study-runbook.md).

**Status: internal research artifact. Not routed publicly, not registered in the docs catalog.** Read-only. No
production table was written, no migration created, no methodology status changed, no UI touched.
Generated ${generatedAt.toISOString()}.

## The question

Production currently treats the just-closed UTC day as provisional and every older day as final, on the strength of
one afternoon in [Phase 1A](source-characterization.md#12-revision-behaviour--measured): \`D−1\` accrued ~16 ppm/day while
\`D−2\` and \`D−3\` moved by exactly zero over 6.2 minutes. Six minutes shows a day is not *actively* accruing. It says
nothing about a batch correction days later, which is what this study is looking for.

## Progress

| | |
|---|---|
| Runs completed | **${state.runsCompleted} of ${TARGET_RUN_COUNT}** |
| Observations recorded | ${state.observationCount} |
| Study started (UTC) | ${state.startedOnUtc ?? NA} |
| Last run (UTC) | ${state.lastRunUtc ?? NA} |
| Runs remaining | ${state.runsRemaining} |
| Earliest possible completion | ${state.projectedEndUtc ?? NA} |
| Missed run dates | ${missed} |

## Settlement verdict

> ### ${verdict.headline}
>
> ${verdict.rationale}
>
> **${verdict.final ? "Final: the full run count is in." : `Provisional: ${state.runsRemaining} of ${TARGET_RUN_COUNT} runs still outstanding.`}**

The rule was fixed before the data was collected. **A**: no \`D−2\` comparison changes → retain \`D−1\` provisional /
\`D−2\` final. **B**: some change, largest below ${TRIVIAL_REVISION_PPM} ppm → \`D−2\` operationally final with
late-revision supersession. **C**: largest above ${TRIVIAL_REVISION_PPM} ppm → move finalization to \`D−3\` or later.

## By day age

Never mixed: each row is one age, and the age is the one at which the change was *detected*.
${d1Note}
${summaryTable(byAge)}

## By age transition

Where a one-run-per-day study's evidence actually lives.

\`D−1 → D−2\` carries the tail of the just-closed day's accrual and is **expected** to move — \`D−1\` is read on the
UTC day it closed, while it may still be accruing. \`D−2 → D−3\` is the pure test: a day production already calls
final, re-read a day later. **A revision there is the result that would change production behaviour.**

${byTransition.length === 0 ? "_No comparisons yet._" : summaryTable(byTransition)}

## Magnitude bands

${bandTable(byAge)}

\`recomposed\` is not one of the brief's bands. It is a content-hash change whose net token delta is exactly zero —
rows moved against each other and the total did not. It is reported separately because calling it \`trace\` would
label a real content change as a sub-10-ppm move, and calling it \`unchanged\` would hide it.

## Every observation

${entries.length === 0 ? "_No observations yet._" : observationTable(entries)}

## What the hash covers

The revision detector is the semantic content hash, which is \`hashDateRows\` from the production normalizer — the
same function the pipeline uses, so a revision the study sees is by construction a revision the pipeline would see.

**Included:** every returned row's \`model_permaslug\` and \`total_tokens\` for that date, canonically ordered.

**Excluded:** \`meta.as_of\` (Phase 1A measured it advancing on every request whether or not the content moved, so it
detects nothing), \`meta.start_date\`, \`meta.end_date\`, \`meta.version\`, the row order the source chose, the retrieval
timestamp and every response header.

The raw whole-body hash is recorded alongside it in the CSV. It covers the entire multi-date response, so it is
shared by every target date of a run and cannot serve as a per-date detector — and it moves whenever \`as_of\` does.
The two hashes diverging while the semantic one holds is the evidence that \`as_of\` detects nothing.

## Honest limits

- A comparison whose two reads fall inside the source's 60-second cache window is **dropped**, not counted: the body
  is byte-identical by construction there, and counting it would manufacture the stability the study is testing for.
  Dropped counts are carried per group.
- A date the source serves with no rows is recorded as \`no_rows\` and never as a zero. Two such dates are known to
  exist in the source's history.
- The study measures whether a value **changed between two reads**. A revision that lands and is reverted between
  reads is invisible to it, and always would be at a daily cadence.
`;
}
