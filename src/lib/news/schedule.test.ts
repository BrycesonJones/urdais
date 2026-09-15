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
  it("is every four hours, on the hour, in UTC", () => {
    expect(NEWS_REFRESH_INTERVAL_HOURS).toBe(4);
    expect(NEWS_REFRESH_CRON).toBe("0 */4 * * *");
    expect(newsRefreshHoursUtc()).toEqual([0, 4, 8, 12, 16, 20]);
  });

  it("is declared once, and the deployed schedule is the one the code states", () => {
    const crons = vercelConfig.crons ?? [];
    expect(crons).toHaveLength(1);
    expect(crons[0]).toEqual({ path: NEWS_REFRESH_PATH, schedule: NEWS_REFRESH_CRON });
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
    // Today that is Compute only, which is a fact about the registry rather
    // than about the schedule.
    const enabled = enabledNewsSources();
    expect(enabled.length).toBeGreaterThan(0);
    expect(new Set(enabled.map((source) => source.category))).toEqual(new Set(["compute"]));
  });
});
