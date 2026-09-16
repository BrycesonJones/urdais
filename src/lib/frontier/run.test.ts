import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { frontierRunSummary, runFrontierCapability } from "@/lib/frontier/run";
import { cronRequestAuthorized } from "@/app/api/cron/frontier/route";
import type { SqlExecutor } from "@/lib/utvi/store";

/**
 * A minimal ZIP writer, so the tests drive the real reader rather than a stubbed one. The
 * bundle's shape is part of what can break, and a fake that skipped it would not notice.
 */
function zip(files: { name: string; text: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.text, "utf8");
    const deflated = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + deflated.length;
  }
  const body = Buffer.concat([...locals]);
  const directory = Buffer.concat([...centrals]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, directory, end]);
}

const README = "## Licensing\nEpoch AI's data is free to use under the Creative Commons Attribution license.\n";
const HEADER = "Model version,mean_score,Best score (across scorers),Organization,Started at";
const GPQA = `${HEADER}\ngpt-6-astra_max,0.95,0.95,OpenAI,2026-09-02\n`;
const FM = `${HEADER}\ngpt-6-astra_max,0.93,0.93,OpenAI,2026-09-02\n`;

const bundle = (gpqa = GPQA) =>
  zip([
    { name: "README.md", text: README },
    { name: "gpqa_diamond.csv", text: gpqa },
    { name: "frontiermath_tiers_1_3_v2.csv", text: FM },
    // Present in the real bundle and never eligible. Included so the run has the chance to
    // ingest it and must not.
    { name: "aider_polyglot_external.csv", text: `${HEADER}\nsomething,0.5,0.5,OpenAI,2026-09-02\n` },
  ]);

/** A scripted executor recording every statement, so writes can be asserted by absence. */
function scripted(previousHash: string | null) {
  const calls: { text: string; params: readonly unknown[] }[] = [];
  const sql: SqlExecutor = {
    async query(text: string, params: readonly unknown[]) {
      calls.push({ text, params });
      if (text.includes("from reference.source_interfaces")) {
        return {
          rows: [
            {
              source_interface_id: "iface-1",
              provider_id: "prov-1",
              permission_grant_id: "grant-1",
            },
          ],
        };
      }
      if (text.includes("from pipeline.capability_retrievals")) {
        return { rows: previousHash === null ? [] : [{ bundle_content_hash: previousHash }] };
      }
      if (text.includes("insert into pipeline.source_retrievals")) return { rows: [{ id: "sr-1" }] };
      if (text.includes("insert into pipeline.capability_retrievals")) return { rows: [{ id: "cr-1" }] };
      if (text.includes("from pipeline.capability_observations")) return { rows: [] };
      if (text.includes("from reference.models m join reference.providers")) {
        return { rows: [{ provider_slug: "openai", provider_model_id: "gpt-6-astra" }] };
      }
      return { rows: [] };
    },
  };
  const wrote = (fragment: string) => calls.filter((call) => call.text.includes(fragment));
  return { sql, calls, wrote };
}

describe("cron authorisation", () => {
  it("fails closed when no secret is configured", () => {
    expect(cronRequestAuthorized("Bearer anything", undefined)).toBe(false);
    expect(cronRequestAuthorized("Bearer anything", "  ")).toBe(false);
  });

  it("rejects a wrong or malformed token", () => {
    expect(cronRequestAuthorized("Bearer nope", "secret")).toBe(false);
    expect(cronRequestAuthorized("secret", "secret")).toBe(false);
    expect(cronRequestAuthorized(null, "secret")).toBe(false);
  });

  it("accepts the configured secret", () => {
    expect(cronRequestAuthorized("Bearer secret", "secret")).toBe(true);
  });
});

describe("an unchanged source", () => {
  it("is a successful check that ingests nothing", async () => {
    const archive = bundle();
    const hash = createHash("sha256").update(archive).digest("hex");
    const { sql, wrote } = scripted(hash);

    const result = await runFrontierCapability(sql, { fetchBundle: async () => archive, trigger: "scheduled" });

    expect(result.ok).toBe(true);
    expect(result.sourceChanged).toBe(false);
    // Nothing that would constitute data was written.
    expect(wrote("insert into pipeline.capability_retrievals")).toHaveLength(0);
    expect(wrote("insert into pipeline.capability_observations")).toHaveLength(0);
    expect(wrote("insert into reference.capability_model_links")).toHaveLength(0);
    expect(wrote("insert into reference.model_price_selections")).toHaveLength(0);
  });

  it("still records one heartbeat, or a stopped scheduler would be invisible", async () => {
    const archive = bundle();
    const hash = createHash("sha256").update(archive).digest("hex");
    const { sql, wrote } = scripted(hash);

    await runFrontierCapability(sql, { fetchBundle: async () => archive, trigger: "scheduled" });

    const beats = wrote("insert into pipeline.capability_check_runs");
    expect(beats).toHaveLength(1);
    expect(beats[0]!.params).toContain("unchanged");
    expect(beats[0]!.params).toContain("scheduled");
  });

  it("is never described as a rollover", async () => {
    const archive = bundle();
    const hash = createHash("sha256").update(archive).digest("hex");
    const { sql } = scripted(hash);
    const result = await runFrontierCapability(sql, { fetchBundle: async () => archive });
    const summary = frontierRunSummary(result);
    expect(summary).toMatch(/source unchanged/);
    expect(summary).toMatch(/no capability rollover/);
    expect(summary).not.toMatch(/rolled over/);
  });

  it("marks an operator run as such, so it cannot pass for scheduler evidence", async () => {
    const archive = bundle();
    const hash = createHash("sha256").update(archive).digest("hex");
    const { sql, wrote } = scripted(hash);
    await runFrontierCapability(sql, { fetchBundle: async () => archive, trigger: "operator" });
    expect(wrote("insert into pipeline.capability_check_runs")[0]!.params).toContain("operator");
  });
});

describe("a changed source", () => {
  it("ingests, links, re-selects prices and records an ingested heartbeat", async () => {
    const archive = bundle();
    const { sql, wrote } = scripted("b".repeat(64));

    const result = await runFrontierCapability(sql, { fetchBundle: async () => archive, trigger: "scheduled" });

    expect(result.ok).toBe(true);
    expect(result.sourceChanged).toBe(true);
    expect(result.observations).toMatchObject({ created: 2 });
    expect(result.identity).toMatchObject({ evidenced: 1 });
    expect(wrote("insert into pipeline.capability_retrievals")).toHaveLength(1);
    const beat = wrote("insert into pipeline.capability_check_runs")[0]!;
    expect(beat.params).toContain("ingested");
    expect(frontierRunSummary(result)).toMatch(/source rolled over/);
  });

  it("never ingests an _external file, whatever else the bundle contains", async () => {
    const { sql, calls } = scripted("b".repeat(64));
    await runFrontierCapability(sql, { fetchBundle: async () => bundle() });
    const inserts = calls.filter((c) => c.text.includes("insert into pipeline.capability_observations"));
    expect(inserts.length).toBeGreaterThan(0);
    for (const insert of inserts) {
      expect(insert.params).not.toContain("aider_polyglot_external.csv");
    }
  });

  it("preserves the raw identifier and the declared configuration", async () => {
    const { sql, calls } = scripted("b".repeat(64));
    await runFrontierCapability(sql, { fetchBundle: async () => bundle() });
    const link = calls.find((c) => c.text.includes("insert into reference.capability_model_links"))!;
    expect(link.params).toContain("gpt-6-astra_max");
    expect(link.params).toContain("gpt-6-astra");
    expect(link.params).toContain("max");
    expect(link.params).toContain("evidenced");
  });
});

describe("failure behaviour", () => {
  it("refuses a bundle whose README stopped stating the licence, and writes no data", async () => {
    const archive = zip([
      { name: "README.md", text: "## Licensing\nAll rights reserved.\n" },
      { name: "gpqa_diamond.csv", text: GPQA },
      { name: "frontiermath_tiers_1_3_v2.csv", text: FM },
    ]);
    const { sql, wrote } = scripted("b".repeat(64));

    const result = await runFrontierCapability(sql, { fetchBundle: async () => archive, trigger: "scheduled" });

    expect(result.ok).toBe(false);
    expect(result.failure).toMatch(/Creative Commons Attribution/);
    expect(wrote("insert into pipeline.capability_observations")).toHaveLength(0);
    // The failure is still recorded, so a run that keeps refusing is visible rather than silent.
    expect(wrote("insert into pipeline.capability_check_runs")[0]!.params).toContain("failed");
  });

  it("refuses a partial bundle rather than ingesting one benchmark of two", async () => {
    const archive = zip([
      { name: "README.md", text: README },
      { name: "gpqa_diamond.csv", text: GPQA },
    ]);
    const { sql, wrote } = scripted("b".repeat(64));

    const result = await runFrontierCapability(sql, { fetchBundle: async () => archive });

    expect(result.ok).toBe(false);
    expect(result.failure).toMatch(/refusing a partial ingestion/);
    expect(wrote("insert into pipeline.capability_observations")).toHaveLength(0);
  });

  it("returns a fetch failure rather than throwing, so the run reports it", async () => {
    const { sql } = scripted(null);
    const result = await runFrontierCapability(sql, {
      fetchBundle: async () => {
        throw new Error("network down");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.failure).toMatch(/network down/);
    expect(frontierRunSummary(result)).toMatch(/^failed:/);
  });

  it("keeps the last healthy data on failure, because nothing is deleted on the way out", async () => {
    const { sql, calls } = scripted("b".repeat(64));
    await runFrontierCapability(sql, {
      fetchBundle: async () => {
        throw new Error("network down");
      },
    });
    expect(calls.some((c) => /delete from|update .*capability_observations .*set/i.test(c.text))).toBe(false);
  });
});
