/**
 * Data-quality checks over a derived date.
 *
 * These report rather than repair. A date whose decomposition does not close is a fact about
 * the source or about Urdais's attribution of it, and normalising it away — scaling the shares
 * to sum to 100, or quietly dropping the row that does not fit — would destroy the only signal
 * that something is wrong while leaving a plausible-looking table on the page.
 *
 * The two reconciliations are the ones that matter, and they are different statements:
 *
 *   models + source residual            = 100 %   the source's own decomposition of its total
 *   labs + unattributed + source residual = 100 %   Urdais's attribution of the same total
 *
 * The second closing while the first does not would mean a lab total drifted from its models;
 * the first closing while the second does not would mean attributed and unattributed volume do
 * not partition the named rows. Checking only their sum would catch neither.
 */

import {
  RECONCILIATION_TOLERANCE_POINTS,
  type MarketShareDerivation,
  type MarketShareRow,
  type ShareCheckFailure,
} from "@/lib/market-share/types";

function totalPercent(rows: readonly MarketShareRow[]): number {
  return rows.reduce((total, row) => total + row.sharePercent, 0);
}

function totalTokens(rows: readonly MarketShareRow[]): bigint {
  return rows.reduce((total, row) => total + BigInt(row.tokens), 0n);
}

/**
 * Every failure on one date, in the order they were checked. An empty array is a pass.
 */
export function checkDerivation(derivation: MarketShareDerivation): ShareCheckFailure[] {
  const failures: ShareCheckFailure[] = [];
  const { date } = derivation;
  const fail = (check: string, detail: string) => failures.push({ date, check, detail });

  const total = BigInt(derivation.totalObservedTokens);
  if (total <= 0n) {
    fail("denominator_positive", `total observed tokens is ${total}`);
    // Every share on the date was computed against this; nothing else is worth reporting.
    return failures;
  }

  const residualPercent = derivation.sourceResidual?.sharePercent ?? 0;
  const residualTokens = derivation.sourceResidual === null ? 0n : BigInt(derivation.sourceResidual.tokens);

  // ---- Reconciliation 1: the source's decomposition of its own total.
  const modelSum = totalPercent(derivation.models) + residualPercent;
  if (Math.abs(modelSum - 100) > RECONCILIATION_TOLERANCE_POINTS) {
    fail(
      "model_reconciliation",
      `named models plus the source residual sum to ${modelSum.toFixed(6)} %, not 100 % ` +
        `(tolerance ${RECONCILIATION_TOLERANCE_POINTS} points)`,
    );
  }

  // ---- Reconciliation 2: Urdais's attribution of the same total.
  const labSum = totalPercent(derivation.labs) + derivation.unattributed.sharePercent + residualPercent;
  if (Math.abs(labSum - 100) > RECONCILIATION_TOLERANCE_POINTS) {
    fail(
      "lab_reconciliation",
      `labs plus unattributed named models plus the source residual sum to ${labSum.toFixed(6)} %, not 100 %`,
    );
  }

  // ---- The same two statements on exact integers, where no tolerance is needed at all.
  const namedTokens = totalTokens(derivation.models);
  if (namedTokens + residualTokens !== total) {
    fail(
      "model_token_reconciliation",
      `named model tokens (${namedTokens}) plus the source residual (${residualTokens}) ` +
        `is ${namedTokens + residualTokens}, not the published total ${total}`,
    );
  }
  const labTokens = totalTokens(derivation.labs);
  const unattributedTokens = BigInt(derivation.unattributed.tokens);
  if (labTokens + unattributedTokens !== namedTokens) {
    fail(
      "lab_token_reconciliation",
      `lab-attributed tokens (${labTokens}) plus unattributed (${unattributedTokens}) ` +
        `is ${labTokens + unattributedTokens}, not the named-model total ${namedTokens}`,
    );
  }

  // ---- The unattributed breakdown must partition the unattributed volume exactly.
  const breakdown = derivation.unattributedBreakdown;
  const breakdownTotal =
    BigInt(breakdown.undisclosed) + BigInt(breakdown.platform) + BigInt(breakdown.unmapped);
  if (breakdownTotal !== unattributedTokens) {
    fail(
      "unattributed_breakdown",
      `the unattributed breakdown sums to ${breakdownTotal}, not ${unattributedTokens}`,
    );
  }

  // ---- Per-row sanity, across every row of both views.
  const everyRow: MarketShareRow[] = [
    ...derivation.models,
    ...derivation.labs,
    derivation.unattributed,
    ...(derivation.sourceResidual === null ? [] : [derivation.sourceResidual]),
  ];
  for (const row of everyRow) {
    if (row.sharePercent < 0) fail("share_nonnegative", `${row.kind} ${row.id} has share ${row.sharePercent} %`);
    if (row.sharePercent > 100 + RECONCILIATION_TOLERANCE_POINTS) {
      fail("share_at_most_100", `${row.kind} ${row.id} has share ${row.sharePercent} %`);
    }
    if (BigInt(row.tokens) < 0n) fail("tokens_nonnegative", `${row.kind} ${row.id} has ${row.tokens} tokens`);
  }

  // ---- One row per entity per date, in each view separately.
  for (const [view, rows] of [["models", derivation.models], ["labs", derivation.labs]] as const) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) fail("duplicate_entity", `${view} carries ${row.id} more than once`);
      seen.add(row.id);
    }
  }

  // ---- A lab row with no canonical name is an orphaned mapping: a provider id that resolved
  // to nothing, which would put a slug where a reader expects an institution.
  for (const row of derivation.labs) {
    if (row.label.trim() === "") fail("orphan_lab_mapping", `lab ${row.id} resolved to no name`);
  }

  return failures;
}

/** Check many dates at once. Used by the production report and by the tests over real shapes. */
export function checkAll(derivations: readonly MarketShareDerivation[]): ShareCheckFailure[] {
  return derivations.flatMap(checkDerivation);
}
