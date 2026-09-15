import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  NEWS_REFRESH_CRON,
  NEWS_REFRESH_INTERVAL_HOURS,
  NEWS_REFRESH_PATH,
  newsRefreshHoursUtc,
} from "@/lib/news/schedule";
import { enabledNewsSources } from "@/lib/news/sources";
import { NEWS_CATEGORIES } from "@/types/news";

const vercelConfig = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};

describe("the news refresh policy", () => {
  it("is once a day, on the hour, in UTC", () => {
    expect(NEWS_REFRESH_INTERVAL_HOURS).toBe(24);
    expect(NEWS_REFRESH_CRON).toBe("0 0 * * *");
    expect(newsRefreshHoursUtc()).toEqual([0]);
  });

  it("stays within what the deployment platform will accept", () => {
    // Vercel's Hobby plan refuses any expression that runs more than once a
    // day, at deploy time rather than at run time. Raising the cadence means
    // upgrading the plan first; this guard is what turns that into a failing
    // test instead of a failed deployment.
    expect(NEWS_REFRESH_INTERVAL_HOURS).toBeGreaterThanOrEqual(24);
    expect(NEWS_REFRESH_CRON).not.toMatch(/\*\//);
  });

  it("is declared once, and the deployed schedule is the one the code states", () => {
    // Other Urdais jobs may hold their own slots -- UBWI publishes daily on its own
    // schedule -- so what this guards is that the *news* job is declared exactly once and
    // at the cadence the schedule module states, not that it is the only cron in the file.
    const news = (vercelConfig.crons ?? []).filter((cron) => cron.path === NEWS_REFRESH_PATH);
    expect(news).toHaveLength(1);
    expect(news[0]).toEqual({ path: NEWS_REFRESH_PATH, schedule: NEWS_REFRESH_CRON });
  });

  it("is a news policy, not a Compute one: one schedule for all six categories", () => {
    // The guard that matters for every later phase. A per-category schedule
    // would show up here as more than one cron entry, or as a category name
    // anywhere in the schedule module.
    const source = readFileSync(path.join(process.cwd(), "src/lib/news/schedule.ts"), "utf8");
    const scheduleBody = source.slice(source.indexOf("export const"));
    for (const category of NEWS_CATEGORIES) {
      expect(scheduleBody).not.toContain(`"${category.id}"`);
    }
    expect((vercelConfig.crons ?? []).filter((cron) => cron.path.startsWith("/api/cron/news"))).toHaveLength(1);
  });

  it("points at a route that ingests every enabled source, whatever its category", () => {
    // The set grows as categories migrate and the schedule does not change,
    // which is the property this file exists to protect.
    const enabled = enabledNewsSources();
    expect(enabled.length).toBeGreaterThan(0);
    expect(new Set(enabled.map((source) => source.category))).toEqual(
      new Set(["compute", "energy-power", "crypto"]),
    );
  });
});
