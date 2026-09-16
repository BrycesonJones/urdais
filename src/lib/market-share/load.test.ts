import { describe, expect, it } from "vitest";

import { loadAllShares, loadLatestShare, usableForMarketShare } from "@/lib/market-share/load";
import type { SqlExecutor } from "@/lib/utvi/store";

/**
 * A scripted executor, as the UTVI store tests use: each entry answers the next query in order,
 * so a test states exactly what the database replies and then asserts what was derived from it.
 * The database's own supersession invariants are exercised in its SQL tests; what is asserted
 * here is that the read layer asks for active rows in the first place.
 */
function scripted(answers: Record<string, unknown>[][]): SqlExecutor & {
  calls: { text: string; params: readonly unknown[] }[];
} {
  const calls: { text: string; params: readonly unknown[] }[] = [];
  let index = 0;
  return {
    calls,
    async query(text: string, params: readonly unknown[]) {
      calls.push({ text, params });
      return { rows: answers[index++] ?? [] };
    },
  };
}

const publication = (overrides: Record<string, unknown> = {}) => ({
  publication_id: "pub-1",
  calculation_id: "calc-1",
  snapshot_id: "snap-1",
  date: "2026-09-15",
  total_observed_tokens: "10000",
  settlement_state: "provisional",
  revision_number: 1,
  methodology_version: "1.0.0",
  universe_descriptor: "Token volume exposed by OpenRouter's rankings-daily dataset.",
  source_attribution: "Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T01:00:33.578Z.",
  published_at: "2026-09-16T01:05:00.000Z",
  source_as_of: "2026-09-16T01:00:33.578Z",
  ...overrides,
});

const observationRow = (overrides: Record<string, unknown> = {}) => ({
  permaslug: "openai/gpt-5",
  namespace: "openai",
  is_residual: false,
  tokens: "9000",
  lab_attribution_state: "evidenced",
  quality_flags: [],
  lab_slug: "openai",
  lab_name: "OpenAI",
  ...overrides,
});

const residualRow = () =>
  observationRow({
    permaslug: "other",
    namespace: null,
    is_residual: true,
    tokens: "1000",
    lab_attribution_state: "not_applicable",
    lab_slug: null,
    lab_name: null,
    quality_flags: ["RESIDUAL_UNATTRIBUTED"],
  });

describe("revision semantics", () => {
  it("reaches only live publications and live snapshots", async () => {
    const sql = scripted([[publication()], [observationRow(), residualRow()]]);
    await loadLatestShare(sql);

    const lineageQuery = sql.calls[0]!.text;
    // Both filters, and both matter. A live publication whose snapshot was superseded is a
    // claim whose evidence has been withdrawn, and it is not a basis for a derived share.
    expect(lineageQuery).toContain("p.superseded_by_id is null");
    expect(lineageQuery).toContain("s.superseded_by_id is null");
  });

  it("derives from the snapshot the active publication names, not from any other", async () => {
    const sql = scripted([
      [publication({ snapshot_id: "snap-revised", total_observed_tokens: "20000" })],
      [observationRow({ tokens: "18000" }), { ...residualRow(), tokens: "2000" }],
    ]);
    const share = await loadLatestShare(sql);

    // The observations were fetched for the revised snapshot, so the share is of the revised total.
    expect(sql.calls[1]!.params).toEqual(["snap-revised"]);
    expect(share!.lineage.snapshotId).toBe("snap-revised");
    expect(share!.derivation.totalObservedTokens).toBe("20000");
    expect(share!.derivation.labs[0]!.sharePercent).toBe(90);
  });

  it("carries the lineage needed to trace a share back to its evidence", async () => {
    const sql = scripted([[publication({ revision_number: 3 })], [observationRow(), residualRow()]]);
    const share = await loadLatestShare(sql);

    expect(share!.lineage).toMatchObject({
      publicationId: "pub-1",
      calculationId: "calc-1",
      snapshotId: "snap-1",
      revisionNumber: 3,
      date: "2026-09-15",
    });
  });

  it("returns nothing when a superseded snapshot leaves no live row to read", async () => {
    // The join returns no row at all: this is what supersession looks like from the read side.
    expect(await loadLatestShare(scripted([[]]))).toBeNull();
  });
});

describe("source coverage", () => {
  it("produces a point only for dates the source actually covered", async () => {
    const sql = scripted([
      [publication({ date: "2025-06-14", snapshot_id: "snap-a" }), publication({ date: "2025-06-16", snapshot_id: "snap-b" })],
      [observationRow(), residualRow()],
      [observationRow(), residualRow()],
    ]);
    const shares = await loadAllShares(sql);

    // 2025-06-15 is one of the two dates the source serves no rows for. There is no publication
    // for it, so there is no share point -- not a zero, not an interpolation, not a carried
    // forward neighbour.
    expect(shares.map((share) => share.derivation.date)).toEqual(["2025-06-14", "2025-06-16"]);
  });

  it("orders history oldest first and asks the database to do the ordering", async () => {
    const sql = scripted([[]]);
    await loadAllShares(sql);
    expect(sql.calls[0]!.text).toContain("order by p.calculation_date");
  });
});

describe("token exactness", () => {
  it("never narrows a token count through a double on the way in", async () => {
    const sql = scripted([
      [publication({ total_observed_tokens: "17750424011492" })],
      [
        observationRow({ tokens: "16563583113598" }),
        { ...residualRow(), tokens: "1186840897894" },
      ],
    ]);
    const share = await loadLatestShare(sql);

    // Exact decimal strings out, the same digits that went in.
    expect(share!.derivation.totalObservedTokens).toBe("17750424011492");
    expect(share!.derivation.models[0]!.tokens).toBe("16563583113598");
    expect(share!.derivation.sourceResidual!.tokens).toBe("1186840897894");
  });
});

describe("the reconciliation gate", () => {
  /** The real 2025-09-16 shape: sixteen of fifty-one rows beneath a correct snapshot total. */
  const defective = () =>
    scripted([
      [publication({ date: "2025-09-16", total_observed_tokens: "803652511533" })],
      [
        observationRow({ permaslug: "google/gemini-2.5-flash", tokens: "53276122800" }),
        observationRow({ permaslug: "x-ai/grok-code-fast-1", tokens: "193570496921" }),
        observationRow({ permaslug: "anthropic/claude-4-sonnet-20250522", tokens: "108649341574" }),
      ],
    ]);

  it("does not serve a date whose persisted rows do not account for its published total", async () => {
    // Every figure such a table produced would look reasonable and all of them would be wrong,
    // because the denominator is right and the numerators are missing two thirds of the volume.
    expect(await loadLatestShare(defective())).toBeNull();
  });

  it("reports the failing date in a historical sweep rather than dropping it", async () => {
    // The gate refuses to *serve*; the sweep must still *name* it, or a report over a damaged
    // series would come back clean for ever.
    const shares = await loadAllShares(defective());
    expect(shares).toHaveLength(1);
    expect(usableForMarketShare(shares[0]!)).toBe(false);
    expect(shares[0]!.failures.map((f) => f.check)).toContain("model_token_reconciliation");
    expect(shares[0]!.failures[0]!.date).toBe("2025-09-16");
  });

  it("serves a date whose rows do account for it", async () => {
    const sql = scripted([
      [publication({ total_observed_tokens: "10000" })],
      [observationRow({ tokens: "9000" }), residualRow()],
    ]);
    const share = await loadLatestShare(sql);
    expect(share).not.toBeNull();
    expect(usableForMarketShare(share!)).toBe(true);
  });
});
