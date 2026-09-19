import { describe, expect, it } from "vitest";

import { aggregate } from "@/lib/capacity/aggregation";
import { observation } from "@/lib/capacity/fixtures";
import { DEFAULT_FRESHNESS_HORIZON_SECONDS, classifyFreshness, currentObservations } from "@/lib/capacity/freshness";
import { exactQuantity } from "@/lib/capacity/normalize";

const exact = (n: number) => {
  const result = exactQuantity(n, "accelerator");
  if (!result.ok) throw new Error(result.reason);
  return result.measurement;
};

const NOW = new Date("2026-09-17T12:00:00.000Z");

describe("freshness classification", () => {
  it("calls an observation inside its horizon fresh", () => {
    const row = observation(exact(10), { retrievedAt: "2026-09-17T11:00:00.000Z" });
    expect(classifyFreshness(row, NOW).state).toBe("fresh");
  });

  it("calls an observation past its horizon stale", () => {
    const row = observation(exact(10), { retrievedAt: "2026-09-15T11:00:00.000Z" });
    expect(classifyFreshness(row, NOW).state).toBe("stale");
  });

  it("honours a per-source horizon shorter than the default", () => {
    const row = observation(exact(10), { retrievedAt: "2026-09-17T09:00:00.000Z" });
    expect(classifyFreshness(row, NOW, DEFAULT_FRESHNESS_HORIZON_SECONDS).state).toBe("fresh");
    // A live inventory API collected hourly goes stale far sooner than a daily mirror.
    expect(classifyFreshness(row, NOW, 3600).state).toBe("stale");
  });

  it("calls a superseded observation superseded however recent it is", () => {
    const row = observation(exact(10), {
      retrievedAt: "2026-09-17T11:59:00.000Z",
      supersededById: "c:newer",
    });
    expect(classifyFreshness(row, NOW).state).toBe("superseded");
  });

  it("does not treat a future timestamp as fresh", () => {
    const row = observation(exact(10), { retrievedAt: "2026-09-18T00:00:00.000Z" });
    expect(classifyFreshness(row, NOW).state).toBe("stale");
  });

  it("does not treat an unparseable timestamp as fresh", () => {
    const row = observation(exact(10), { retrievedAt: "not a date" });
    expect(classifyFreshness(row, NOW).state).toBe("stale");
  });
});

describe("current capacity", () => {
  it("drops a stale source from the total rather than carrying its last figure forward", () => {
    const rows = [
      observation(exact(100), { capacitySourceEntityId: "a", retrievedAt: "2026-09-17T11:00:00.000Z" }),
      observation(exact(500), { capacitySourceEntityId: "b", retrievedAt: "2026-09-10T11:00:00.000Z" }),
    ];
    const current = currentObservations(rows, NOW);
    expect(current).toHaveLength(1);
    // 600 is what carrying the dead source forward would have produced.
    expect(aggregate(current).total?.lower).toBe(100);
  });

  it("yields no total rather than a zero when every source is stale", () => {
    const rows = [observation(exact(100), { retrievedAt: "2026-09-01T00:00:00.000Z" })];
    const current = currentObservations(rows, NOW);
    expect(current).toHaveLength(0);
    expect(aggregate(current).total).toBeNull();
  });
});
