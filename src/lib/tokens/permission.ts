/**
 * Token-pricing rights gate. Reuses the UCPI production-permission predicate
 * rather than a parallel system. Wave-1 interfaces stay research_usable /
 * under_review; this module never writes those columns.
 */

import {
  assertProductionCollectionPermitted,
  productionCollectionPermitted,
  type SourceRegistryState,
} from "@/lib/ucpi/permission-gate";
import { TokenPermissionError, type TokenIngestMode } from "@/lib/tokens/types";

export function assertTokenIngestPermitted(mode: TokenIngestMode, registry: SourceRegistryState): void {
  if (mode === "research") {
    if (registry.productionAccessState === "production_blocked") {
      throw new TokenPermissionError(`${registry.slug}: production_blocked; research retrieval refused`);
    }
    return;
  }
  const gate = productionCollectionPermitted(registry);
  if (!gate.permitted) {
    throw new TokenPermissionError(gate.detail);
  }
  assertProductionCollectionPermitted(registry);
}

export function tokenProductionCollectionPermitted(registry: SourceRegistryState): boolean {
  return productionCollectionPermitted(registry).permitted;
}
