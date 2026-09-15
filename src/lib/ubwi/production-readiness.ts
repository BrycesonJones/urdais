/**
 * UBWI production readiness.
 *
 * Fails closed, and distinguishes why. The operator response to "the research is not
 * there" is nothing like the response to "the rights are blocked" or "the API key has
 * not been issued", so these are separate codes rather than one generic error. In
 * particular a publication-gate refusal is not an outage: it is the gate working.
 */
import { calculateUbwi } from "./calculate";
import { evaluateGate, PRODUCTION_V1_THRESHOLDS, type GateThresholds } from "./gate";
import { PRODUCTION_BTC_OBSERVATION, numeratorSourceInterfaces } from "./numerator";
import { OBSERVED_ECONOMIES } from "./observations";
import {
  SOURCE_INTERFACES,
  effectiveRightsStatus,
  mayPublishNumeratorFrom,
  termsArtifactIsStale,
} from "./rights";
import type { UbwiCalculation } from "./types";

export type ReadinessFailureKind =
  /** The research input a production value needs does not exist yet. */
  | "RESEARCH_UNAVAILABLE"
  /** A source's terms forbid what Urdais needs, or have never been reviewed. */
  | "RIGHTS_BLOCKED"
  /** A component's reference date is outside the vintage policy. */
  | "STALE_OBSERVATION"
  /** A collection path exists in principle but cannot run unattended today. */
  | "AUTOMATION_UNAVAILABLE"
  /** The calculation is sound and the gate refused it. */
  | "PUBLICATION_GATE_FAILURE"
  /** The database does not carry the objects this slice needs. */
  | "SCHEMA_MISSING"
  /** The repository has migrations the database has not applied. */
  | "SCHEMA_OUTDATED"
  /** A published point exists but is not frozen against mutation. */
  | "PUBLICATION_NOT_FROZEN"
  /** No database is reachable from this process. */
  | "DATABASE_UNREACHABLE";

export type ReadinessFinding = {
  kind: ReadinessFailureKind;
  code: string;
  detail: string;
  remedy: string;
  /** False where the finding is informational and does not by itself refuse a deployment. */
  blocking: boolean;
};

export type ReadinessReport = {
  ready: boolean;
  calculation: UbwiCalculation | null;
  gatePassed: boolean;
  appliedMigrations: number;
  pendingMigrations: readonly string[];
  findings: readonly ReadinessFinding[];
  /** Observations that do not block a deployment. */
  notes: readonly string[];
};

export type ReadinessSqlExecutor = {
  query(
    text: string,
    params: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};

export type ReadinessInput = {
  /** Null where no database is reachable; the check still reports everything it can. */
  sql: ReadinessSqlExecutor | null;
  migrationFiles: readonly string[];
  thresholds?: GateThresholds;
  calculatedAt: string;
};

/** Objects UBWI Production V1 needs before anything may be written. */
const REQUIRED_TABLES = [
  "pipeline.wealth_vintages",
  "pipeline.wealth_vintage_components",
  "pipeline.btc_market_observations",
  "pipeline.btc_venue_quotes",
  "pipeline.ubwi_calculations",
  "pipeline.ubwi_publications",
] as const;

export function expectedMigrationVersions(filenames: readonly string[]): string[] {
  return filenames
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.split("_")[0]!)
    .sort();
}

export async function checkUbwiProductionReadiness(
  input: ReadinessInput,
): Promise<ReadinessReport> {
  const findings: ReadinessFinding[] = [];
  const notes: string[] = [];
  const thresholds = input.thresholds ?? PRODUCTION_V1_THRESHOLDS;

  const calculation = calculateUbwi({ calculatedAt: input.calculatedAt });

  // ---------------------------------------------------------------- research + rights
  if (OBSERVED_ECONOMIES.length === 0) {
    findings.push({
      kind: "RESEARCH_UNAVAILABLE",
      code: "NO_OBSERVED_SET",
      detail: "the observed economy set is empty; there is no denominator to build",
      remedy: "land the denominator research before running a production calculation",
      blocking: true,
    });
  }

  // What the *current* methodology actually reads. A registered interface that supplies
  // nothing is a different fact from one that supplies a published value and may not, and
  // conflating them was accurate only while the venue median was the price rule. Under
  // methodology 1.1.0 the three exchange venues supply nothing: they are retired, their
  // retained terms artifacts are kept as the evidence for that retirement, and reporting
  // them as blockers would send an operator to solve a problem that no longer exists.
  const liveNumeratorSlugs = new Set(numeratorSourceInterfaces(PRODUCTION_BTC_OBSERVATION));

  for (const iface of SOURCE_INTERFACES) {
    const status = effectiveRightsStatus(iface);
    const suppliesDenominator = OBSERVED_ECONOMIES.some(
      (e) => e.sourceInterface === iface.slug || e.fx.sourceInterface === iface.slug,
    );
    const suppliesNumerator = liveNumeratorSlugs.has(iface.slug);
    const used = suppliesDenominator || suppliesNumerator;

    if (suppliesDenominator && status !== "cleared") {
      findings.push({
        kind: "RIGHTS_BLOCKED",
        code: "DENOMINATOR_SOURCE_NOT_CLEARED",
        detail: `${iface.slug} is ${status} but supplies a denominator component`,
        remedy: "retrieve and review the terms, retain the artifact, or drop the component",
        blocking: true,
      });
    }
    // A live numerator source. `cleared` and `inferred_permitted` both satisfy the gate
    // here; anything else stops a deployment, and this is the finding that currently does.
    if (suppliesNumerator && !mayPublishNumeratorFrom(status)) {
      findings.push({
        kind: "RIGHTS_BLOCKED",
        code: "NUMERATOR_SOURCE_NOT_CLEARED",
        detail:
          `${iface.slug} is ${status} for the use a published numerator makes` +
          (iface.termsArtifact === null
            ? " (no retained terms artifact)"
            : `, against ${iface.termsArtifact.url} retained ${iface.termsArtifact.retrievedAt}`),
        remedy:
          iface.note ??
          "obtain the permission the retained terms require, or do not publish from this interface",
        blocking: true,
      });
    }
    if (suppliesNumerator && status === "inferred_permitted") {
      // Not an outstanding action -- an explicit product decision closed it -- but never
      // silent either. Reported every run with what the decision does not cover, because
      // an inference that stops being visible is how it quietly becomes treated as a grant.
      const decision = iface.inferredPermission!;
      findings.push({
        kind: "RIGHTS_BLOCKED",
        code: "NUMERATOR_SOURCE_INFERRED_PERMITTED",
        detail:
          `${iface.slug} publishes under inferred permission (${decision.decisionId}, decided ` +
          `${decision.decidedOn}), not an express grant. Not covered: ${decision.limits.join(" ")}`,
        remedy:
          "this is a recorded product decision, not an outstanding action; retrieving the provider's terms text supersedes it either way",
        blocking: false,
      });
    }

    if (!used && status !== "cleared") {
      // The numerator venues sit here. Reported separately from a denominator rights
      // failure because the operator response differs, and reported with the reason the
      // artifact actually gives rather than as a generic "not reviewed": Phase 2D
      // retrieved all four, and "we never looked" and "we looked and it says no" are
      // different facts that would take different actions to resolve.
      const reviewed = iface.termsArtifact !== null;
      // Categorised by what the interface is, not by whether the observed set happens to
      // reference it. A statistical compiler Urdais cannot yet publish from is a
      // denominator-coverage finding even while it supplies nothing -- which is exactly
      // Stats NZ's position.
      if (iface.providerKind === "statistical_compiler") {
        findings.push({
          kind: "RIGHTS_BLOCKED",
          code: "DENOMINATOR_CANDIDATE_NOT_CLEARED",
          detail: `${iface.slug} is ${status} and therefore supplies no denominator component`,
          remedy: iface.note ?? "retrieve, review and retain the interface's terms",
          // It costs coverage rather than corrupting a published value, and the gate
          // already refuses on the coverage it costs.
          blocking: false,
        });
        continue;
      }
      // A numerator interface the current price rule does not read. Its rights state is
      // retained because it is the evidence for why the rule changed, and it is reported so
      // the finding stays visible -- but it blocks nothing, because it supplies nothing.
      findings.push({
        kind: "RIGHTS_BLOCKED",
        code: "RETIRED_NUMERATOR_SOURCE_NOT_CLEARED",
        detail:
          `${iface.slug} is ${status} for the use a published numerator makes, and is not read by ` +
          `methodology ${calculation.methodologyVersion}` +
          (reviewed
            ? `, against ${iface.termsArtifact!.url} retained ${iface.termsArtifact!.retrievedAt}`
            : " (no retained terms artifact)"),
        remedy:
          "retired under an approved methodology amendment; the evidence is retained rather than " +
          "deleted, and reinstating this interface would require clearing its terms first",
        blocking: false,
      });
    }
    if (status === "cleared" && termsArtifactIsStale(iface, new Date(input.calculatedAt))) {
      notes.push(
        `${iface.slug}: terms artifact has aged past the recheck horizon; this raises a review flag, not a demotion`,
      );
    }
    if (!iface.automatedRetrievalAvailable) {
      findings.push({
        kind: "AUTOMATION_UNAVAILABLE",
        code: "COLLECTOR_NOT_AUTOMATED",
        detail: `${iface.slug} has no usable automated retrieval path today`,
        remedy: iface.note ?? "complete the operational registration for this interface",
        // An automation gap does not block publication of a manually verified value.
        blocking: false,
      });
    }
  }

  // ---------------------------------------------------------------- the calculation
  const gate = evaluateGate(calculation, thresholds);

  for (const finding of gate.findings) {
    const stale = finding.code === "VINTAGE_RULE_VIOLATED";
    findings.push({
      kind: stale ? "STALE_OBSERVATION" : "PUBLICATION_GATE_FAILURE",
      code: finding.code,
      detail: finding.detail,
      remedy: finding.remedy,
      blocking: true,
    });
  }

  // ---------------------------------------------------------------- schema
  let appliedMigrations = 0;
  const pendingMigrations: string[] = [];

  if (input.sql === null) {
    findings.push({
      kind: "DATABASE_UNREACHABLE",
      code: "NO_DATABASE_URL",
      detail: "no database url is configured for this process",
      remedy:
        "set DATABASE_URL (or URDAIS_DATABASE_URL), or pass --local to target the development database",
      blocking: true,
    });
  } else {
    const missing: string[] = [];
    for (const qualified of REQUIRED_TABLES) {
      const [schema, table] = qualified.split(".") as [string, string];
      const { rows } = await input.sql.query(
        "select to_regclass($1) is not null as present",
        [`${schema}.${table}`],
      );
      if (rows[0]?.present !== true) missing.push(qualified);
    }
    if (missing.length > 0) {
      findings.push({
        kind: "SCHEMA_MISSING",
        code: "REQUIRED_TABLE_MISSING",
        detail: `missing ${missing.length} required object(s): ${missing.join(", ")}`,
        remedy: "apply the outstanding migrations to this database before publishing",
        blocking: true,
      });
    }

    try {
      const { rows } = await input.sql.query(
        "select version from supabase_migrations.schema_migrations",
        [],
      );
      const applied = new Set(rows.map((row) => String(row.version)));
      appliedMigrations = applied.size;
      for (const version of expectedMigrationVersions(input.migrationFiles)) {
        if (!applied.has(version)) pendingMigrations.push(version);
      }
      if (pendingMigrations.length > 0) {
        findings.push({
          kind: "SCHEMA_OUTDATED",
          code: "MIGRATIONS_PENDING",
          detail: `${pendingMigrations.length} migration(s) not applied: ${pendingMigrations.join(", ")}`,
          remedy: "apply the outstanding migrations before publishing",
          blocking: true,
        });
      }
    } catch {
      // A locally replayed database carries no ledger. Not a failure by itself.
      notes.push("no migration ledger on this database; version comparison skipped");
    }

    if (missing.length === 0) {
      const { rows } = await input.sql.query(
        "select count(*)::int as n from pipeline.ubwi_publications",
        [],
      );
      const published = Number(rows[0]?.n ?? 0);
      if (published > 0) {
        const frozen = await input.sql.query(
          "select count(*)::int as n from pipeline.ubwi_publications where frozen_at is not null",
          [],
        );
        if (Number(frozen.rows[0]?.n ?? 0) !== published) {
          findings.push({
            kind: "PUBLICATION_NOT_FROZEN",
            code: "PUBLISHED_POINT_NOT_FROZEN",
            detail: `${published} published point(s), of which ${frozen.rows[0]?.n ?? 0} are frozen`,
            remedy: "a published point is immutable; correct by supersession, never by mutation",
            blocking: true,
          });
        }
      } else {
        notes.push("no UBWI point is published; history begins at the first verified observation");
      }
    }
  }

  return {
    ready: findings.every((f) => !f.blocking),
    calculation,
    gatePassed: gate.passed,
    appliedMigrations,
    pendingMigrations,
    findings,
    notes,
  };
}
