/**
 * Code-ordinal invariants.
 *
 * These exist because of a real production failure. The margin compatibility trigger compares a
 * margin's `selected_direction` with its limit's `direction` numerically, and the two domains had
 * numbered the shared concept "undirected" differently — 3 and 0. NYISO data never exposed it,
 * because there the selected direction is always positive or negative and both domains agree on
 * those. ERCOT, whose margins are all undirected, failed on the first production migration attempt.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import * as code from "@/lib/transmission-headroom/codes";

describe("direction domains agree where they overlap", () => {
  it("numbers every shared concept identically", () => {
    // Anything a limit can be, a margin can have selected, and the trigger compares the two as
    // integers. They must not disagree.
    for (const shared of ["undirected", "positive", "negative"] as const) {
      expect(code.selectedDirection.to(shared)).toBe(code.limitDirection.to(shared));
    }
  });

  it("keeps 'undetermined' out of the range a limit can occupy", () => {
    // Zero flow selects no direction. No limit is ever 'undetermined', so its ordinal must not
    // collide with one a limit could hold.
    const limitOrdinals = (["undirected", "positive", "negative"] as const)
      .map((value) => code.limitDirection.to(value));
    expect(limitOrdinals).not.toContain(code.selectedDirection.to("undetermined"));
  });

  it("an ERCOT undirected margin matches its own undirected limit", () => {
    // The exact case that failed against production.
    expect(code.selectedDirection.to("undirected")).toBe(code.limitDirection.to("undirected"));
  });
});

describe("the migration's code map matches this file", () => {
  const migration = readFileSync(
    "supabase/migrations/20261007100000_transmission_headroom_storage.sql", "utf8");

  const ordinalsIn = (domain: string): Record<string, number> => {
    const found: Record<string, number> = {};
    for (const match of migration.matchAll(
      new RegExp(`\\('${domain}',\\s*'([^']+)',\\s*(\\d+)\\)`, "g"))) {
      found[match[1]!] = Number(match[2]);
    }
    return found;
  };

  // The database and the engine must agree, or a value written by one is misread by the other.
  const domains = [
    ["contingency_kind", code.contingencyKind],
    ["entity_kind", code.entityKind],
    ["limit_state", code.limitState],
    ["limit_direction", code.limitDirection],
    ["flow_direction", code.flowDirection],
    ["margin_state", code.marginState],
    ["selected_direction", code.selectedDirection],
    ["timestamp_zone_status", code.zoneStatus],
    ["unit_as_published", code.unitAsPublished],
  ] as const;

  for (const [domain, codec] of domains) {
    it(`${domain} agrees between the migration and the codec`, () => {
      const inSql = ordinalsIn(domain);
      expect(Object.keys(inSql).length).toBeGreaterThan(0);
      for (const [name, ordinal] of Object.entries(inSql)) {
        expect(codec.to(name as never)).toBe(ordinal);
        expect(codec.from(ordinal)).toBe(name);
      }
    });
  }
});
