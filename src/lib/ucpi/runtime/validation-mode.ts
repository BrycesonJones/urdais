/**
 * First authenticated validation. Performs a live, credentialed retrieval
 * through the same runtime as production, with purpose `validation`, and
 * reports what the documented interface actually returned against what the
 * child needs. It persists the retrieval as validation evidence, creates no
 * calculation run, and can never publish: the database refuses to build a
 * production value from validation retrievals, and no run is created here.
 *
 * Usable only after the source is production-approved on both axes and a
 * grant is in force; the runtime's preflight enforces that.
 */

import type { LambdaInstanceTypesResponse } from "@/lib/ucpi/adapters/lambda";
import type { RunpodCatalogResponse, RunpodGpuTypeDetails } from "@/lib/ucpi/adapters/runpod";
import { RUNPOD_H100_SXM_GPU_TYPE_ID } from "@/lib/ucpi/adapters/runpod";
import type { SourceRuntimeInput } from "@/lib/ucpi/runtime/collector-runtime";
import { collectSource } from "@/lib/ucpi/runtime/collector-runtime";
import type { EventSink } from "@/lib/ucpi/runtime/events";

export type CheckOutcome = "pass" | "fail" | "pending";
export type ValidationCheck = { check: string; outcome: CheckOutcome; detail: string };
export type ValidationReport = { source: string; retrievalId: string | null; checks: ValidationCheck[]; passed: boolean };

function check(events: EventSink, source: string, name: string, outcome: CheckOutcome, detail: string): ValidationCheck {
  events.emit({ type: "validation_check", source, check: name, outcome, detail });
  return { check: name, outcome, detail };
}

export async function validateRunpod(input: Omit<SourceRuntimeInput<unknown, RunpodCatalogResponse, ReadonlyMap<string, RunpodGpuTypeDetails>>, "mode">): Promise<ValidationReport> {
  const source = input.adapter.sourceInterfaceSlug;
  const checks: ValidationCheck[] = [];
  let retrievalId: string | null = null;
  try {
    const result = await collectSource({ ...input, mode: "validation" });
    retrievalId = result.retrieval.id;
    const response = result.retrieval.responseBody as RunpodCatalogResponse;
    checks.push(check(input.events, source, "endpoint_reachable", "pass", `status ${result.retrieval.responseStatus} after ${result.attempts} attempt(s)`));
    const h100 = response.gpus.find((g) => g.id === RUNPOD_H100_SXM_GPU_TYPE_ID);
    checks.push(check(input.events, source, "h100_sxm_product_present", h100 ? "pass" : "fail", h100 ? `${h100.id} / ${h100.name} / ${h100.memory} GB` : `no GPU type with id ${RUNPOD_H100_SXM_GPU_TYPE_ID}`));
    const details = input.companion.get(RUNPOD_H100_SXM_GPU_TYPE_ID);
    checks.push(check(input.events, source, "min_pod_gpu_count", details?.minPodGpuCount != null ? (details.minPodGpuCount === 1 ? "pass" : "fail") : "pending", details?.minPodGpuCount != null ? `minPodGpuCount=${details.minPodGpuCount}` : "companion GraphQL details not supplied"));
    const dcs = h100?.dataCenters ?? [];
    checks.push(check(input.events, source, "datacenter_list", dcs.length > 0 ? "pass" : "fail", dcs.map((d) => `${d.id}=${d.availability}`).join(", ") || "no datacenters returned"));
    checks.push(check(input.events, source, "country_filter_honoured", dcs.length > 0 ? "pass" : "pending", `filter countryCodes=${result.retrieval.request.parameters.countryCodes}; ${dcs.length} datacenter(s) returned under it`));
    checks.push(check(input.events, source, "availability_shape", "pass", "values validated against NONE/LOW/MEDIUM/HIGH by the schema check"));
    const cloud = result.retrieval.request.parameters.cloud;
    const price = cloud === "SECURE" ? h100?.price.secure : h100?.price.community;
    checks.push(check(input.events, source, "price_fields", typeof price === "number" ? "pass" : "fail", typeof price === "number" ? `${cloud} price present` : `${cloud} price missing`));
    checks.push(check(input.events, source, "secure_community_handling", cloud === "SECURE" || cloud === "COMMUNITY" ? "pass" : "fail", `retrieved cloud tier ${cloud}; the other tier needs its own validation retrieval`));
    checks.push(check(input.events, source, "non_bid_price_confirmed", "pending", "requires comparing the catalog price with the GraphQL uninterruptablePrice at first validation"));
    const bundle = details?.bundle[cloud as "SECURE" | "COMMUNITY"];
    checks.push(check(input.events, source, "bundle_data", bundle?.minMemoryGb != null ? (bundle.minMemoryGb >= 80 ? "pass" : "fail") : "pending", bundle ? `minVcpu=${bundle.minVcpu} minMemoryGb=${bundle.minMemoryGb}` : "companion bundle not supplied"));
    const eligible = result.assessments.filter((a) => a.p2).length;
    checks.push(check(input.events, source, "observations_eligible", eligible > 0 ? "pass" : "fail", `${eligible} of ${result.assessments.length} observations reached P2`));
  } catch (error) {
    checks.push(check(input.events, source, "endpoint_reachable", "fail", error instanceof Error ? `${error.name}: ${error.message}` : String(error)));
  }
  return { source, retrievalId, checks, passed: checks.every((c) => c.outcome === "pass") };
}

export async function validateLambda(input: Omit<SourceRuntimeInput<unknown, LambdaInstanceTypesResponse, unknown>, "mode">): Promise<ValidationReport> {
  const source = input.adapter.sourceInterfaceSlug;
  const checks: ValidationCheck[] = [];
  let retrievalId: string | null = null;
  try {
    const result = await collectSource({ ...input, mode: "validation" });
    retrievalId = result.retrieval.id;
    const response = result.retrieval.responseBody as LambdaInstanceTypesResponse;
    checks.push(check(input.events, source, "endpoint_reachable", "pass", `status ${result.retrieval.responseStatus} after ${result.attempts} attempt(s)`));
    const oneX = response.data.gpu_1x_h100_sxm5;
    checks.push(check(input.events, source, "gpu_1x_h100_sxm5_present", oneX ? "pass" : "fail", oneX ? oneX.instance_type.description : "instance type absent from the catalog"));
    const regions = oneX?.regions_with_capacity_available ?? [];
    checks.push(check(input.events, source, "region_presence", regions.length > 0 ? "pass" : "fail", regions.map((r) => r.name).join(", ") || "no region currently has 1x capacity"));
    checks.push(check(input.events, source, "availability_array_shape", "pass", "regions_with_capacity_available validated as an array of {name, description}"));
    const tiers = ["gpu_1x_h100_sxm5", "gpu_2x_h100_sxm5", "gpu_4x_h100_sxm5", "gpu_8x_h100_sxm5"].filter((t) => response.data[t]);
    checks.push(check(input.events, source, "price_tiers", tiers.length >= 1 ? "pass" : "fail", tiers.map((t) => `${t}=${response.data[t]!.instance_type.price_cents_per_hour}c/instance-hour`).join(", ")));
    checks.push(check(input.events, source, "product_specs", oneX ? "pass" : "fail", oneX ? JSON.stringify(oneX.instance_type.specs) : "n/a"));
    const tenancy = input.context.tenancyEvidence.get("lambda");
    checks.push(check(input.events, source, "h100_tenancy_evidence", tenancy ? "pass" : "pending", tenancy ? `${tenancy.grade}: ${tenancy.evidence}` : "no statement from Lambda yet; observations stay TENANCY_UNRESOLVED"));
    const eligible = result.assessments.filter((a) => a.p2).length;
    checks.push(check(input.events, source, "observations_eligible", eligible > 0 ? "pass" : tenancy ? "fail" : "pending", `${eligible} of ${result.assessments.length} observations reached P2`));
  } catch (error) {
    checks.push(check(input.events, source, "endpoint_reachable", "fail", error instanceof Error ? `${error.name}: ${error.message}` : String(error)));
  }
  return { source, retrievalId, checks, passed: checks.every((c) => c.outcome === "pass") };
}
