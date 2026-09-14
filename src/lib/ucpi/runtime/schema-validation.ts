/**
 * Runtime validation of provider responses against the documented shapes the
 * adapters were written to. A mismatch is schema drift: the provider changed
 * its API, and the run must fail loudly rather than normalize garbage.
 */

import type { LambdaInstanceTypesResponse } from "@/lib/ucpi/adapters/lambda";
import type { RunpodCatalogResponse } from "@/lib/ucpi/adapters/runpod";
import { SchemaDriftError } from "@/lib/ucpi/runtime/http";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function expect(condition: boolean, path: string, detail: string): void {
  if (!condition) throw new SchemaDriftError(path, detail);
}

const AVAILABILITY = new Set(["NONE", "LOW", "MEDIUM", "HIGH"]);

export function validateRunpodCatalog(json: unknown): RunpodCatalogResponse {
  expect(isRecord(json), "$", "expected an object");
  const gpus = (json as Record<string, unknown>).gpus;
  expect(Array.isArray(gpus), "$.gpus", "expected an array");
  (gpus as unknown[]).forEach((g, i) => {
    const p = `$.gpus[${i}]`;
    expect(isRecord(g), p, "expected an object");
    const gpu = g as Record<string, unknown>;
    expect(typeof gpu.id === "string" && gpu.id.length > 0, `${p}.id`, "expected a non-empty string");
    expect(typeof gpu.name === "string", `${p}.name`, "expected a string");
    expect(typeof gpu.memory === "number" && gpu.memory > 0, `${p}.memory`, "expected a positive number");
    expect(isRecord(gpu.price), `${p}.price`, "expected an object");
    const price = gpu.price as Record<string, unknown>;
    for (const k of ["secure", "community", "serverless"]) {
      if (price[k] !== undefined) expect(typeof price[k] === "number" && (price[k] as number) >= 0, `${p}.price.${k}`, "expected a non-negative number");
    }
    if (gpu.availability !== undefined) expect(typeof gpu.availability === "string" && AVAILABILITY.has(gpu.availability), `${p}.availability`, "expected NONE, LOW, MEDIUM or HIGH");
    if (gpu.dataCenters !== undefined) {
      expect(Array.isArray(gpu.dataCenters), `${p}.dataCenters`, "expected an array");
      (gpu.dataCenters as unknown[]).forEach((d, j) => {
        const q = `${p}.dataCenters[${j}]`;
        expect(isRecord(d), q, "expected an object");
        const dc = d as Record<string, unknown>;
        expect(typeof dc.id === "string" && dc.id.length > 0, `${q}.id`, "expected a non-empty string");
        expect(typeof dc.name === "string", `${q}.name`, "expected a string");
        expect(typeof dc.availability === "string" && AVAILABILITY.has(dc.availability), `${q}.availability`, "expected NONE, LOW, MEDIUM or HIGH");
      });
    }
  });
  return json as RunpodCatalogResponse;
}

export function validateLambdaInstanceTypes(json: unknown): LambdaInstanceTypesResponse {
  expect(isRecord(json), "$", "expected an object");
  const data = (json as Record<string, unknown>).data;
  expect(isRecord(data), "$.data", "expected an object keyed by instance type name");
  for (const [name, entry] of Object.entries(data as Record<string, unknown>)) {
    const p = `$.data.${name}`;
    expect(isRecord(entry), p, "expected an object");
    const e = entry as Record<string, unknown>;
    expect(isRecord(e.instance_type), `${p}.instance_type`, "expected an object");
    const t = e.instance_type as Record<string, unknown>;
    expect(typeof t.name === "string", `${p}.instance_type.name`, "expected a string");
    expect(typeof t.description === "string", `${p}.instance_type.description`, "expected a string");
    expect(typeof t.price_cents_per_hour === "number" && t.price_cents_per_hour >= 0, `${p}.instance_type.price_cents_per_hour`, "expected a non-negative number");
    expect(isRecord(t.specs), `${p}.instance_type.specs`, "expected an object");
    const s = t.specs as Record<string, unknown>;
    for (const k of ["vcpus", "memory_gib", "storage_gib", "gpus"]) {
      expect(typeof s[k] === "number" && (s[k] as number) >= 0, `${p}.instance_type.specs.${k}`, "expected a non-negative number");
    }
    expect(Array.isArray(e.regions_with_capacity_available), `${p}.regions_with_capacity_available`, "expected an array (possibly empty)");
    (e.regions_with_capacity_available as unknown[]).forEach((r, i) => {
      const q = `${p}.regions_with_capacity_available[${i}]`;
      expect(isRecord(r), q, "expected an object");
      const region = r as Record<string, unknown>;
      expect(typeof region.name === "string" && region.name.length > 0, `${q}.name`, "expected a non-empty string");
      expect(typeof region.description === "string", `${q}.description`, "expected a string");
    });
  }
  return json as LambdaInstanceTypesResponse;
}
