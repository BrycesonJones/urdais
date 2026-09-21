import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { observationHash } from "@/lib/interconnection-queue/ingest/artifact";
import { persistQueueExtraction } from "@/lib/interconnection-queue/ingest/store";
import type { NormalizedQueueRecord, QueueAdapter, QueueExtraction }
  from "@/lib/interconnection-queue/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

/**
 * One database that persists between runs, so supersession and confirmation are exercised rather
 * than simulated. The adapters' own tests prove what is parsed; these prove what happens to the
 * rows when a publisher changes something underneath them.
 */
function database() {
  type Row = Record<string, unknown>;
  const snapshots: Row[] = [];
  const raw: Row[] = [];
  const requests: Row[] = [];
  const observations: Row[] = [];
  const quantities: Row[] = [];
  const resources: Row[] = [];
  const deferrals: Row[] = [];
  let sequence = 0;
  const id = () => `id-${(sequence += 1)}`;

  /** Read a multi-row VALUES batch back into objects, in the column order the insert declared. */
  const rowsOf = (params: unknown[], columns: number, offset = 0): unknown[][] => {
    const out: unknown[][] = [];
    for (let index = offset; index + columns <= params.length; index += columns) {
      out.push(params.slice(index, index + columns));
    }
    return out;
  };

  const sql: CapacitySqlExecutor = {
    async query(text, params) {
      const p = (params ?? []) as unknown[];
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };

      if (text.includes("from reference.source_interfaces where slug")) return { rows: [{ id: "iface" }] };
      if (text.includes("from reference.grid_areas where slug")) return { rows: [{ id: "area" }] };
      if (text.includes("from reference.permission_grants")) return { rows: [{ id: "grant" }] };
      if (text.includes("from reference.source_use_permissions")) {
        return { rows: [{ id: "perm", purpose_code: "interconnection_queue_retention",
          rights_classification: "ambiguous_requires_legal_review", disposition: "permitted",
          attribution_required: false, attribution_text: null, conditions: null, unresolved_issue: "open" }] };
      }
      if (text.includes("insert into pipeline.source_retrievals")) {
        return { rows: [{ id: "retrieval" }] };
      }
      if (text.includes("insert into pipeline.retrieval_rights_snapshots")) return { rows: [{ id: id() }] };

      if (text.includes("insert into pipeline.interconnection_queue_snapshots")) {
        const existing = snapshots.find((row) => row.artifact_sha256 === p[4] && row.native_snapshot_key === p[3]);
        if (existing !== undefined) return { rows: [] };
        const row = { id: id(), source_interface_id: p[0], retrieval_id: p[2], native_snapshot_key: p[3],
          artifact_sha256: p[4], observed_at: p[6], is_latest: true };
        snapshots.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (text.includes("from pipeline.interconnection_queue_snapshots")) {
        const found = snapshots.find((row) => row.artifact_sha256 === p[1] && row.native_snapshot_key === p[2]);
        return { rows: found === undefined ? [] : [{ id: found.id }] };
      }
      if (text.includes("update pipeline.interconnection_queue_snapshots")) {
        for (const row of snapshots) if (row.id !== p[1]) row.is_latest = false;
        return { rows: [] };
      }

      if (text.includes("insert into pipeline.raw_interconnection_queue_records")) {
        const written: Row[] = [];
        for (const values of rowsOf(p, 8)) {
          const [snapshotId, , sha, recordHash, nativeQueueId] = values;
          if (raw.some((row) => row.snapshot_id === snapshotId && row.record_hash === recordHash)) continue;
          const row = { id: id(), snapshot_id: snapshotId, artifact_sha256: sha,
            record_hash: recordHash, native_queue_id: nativeQueueId };
          raw.push(row);
          written.push({ id: row.id });
        }
        return { rows: written };
      }
      if (text.includes("from pipeline.raw_interconnection_queue_records where snapshot_id")) {
        return { rows: raw.filter((row) => row.snapshot_id === p[0])
          .map((row) => ({ id: row.id, record_hash: row.record_hash })) };
      }

      if (text.includes("insert into pipeline.interconnection_requests")) {
        const written: Row[] = [];
        for (const values of rowsOf(p, 5)) {
          const [areaId, ifaceId, nativeQueueId] = values;
          if (requests.some((row) => row.native_queue_id === nativeQueueId)) continue;
          const row = { id: id(), grid_area_id: areaId, source_interface_id: ifaceId,
            native_queue_id: nativeQueueId };
          requests.push(row);
          written.push({ id: row.id });
        }
        return { rows: written };
      }
      if (text.includes("from pipeline.interconnection_requests\n        where grid_area_id")) {
        return { rows: requests.map((row) => ({ id: row.id, native_queue_id: row.native_queue_id })) };
      }

      if (text.includes("from pipeline.interconnection_request_observations o") && text.includes("o.is_latest")) {
        return { rows: observations.filter((row) => row.is_latest === true).map((row) => ({
          id: row.id, request_id: row.request_id, observation_hash: row.observation_hash,
          observation_ordinal: row.observation_ordinal,
        })) };
      }
      if (text.includes("update pipeline.interconnection_request_observations o")) {
        for (const values of rowsOf(p, 2, 1)) {
          const row = observations.find((candidate) => candidate.id === values[0]);
          if (row !== undefined) { row.last_snapshot_id = p[0]; row.last_raw_record_id = values[1]; }
        }
        return { rows: [] };
      }
      if (text.includes("update pipeline.interconnection_request_observations")) {
        for (const row of observations) if (p.includes(row.request_id)) row.is_latest = false;
        return { rows: [] };
      }
      if (text.includes("insert into pipeline.interconnection_request_observations")) {
        const written: Row[] = [];
        for (const values of rowsOf(p, 30)) {
          const row = {
            id: id(), request_id: values[0], first_snapshot_id: values[1], last_snapshot_id: values[2],
            first_raw_record_id: values[3], last_raw_record_id: values[4],
            observation_ordinal: values[5], observation_hash: values[6],
            lifecycle_stage: values[11], requested_on: values[13], actual_in_service_on: values[16],
            withdrawn_on: values[18], is_latest: true,
          };
          observations.push(row);
          written.push({ id: row.id, request_id: row.request_id, observation_ordinal: row.observation_ordinal });
        }
        return { rows: written };
      }
      if (text.includes("insert into pipeline.interconnection_request_quantities")) {
        const written: Row[] = [];
        for (const values of rowsOf(p, 8)) {
          quantities.push({ observation_id: values[0], native_field: values[1], quantity_kind: values[2],
            value: values[3], resource_ordinal: values[5] });
          written.push({ id: id() });
        }
        return { rows: written };
      }
      if (text.includes("insert into pipeline.interconnection_request_resources")) {
        const written: Row[] = [];
        for (const values of rowsOf(p, 7)) {
          resources.push({ observation_id: values[0], component_ordinal: values[1] });
          written.push({ id: id() });
        }
        return { rows: written };
      }
      if (text.includes("insert into pipeline.interconnection_queue_deferrals")) {
        const written: Row[] = [];
        for (const values of rowsOf(p, 6)) {
          const identity = `${String(values[0])}|${String(values[2])}|${String(values[1])}|${String(values[3])}|${String(values[4])}`;
          if (deferrals.some((row) => row.identity === identity)) continue;
          deferrals.push({ identity });
          written.push({ id: id() });
        }
        return { rows: written };
      }
      throw new Error(`unexpected query: ${text.slice(0, 80)}`);
    },
  };

  return {
    sql, snapshots, raw, requests, observations, quantities, resources, deferrals,
    latest: () => observations.filter((row) => row.is_latest === true),
    history: (nativeQueueId: string) => {
      const request = requests.find((row) => row.native_queue_id === nativeQueueId);
      return observations.filter((row) => row.request_id === request?.id)
        .sort((a, b) => Number(a.observation_ordinal) - Number(b.observation_ordinal));
    },
  };
}

const adapter: QueueAdapter = {
  key: "pjm", marketSlug: "pjm", sourceInterfaceSlug: "pjm-planning-queues",
  retrievalPurpose: "research",
  artifacts: [{ label: "feed", url: "https://example.test/feed" }],
  parse: () => { throw new Error("not used"); },
};

function artifactFor(body: string): ReadonlyMap<string, RetrievedArtifact> {
  const buffer = Buffer.from(body, "utf8");
  return new Map([["feed", {
    label: "feed", url: "https://example.test/feed", retrievedAt: "2026-09-21T12:00:00.000Z",
    status: 200, contentType: null, byteLength: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"), body: buffer,
  }]]);
}

function record(over: Partial<NormalizedQueueRecord> = {}): NormalizedQueueRecord {
  return {
    nativeQueueId: "A01", nativeProjectName: "Plant", nativeCustomer: null,
    nativeStatus: { Status: "Active" }, nativeStatusDisplay: "Active",
    lifecycleStage: "study", requestClass: "generation",
    requestedOn: "2020-01-01", proposedInServiceOn: "2026-01-01", revisedInServiceOn: null,
    actualInServiceOn: null, agreementExecutedOn: null, withdrawnOn: null,
    nativeState: "PA", nativeCounty: "Lebanon", nativeZone: null, nativePoi: null,
    nativeSubstation: null, nativeTransmissionOwner: "ME", sourcePartition: "serial",
    quantities: [{ nativeField: "MWEnergy", quantityKind: "energy_service_mw", value: 100,
      unit: "MW", resourceOrdinal: null, direction: "injection" }],
    resources: [{ componentOrdinal: 1, nativeTechnology: null, nativeFuel: "Solar",
      technology: "solar", isSourceSeparated: false }],
    locator: { extractionMethod: "xml_element", ordinal: 1 },
    payload: { ProjectNumber: "A01" },
    canonical: true,
    ...over,
  };
}

const extraction = (records: NormalizedQueueRecord[], key: string | null = null): QueueExtraction => ({
  snapshot: { nativeSnapshotKey: key, sourcePublishedAt: null },
  records, deferrals: [],
});

describe("persisting a queue extraction", () => {
  it("writes evidence, identity, observation, quantities and resources on a first run", async () => {
    const db = database();
    const written = await persistQueueExtraction(
      db.sql, adapter, artifactFor("v1"), extraction([record(), record({ nativeQueueId: "A02" })]), "test");

    expect(written.snapshot).toBe("created");
    expect(written.rawRecordsInserted).toBe(2);
    expect(written.requestsInserted).toBe(2);
    expect(written.observationsInserted).toBe(2);
    expect(written.quantitiesInserted).toBe(2);
    expect(written.resourcesInserted).toBe(2);
    expect(written.observationsConfirmed).toBe(0);
  });

  it("does nothing at all on an exact rerun", async () => {
    // The same bytes resolve to the same snapshot, and a snapshot that already exists was fully
    // processed when it was written. Reprocessing it can only produce what is already there —
    // and for an archive replay it would do harm, comparing a 2018 artifact against a request's
    // current state and writing an observation dated backwards.
    const db = database();
    const body = "v1";
    await persistQueueExtraction(db.sql, adapter, artifactFor(body), extraction([record()]), "test");
    const rerun = await persistQueueExtraction(db.sql, adapter, artifactFor(body), extraction([record()]), "test");

    expect(rerun.snapshot).toBe("existing");
    expect(rerun.rawRecordsInserted).toBe(0);
    expect(rerun.requestsInserted).toBe(0);
    expect(rerun.observationsInserted).toBe(0);
    expect(rerun.quantitiesInserted).toBe(0);
    expect(rerun.resourcesInserted).toBe(0);
    expect(rerun.observationsConfirmed).toBe(0);
    expect(db.observations).toHaveLength(1);
  });

  it("recognises unchanged content even when the artifact bytes moved", async () => {
    // A publisher that reorders rows or reformats whitespace has not changed a single fact.
    const db = database();
    await persistQueueExtraction(db.sql, adapter, artifactFor("v1"), extraction([record()]), "test");
    const second = await persistQueueExtraction(
      db.sql, adapter, artifactFor("v2-different-bytes"), extraction([record()]), "test");

    expect(second.snapshot).toBe("created"); // A new observed source state, correctly.
    expect(second.rawRecordsInserted).toBe(1); // New evidence, correctly.
    expect(second.observationsInserted).toBe(0); // But nothing new was said.
    expect(second.observationsConfirmed).toBe(1);
    expect(db.observations).toHaveLength(1);
  });
});

describe("a source correction", () => {
  it("adds an observation and keeps the earlier one as history", async () => {
    const db = database();
    await persistQueueExtraction(db.sql, adapter, artifactFor("v1"), extraction([record()]), "test");
    const corrected = await persistQueueExtraction(
      db.sql, adapter, artifactFor("v2"),
      extraction([record({ lifecycleStage: "withdrawn", withdrawnOn: "2026-03-01" })]), "test");

    expect(corrected.observationsInserted).toBe(1);
    expect(corrected.observationsConfirmed).toBe(0);

    const history = db.history("A01");
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.observation_ordinal)).toEqual([1, 2]);
    // The earlier state is intact and no longer latest.
    expect(history[0]!.lifecycle_stage).toBe("study");
    expect(history[0]!.is_latest).toBe(false);
    expect(history[1]!.lifecycle_stage).toBe("withdrawn");
    expect(history[1]!.is_latest).toBe(true);
    // Identity did not change.
    expect(db.requests).toHaveLength(1);
  });

  it("touches only the requests that changed", async () => {
    const db = database();
    const first = [record({ nativeQueueId: "A01" }), record({ nativeQueueId: "A02" }),
      record({ nativeQueueId: "A03" })];
    await persistQueueExtraction(db.sql, adapter, artifactFor("v1"), extraction(first), "test");

    const second = [record({ nativeQueueId: "A01" }),
      record({ nativeQueueId: "A02", lifecycleStage: "operational", actualInServiceOn: "2026-02-02" }),
      record({ nativeQueueId: "A03" })];
    const written = await persistQueueExtraction(db.sql, adapter, artifactFor("v2"), extraction(second), "test");

    expect(written.observationsInserted).toBe(1);
    expect(written.observationsConfirmed).toBe(2);
    expect(db.history("A01")).toHaveLength(1);
    expect(db.history("A03")).toHaveLength(1);
    expect(db.history("A02")).toHaveLength(2);
  });

  it("carries a request that oscillates back to an earlier state as a new observation", async () => {
    // Equal hashes must not collide as an identity: a suspended project that resumes and is
    // suspended again has three states, not two.
    const db = database();
    const active = record();
    const suspended = record({ lifecycleStage: "suspended" });
    await persistQueueExtraction(db.sql, adapter, artifactFor("a"), extraction([active]), "test");
    await persistQueueExtraction(db.sql, adapter, artifactFor("b"), extraction([suspended]), "test");
    await persistQueueExtraction(db.sql, adapter, artifactFor("c"), extraction([active]), "test");

    const history = db.history("A01");
    expect(history.map((row) => row.lifecycle_stage)).toEqual(["study", "suspended", "study"]);
    expect(history.map((row) => row.observation_ordinal)).toEqual([1, 2, 3]);
    expect(db.latest()).toHaveLength(1);
  });

  it("preserves the dates cohort analysis will need, unchanged through persistence", async () => {
    const db = database();
    await persistQueueExtraction(db.sql, adapter, artifactFor("v1"), extraction([
      record({ nativeQueueId: "W1", lifecycleStage: "withdrawn",
        requestedOn: "2018-03-04", withdrawnOn: "2021-11-30" }),
      record({ nativeQueueId: "O1", lifecycleStage: "operational",
        requestedOn: "2016-01-02", actualInServiceOn: "2022-07-19" }),
    ]), "test");

    const withdrawn = db.history("W1")[0]!;
    expect(withdrawn.requested_on).toBe("2018-03-04");
    expect(withdrawn.withdrawn_on).toBe("2021-11-30");
    const operational = db.history("O1")[0]!;
    expect(operational.requested_on).toBe("2016-01-02");
    expect(operational.actual_in_service_on).toBe("2022-07-19");
  });
});

describe("a row denied canonical identity", () => {
  it("keeps its raw evidence and creates no request or observation", async () => {
    const db = database();
    const written = await persistQueueExtraction(db.sql, adapter, artifactFor("v1"), extraction([
      // Two rows, two places in the artifact, one queue id — which is exactly how MISO serves
      // J2656 today.
      record({ nativeQueueId: "J1", canonical: false,
        locator: { extractionMethod: "json_object", ordinal: 1 }, payload: { row: 1 } }),
      record({ nativeQueueId: "J1", canonical: false, nativeProjectName: "Other",
        locator: { extractionMethod: "json_object", ordinal: 2 }, payload: { row: 2 } }),
      record({ nativeQueueId: "J2" }),
    ]), "test");

    expect(written.rawRecordsInserted).toBe(3);
    expect(written.nonCanonicalRows).toBe(2);
    expect(written.requestsInserted).toBe(1);
    expect(written.observationsInserted).toBe(1);
    expect(db.requests.map((row) => row.native_queue_id)).toEqual(["J2"]);
  });
});

describe("cost", () => {
  it("issues statements per batch, not per record", async () => {
    const db = database();
    const many = Array.from({ length: 4_000 }, (_, index) => record({ nativeQueueId: `Q${index}` }));
    const written = await persistQueueExtraction(
      db.sql, adapter, artifactFor("many"), extraction(many), "test", { batchSize: 1_000 });

    expect(written.observationsInserted).toBe(4_000);
    // Four thousand records must not be four thousand round trips. Lineage, retrieval, rights,
    // the snapshot and the lookups are a fixed cost; the rest scales with batch count alone.
    expect(written.statements).toBeLessThan(60);
  });

  it("costs less on a rerun that writes nothing", async () => {
    const db = database();
    const many = Array.from({ length: 2_000 }, (_, index) => record({ nativeQueueId: `Q${index}` }));
    await persistQueueExtraction(db.sql, adapter, artifactFor("many"), extraction(many), "test");
    const rerun = await persistQueueExtraction(db.sql, adapter, artifactFor("many"), extraction(many), "test");
    // A seen artifact stops at the snapshot lookup, so the rerun is cheaper still.
    expect(rerun.statements).toBeLessThan(15);
  });
});

describe("the observation hash", () => {
  it("changes when any material field changes", async () => {
    const base = record();
    expect(observationHash(base)).toBe(observationHash(record()));
    expect(observationHash(record({ lifecycleStage: "withdrawn" }))).not.toBe(observationHash(base));
    expect(observationHash(record({ requestedOn: "2020-01-02" }))).not.toBe(observationHash(base));
    expect(observationHash(record({ nativeStatus: { Status: "Withdrawn" } }))).not.toBe(observationHash(base));
    expect(observationHash(record({
      quantities: [{ nativeField: "MWEnergy", quantityKind: "energy_service_mw", value: 101,
        unit: "MW", resourceOrdinal: null, direction: "injection" }],
    }))).not.toBe(observationHash(base));
    expect(observationHash(record({
      resources: [{ componentOrdinal: 1, nativeTechnology: null, nativeFuel: "Wind",
        technology: "wind", isSourceSeparated: false }],
    }))).not.toBe(observationHash(base));
  });

  it("ignores where in the artifact the row happened to sit", async () => {
    // A publisher that reorders its file has not restated anything.
    expect(observationHash(record({ locator: { extractionMethod: "xml_element", ordinal: 9_999 } })))
      .toBe(observationHash(record()));
    expect(observationHash(record({ payload: { anything: "else" } }))).toBe(observationHash(record()));
  });
});
