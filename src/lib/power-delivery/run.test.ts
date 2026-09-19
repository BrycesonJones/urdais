import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scheduledPowerWindow } from "@/lib/power-delivery/run";

describe("Power Delivery scheduled collection window", () => {
  it("rereads 48 completed hours and includes the next 24 forecast hours", () => {
    expect(scheduledPowerWindow(new Date("2026-09-19T14:37:12Z"))).toEqual({
      start: "2026-09-17T14",
      end: "2026-09-20T13",
    });
  });

  it("uses the Vercel Hobby-compatible daily production schedule", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const cron = config.crons.find((entry) => entry.path === "/api/cron/power-delivery");
    expect(cron).toEqual({ path: "/api/cron/power-delivery", schedule: "15 8 * * *" });
  });
});
