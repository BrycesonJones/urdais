import { describe, expect, it } from "vitest";

import { decideObservation } from "@/lib/power-delivery/store";
import { parseEia930Row } from "@/lib/power-delivery/source/eia930";

const record = (value: string | null) => parseEia930Row({ period: "2026-09-19T11", respondent: "ERCO", type: "D", value, "value-units": "megawatthours" });

describe("Power observation revision decisions", () => {
  it("does not duplicate current state when the same value is retrieved again", () => expect(decideObservation("53599", record("53599"))).toBe("unchanged"));
  it("marks a changed EIA value as a revision", () => expect(decideObservation("53599", record("53601"))).toBe("revised"));
  it("creates the first available value and does not invent an unavailable one", () => {
    expect(decideObservation(null, record("53599"))).toBe("inserted");
    expect(decideObservation(null, record(null))).toBe("unavailable");
  });
});
