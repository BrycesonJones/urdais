/** Orchestration for Grid Buildout Velocity ingestion: retrieve, parse, persist. */

import { createHash } from "node:crypto";

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { caisoBuildoutAdapter } from "@/lib/grid-buildout/ingest/adapters/caiso";
import { ercotBuildoutAdapter } from "@/lib/grid-buildout/ingest/adapters/ercot";
import type { BuildoutAdapter } from "@/lib/grid-buildout/ingest/types";
import { persistSnapshot, type BuildoutWriteResult } from "@/lib/grid-buildout/ingest/store";
import type { GbvSourceKey } from "@/lib/grid-buildout/types";

export const BUILDOUT_ADAPTERS: Record<GbvSourceKey, BuildoutAdapter> = {
  ercot: ercotBuildoutAdapter,
  caiso: caisoBuildoutAdapter,
};

export type BuildoutRunOutcome =
  | ({ status: "ingested" } & BuildoutWriteResult)
  | { status: "failed"; source: string; error: string };

/** A plain GET. Both publishers serve a whole workbook in one unauthenticated request. */
export async function retrieveArtifact(url: string, label: string): Promise<RetrievedArtifact> {
  const response = await fetch(url, {
    headers: { "user-agent": "urdais-grid-buildout/1.0 (+https://urdais.com)" },
    redirect: "follow",
  });
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} retrieving ${url}`);
  }
  return {
    label,
    url,
    retrievedAt: new Date().toISOString(),
    status: response.status,
    contentType: response.headers.get("content-type"),
    byteLength: body.byteLength,
    sha256: createHash("sha256").update(body).digest("hex"),
    body,
  };
}

export async function runBuildoutIngest(
  sql: CapacitySqlExecutor,
  source: GbvSourceKey,
  options: { artifact?: RetrievedArtifact } = {},
): Promise<BuildoutRunOutcome> {
  const adapter = BUILDOUT_ADAPTERS[source];
  try {
    const artifact = options.artifact ?? await retrieveArtifact(adapter.artifactUrl(), adapter.key);
    const parsed = adapter.parse(artifact);
    const written = await persistSnapshot(sql, adapter, artifact, parsed);
    return { status: "ingested", ...written };
  } catch (error) {
    return {
      status: "failed",
      source,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}
