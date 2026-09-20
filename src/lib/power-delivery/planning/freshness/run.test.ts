import { describe, expect, it } from "vitest";

import { runPlanningSourceCheck, runPlanningSourceChecks } from "@/lib/power-delivery/planning/freshness/run";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

/** Records the checks written, which is what proves a failed check is evidence rather than a log line. */
function recorder() {
  const checks: Record<string, unknown>[] = [];
  const sql: PlanningSqlExecutor = {
    async query(text, params) {
      if (!text.includes("insert into pipeline.planning_source_checks")) throw new Error(`unexpected query: ${text.slice(0, 60)}`);
      const p = params as unknown[];
      checks.push({ slug: p[0], checkedAt: p[1], outcome: p[2], vintage: p[6], error: p[12] });
      return { rows: [{ id: `check-${checks.length}` }] };
    },
  };
  return { sql, checks };
}

const ercotBody = `<html>
  <a href="https://www.ercot.com/files/docs/2025/04/08/Summer-and-Winter-Peaks.xlsx">peaks</a>
  <a href="https://www.ercot.com/files/docs/2025/04/08/2025_LTLF_Report.docx">report</a>
</html>`;

describe("running a planning source check", () => {
  it("writes down what a successful check found", async () => {
    const db = recorder();
    const outcome = await runPlanningSourceCheck(db.sql, "ercot", {
      fetcher: async (url) => ({ url, status: 200, body: ercotBody }),
      now: new Date("2026-09-22T00:00:00.000Z"),
    });
    expect(outcome).toMatchObject({ status: "checked", discoveredVintageKey: "ltlf-2025-04-adjusted" });
    expect(db.checks).toHaveLength(1);
    expect(db.checks[0]).toMatchObject({
      slug: "ercot-long-term-load-forecast", outcome: "succeeded",
      vintage: "ltlf-2025-04-adjusted", error: null,
    });
  });

  it("writes down a failure instead of discarding it", async () => {
    const db = recorder();
    const outcome = await runPlanningSourceCheck(db.sql, "ercot", {
      fetcher: async () => { throw new Error("connect ETIMEDOUT"); },
    });
    expect(outcome.status).toBe("check_failed");
    expect(db.checks[0]).toMatchObject({ outcome: "failed", vintage: null });
    expect(String(db.checks[0]!.error)).toMatch(/ETIMEDOUT/);
  });

  it("records a page it could read but could not understand as a failed check", async () => {
    const db = recorder();
    const outcome = await runPlanningSourceCheck(db.sql, "ercot", {
      fetcher: async (url) => ({ url, status: 200, body: "<html>redesigned</html>" }),
    });
    expect(outcome.status).toBe("check_failed");
    expect(db.checks[0]).toMatchObject({ outcome: "failed" });
    expect(String(db.checks[0]!.error)).toMatch(/no longer links Summer-and-Winter-Peaks/);
  });

  it("reports a blocked source rather than pretending to check it", async () => {
    const db = recorder();
    expect(await runPlanningSourceCheck(db.sql, "spp", {})).toMatchObject({ status: "blocked" });
    expect(await runPlanningSourceCheck(db.sql, "miso", {})).toMatchObject({ status: "blocked" });
    expect(await runPlanningSourceCheck(db.sql, "nyiso", {})).toMatchObject({ status: "blocked" });
    expect(db.checks).toEqual([]);
  });

  it("does not let one publisher's failure stop the others", async () => {
    const db = recorder();
    const outcomes = await runPlanningSourceChecks(db.sql, ["ercot", "pjm", "cec", "isone"], {
      now: new Date("2026-09-22T00:00:00.000Z"),
      fetcher: async (url) => {
        if (url.includes("ercot.com")) throw new Error("ERCOT is down");
        if (url.includes("pjm.com")) return { url, status: 200, body: '<a href="/x/2026-load-report-data.xlsx">d</a>' };
        if (url.includes("energy.ca.gov")) return { url, status: 200, body: '<a href="/a">CED 2025 Peak Forecast</a>' };
        return { url, status: url.includes("2026_celt") ? 200 : 404, body: "" };
      },
    });
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["check_failed", "checked", "checked", "checked"]);
    expect(outcomes.filter((outcome) => outcome.status === "checked").map((o) => "discoveredVintageKey" in o ? o.discoveredVintageKey : null))
      .toEqual(["load-forecast-2026", "ced-2025", "celt-2026"]);
    // All four are recorded, the failure included.
    expect(db.checks.map((check) => check.outcome)).toEqual(["failed", "succeeded", "succeeded", "succeeded"]);
  });

  it("can run without a database for a preview, writing nothing", async () => {
    const outcome = await runPlanningSourceCheck(null, "ercot", {
      fetcher: async (url) => ({ url, status: 200, body: ercotBody }),
    });
    expect(outcome).toMatchObject({ status: "checked", checkId: "" });
  });
});
