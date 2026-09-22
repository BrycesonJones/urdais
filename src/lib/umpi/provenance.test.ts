import { describe, expect, it } from "vitest";

import { productionIdentityFor } from "./identity";
import { observationProvenanceHash, payloadDigest } from "./provenance";
import type { UmpiRawObservation } from "./types";

const identity = productionIdentityFor("UMPI-KR-DRAM-PPI");
const observation: UmpiRawObservation = {
  kind: "bok_index_level",
  referenceMonth: "2026-06",
  indexLevel: 496.84,
  baseLabel: "2020=100",
};

describe("provenance hashing", () => {
  it("is stable across retrievals of an unchanged month", () => {
    const first = observationProvenanceHash({ identity, observation });
    const second = observationProvenanceHash({ identity, observation: { ...observation } });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the official value changes, which is what makes a revision detectable", () => {
    const revised = observationProvenanceHash({ identity, observation: { ...observation, indexLevel: 497.0 } });
    expect(revised).not.toBe(observationProvenanceHash({ identity, observation }));
  });

  it("changes when the source identity changes, so two tables cannot collide", () => {
    const other = observationProvenanceHash({
      identity: productionIdentityFor("UMPI-KR-DRAM-EXPORT-UV"),
      observation,
    });
    expect(other).not.toBe(observationProvenanceHash({ identity, observation }));
  });

  it("does not depend on key order in the source payload", () => {
    const a = payloadDigest([{ a: 1, b: 2 }]);
    const b = payloadDigest([{ b: 2, a: 1 }]);
    expect(a).toBe(b);
  });

  it("does depend on row order, because a reordered payload is a different payload", () => {
    expect(payloadDigest([{ a: 1 }, { a: 2 }])).not.toBe(payloadDigest([{ a: 2 }, { a: 1 }]));
  });
});
