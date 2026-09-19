import { describe, expect, it } from "vitest";

import { scheduledPowerWindow } from "@/lib/power-delivery/run";

describe("Power Delivery scheduled collection window", () => {
  it("rereads 48 completed hours and includes the next 24 forecast hours", () => {
    expect(scheduledPowerWindow(new Date("2026-09-19T14:37:12Z"))).toEqual({
      start: "2026-09-17T14",
      end: "2026-09-20T13",
    });
  });
});
