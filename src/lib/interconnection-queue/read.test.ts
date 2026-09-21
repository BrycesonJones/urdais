import { describe, expect, it } from "vitest";

import { findRequest, latestObservation, lifecycleCounts, latestObservationsForMarket,
  latestSnapshot, observationHistory, observationQuantities, observationResources }
  from "@/lib/interconnection-queue/read";
import { isTerminal, TERMINAL_STAGES } from "@/lib/interconnection-queue/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

function executor(handler: (text: string, params: unknown[]) => Record<string, unknown>[]): {
  sql: CapacitySqlExecutor; queries: { text: string; params: unknown[] }[];
} {
  const queries: { text: string; params: unknown[] }[] = [];
  return {
    queries,
    sql: {
      async query(text, params) {
        const list = (params ?? []) as unknown[];
        queries.push({ text, params: list });
        return { rows: handler(text, list) };
      },
    },
  };
}

const OBSERVATION = {
  id: "obs-1", request_id: "req-1", observation_ordinal: 2, is_latest: true,
  native_project_name: "Elwood", native_status: { Status: "Active", ProjectType: "Generation Interconnection" },
  native_status_display: "Active", lifecycle_stage: "study", request_class: "mixed",
  requested_on: "2021-04-13", proposed_in_service_on: "2026-01-01", revised_in_service_on: null,
  actual_in_service_on: null, agreement_executed_on: null, withdrawn_on: null,
  native_state: "IL", native_county: "Will", native_poi: null, source_partition: "serial",
  first_snapshot_id: "snap-1", last_snapshot_id: "snap-2",
};

describe("reading a request", () => {
  it("finds one by the only identity it has", async () => {
    const { sql, queries } = executor(() => [{
      id: "req-1", market_slug: "pjm", source_slug: "pjm-planning-queues",
      native_queue_id: "AE1-070", first_seen_at: "2026-09-21T12:00:00.000Z",
    }]);
    const request = await findRequest(sql, "pjm", "AE1-070");
    expect(request).toMatchObject({ id: "req-1", marketSlug: "pjm", nativeQueueId: "AE1-070" });
    // Market and native id, nothing else.
    expect(queries[0]!.params).toEqual(["pjm", "AE1-070"]);
  });

  it("returns null rather than inventing a request", async () => {
    const { sql } = executor(() => []);
    expect(await findRequest(sql, "pjm", "nope")).toBeNull();
    expect(await latestObservation(sql, "req-1")).toBeNull();
    expect(await latestSnapshot(sql, "pjm-planning-queues")).toBeNull();
  });
});

describe("reading observations", () => {
  it("returns the latest state with its native status intact", async () => {
    const { sql } = executor(() => [OBSERVATION]);
    const observation = (await latestObservation(sql, "req-1"))!;
    expect(observation.lifecycleStage).toBe("study");
    expect(observation.requestClass).toBe("mixed");
    expect(observation.nativeStatus).toEqual({ Status: "Active", ProjectType: "Generation Interconnection" });
    expect(observation.terminal).toBe(false);
  });

  it("returns history oldest first, and marks which states were terminal", async () => {
    const { sql } = executor(() => [
      { ...OBSERVATION, id: "obs-1", observation_ordinal: 1, is_latest: false },
      { ...OBSERVATION, id: "obs-2", observation_ordinal: 2, is_latest: true,
        lifecycle_stage: "withdrawn", withdrawn_on: "2024-03-02" },
    ]);
    const history = await observationHistory(sql, "req-1");
    expect(history.map((row) => row.ordinal)).toEqual([1, 2]);
    expect(history.map((row) => row.terminal)).toEqual([false, true]);
    expect(history[1]!.withdrawnOn).toBe("2024-03-02");
  });

  it("keeps quantities under their native names and as exact text", async () => {
    const { sql } = executor(() => [
      { native_field: "Net MWs to Grid", quantity_kind: "net_mw_to_grid", value: "38", unit: "MW",
        resource_ordinal: null, direction: "injection" },
      { native_field: "MW-1", quantity_kind: "component_mw", value: "38", unit: "MW",
        resource_ordinal: 1, direction: "injection" },
      { native_field: "MW-2", quantity_kind: "component_mw", value: "38", unit: "MW",
        resource_ordinal: 2, direction: "injection" },
    ]);
    const quantities = await observationQuantities(sql, "obs-1");
    expect(quantities.map((quantity) => quantity.nativeField))
      .toEqual(["Net MWs to Grid", "MW-1", "MW-2"]);
    // Text, so an exact decimal survives the trip.
    expect(quantities.every((quantity) => typeof quantity.value === "string")).toBe(true);

    // The read model offers no total, and this is the reason: the parts add to more than the whole.
    const components = quantities.filter((quantity) => quantity.quantityKind === "component_mw");
    const project = quantities.find((quantity) => quantity.quantityKind === "net_mw_to_grid")!;
    expect(components.reduce((total, quantity) => total + Number(quantity.value), 0)).toBe(76);
    expect(Number(project.value)).toBe(38);
  });

  it("returns resources in component order with their native labels", async () => {
    const { sql } = executor(() => [
      { component_ordinal: 1, native_technology: "Wind Turbine", native_fuel: "Wind",
        technology: "wind", is_source_separated: true },
      { component_ordinal: 2, native_technology: "Storage", native_fuel: "Battery",
        technology: "battery_storage", is_source_separated: true },
    ]);
    const resources = await observationResources(sql, "obs-1");
    expect(resources.map((resource) => [resource.componentOrdinal, resource.nativeFuel, resource.technology]))
      .toEqual([[1, "Wind", "wind"], [2, "Battery", "battery_storage"]]);
  });
});

describe("reading a market", () => {
  it("filters latest observations by stage without aggregating anything", async () => {
    const { sql, queries } = executor(() => [OBSERVATION]);
    await latestObservationsForMarket(sql, "pjm", { lifecycleStage: "withdrawn", limit: 10 });
    expect(queries[0]!.params).toEqual(["pjm", "withdrawn", 10]);
    expect(queries[0]!.text).toContain("o.is_latest");
    // No sum, no total: a queue MW is a methodology decision, not a helper.
    expect(queries[0]!.text.toLowerCase()).not.toMatch(/\bsum\(/);
  });

  it("counts requests by stage from their latest observation only", async () => {
    const { sql, queries } = executor(() => [
      { lifecycle_stage: "withdrawn", n: 4921 },
      { lifecycle_stage: "study", n: 2361 },
      { lifecycle_stage: "operational", n: 1259 },
    ]);
    expect(await lifecycleCounts(sql, "pjm")).toEqual({ withdrawn: 4921, study: 2361, operational: 1259 });
    expect(queries[0]!.text).toContain("o.is_latest");
  });

  it("reports a snapshot's own freshness rather than asserting one", async () => {
    const { sql } = executor(() => [{
      id: "snap-1", source_slug: "caiso-public-queue-report",
      native_snapshot_key: "report-run-2026-09-21", artifact_sha256: "a".repeat(64),
      source_published_at: "2026-09-21T00:00:00.000Z", observed_at: "2026-09-21T14:00:00.000Z",
      currentness_status: "current", record_count: 2278,
    }]);
    const snapshot = (await latestSnapshot(sql, "caiso-public-queue-report"))!;
    expect(snapshot.nativeSnapshotKey).toBe("report-run-2026-09-21");
    expect(snapshot.recordCount).toBe(2278);
  });
});

describe("terminal stages", () => {
  it("are exactly the two ways a request leaves the queue", () => {
    expect(TERMINAL_STAGES).toEqual(["operational", "withdrawn"]);
  });

  it("leave an unmapped status in the active stock rather than silently removing it", () => {
    // If unknown were terminal, a vocabulary gap would quietly shrink the queue.
    expect(isTerminal("unknown")).toBe(false);
    expect(isTerminal("suspended")).toBe(false);
    expect(isTerminal("under_construction")).toBe(false);
    expect(isTerminal("agreement_executed")).toBe(false);
  });
});
