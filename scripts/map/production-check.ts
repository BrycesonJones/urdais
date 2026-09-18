/**
 * Map production readiness. Read-only.
 *
 * Run before a production import to see what is there, and after one to prove
 * the import did what the plan said. It writes nothing, ever.
 *
 * Three things are compared, and the point of comparing all three is that each
 * pair can disagree for a different reason:
 *
 *   **dataset → database.** The file says 187 facilities and 136 of them are
 *   map-safe; the database should hold exactly that. A gap means the import did
 *   not finish, or something else wrote to the table.
 *
 *   **database → API.** The deployed application reads the same rows this
 *   script does. If the API serves a different number, the deployment is
 *   pointed at a different database or is serving a stale build — which is
 *   invisible from the database side and looks, on the map, like a successful
 *   import.
 *
 *   **API → map page.** The page is what a reader actually opens. A 200 from
 *   the API with a 500 from the page is a rendering failure that no database
 *   check would notice.
 *
 * Counting rule, because it is easy to get wrong: a public dot is *not* the
 * same as a `published` row. Since methodology 2.0.0 the map serves both
 * `published` and `research` records, provided each is map-eligible, evidenced
 * by an admissible source, not cancelled or retired, and inside the staleness
 * horizon. `coverage.served` is the number of dots; `coverage.published` is the
 * number of candidates that got that far. Asserting the wrong one is the
 * mistake this comment exists to prevent.
 *
 * `--baseline` is for the run *before* an import, where almost everything
 * legitimately disagrees: the database is empty or stale, so the API serves
 * nothing and the page says so. In that mode the comparisons are printed and
 * enforce nothing, and only two things still fail — a dataset that does not
 * plan cleanly, and a dataset whose digest is not the one the operator meant to
 * write. Those two are the reasons to stop before touching production.
 *
 * Usage:
 *   npm run map:production:check
 *   npm run map:production:check -- --expected-public 136
 *   npm run map:production:check -- --idempotence rewrite.json
 *   npm run map:production:check -- --expected-digest 938c7d2c...
 *   npm run map:production:check -- --baseline        report, enforce only the dataset
 *   npm run map:production:check -- --site https://urdais.com --dataset data/map/facilities.v1.json
 *   npm run map:production:check -- --skip-site       database only
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseFacilityImportDocument } from "@/lib/facilities/contract";
import { buildImportPlan } from "@/lib/facilities/import/plan";
import { loadFacilityReadModel } from "@/lib/facilities/read/load";
import { validatePublicFacilities, type FacilityMapReadModel } from "@/lib/facilities/read/read-model";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";

const DEFAULT_SITE = "https://urdais.com";
const DEFAULT_DATASET = "data/map/facilities.v1.json";

function option(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? null : value;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** A failed assertion, collected rather than thrown, so one run reports everything wrong. */
type Failure = { check: string; detail: string };

/**
 * The importer's report from a second `--write` over an unchanged dataset. The
 * property being proved is that re-running the import is a no-op: every record
 * unchanged, nothing inserted, nothing updated, and the same batch digest. An
 * importer that re-inserted or re-stamped on every run would still look correct
 * on the map while churning history underneath it.
 */
function checkIdempotence(path: string, failures: Failure[]): Record<string, unknown> {
  const report = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as {
    digest?: string;
    result?: { inserted?: string[]; updated?: string[]; unchanged?: string[]; restamped?: unknown[] };
  };
  const result = report.result;
  if (!result) {
    failures.push({ check: "idempotence", detail: `${path} carries no write result; the re-run did not write` });
    return { digest: report.digest ?? null };
  }
  const inserted = result.inserted?.length ?? 0;
  const updated = result.updated?.length ?? 0;
  const unchanged = result.unchanged?.length ?? 0;
  const restamped = result.restamped?.length ?? 0;

  if (inserted !== 0) failures.push({ check: "idempotence", detail: `a second identical import inserted ${inserted} record(s)` });
  if (updated !== 0) failures.push({ check: "idempotence", detail: `a second identical import updated ${updated} record(s)` });
  if (unchanged === 0) failures.push({ check: "idempotence", detail: "a second identical import reported nothing unchanged" });
  if (restamped !== 0) {
    failures.push({ check: "idempotence", detail: `a second identical import re-approved ${restamped} record(s) under a different methodology version` });
  }
  return { digest: report.digest ?? null, inserted, updated, unchanged, restamped };
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function main(): Promise<void> {
  const failures: Failure[] = [];
  const site = (option("site") ?? process.env.URDAIS_SITE_URL ?? DEFAULT_SITE).replace(/\/+$/, "");
  const datasetPath = option("dataset") ?? DEFAULT_DATASET;
  const expectedPublic = option("expected-public");
  const idempotenceReport = option("idempotence");
  const expectedDigest = option("expected-digest");
  const skipSite = flag("skip-site");
  const baseline = flag("baseline");

  // ---- what the dataset intends --------------------------------------------
  const { document, issues } = parseFacilityImportDocument(
    JSON.parse(readFileSync(resolve(process.cwd(), datasetPath), "utf8")),
  );
  if (!document) {
    console.error(JSON.stringify({ stage: "dataset", dataset: datasetPath, issues }, null, 2));
    process.exitCode = 1;
    return;
  }
  const plan = buildImportPlan(document);
  if (plan.errors.length > 0) {
    failures.push({ check: "dataset", detail: `the dataset plans with ${plan.errors.length} error(s)` });
  }
  // Pinning the digest is how a dispatch says *which* dataset it reviewed. The
  // workflow runs against a ref, and a ref can move between the review and the
  // run; the digest cannot.
  if (expectedDigest !== null && plan.digest !== expectedDigest) {
    failures.push({ check: "digest", detail: `expected dataset digest ${expectedDigest}, the file hashes to ${plan.digest}` });
  }

  // ---- what the database holds ---------------------------------------------
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: flag("local") });
  if (!url) {
    console.error("no database url is configured; set DATABASE_URL or pass --local.");
    process.exitCode = 1;
    return;
  }
  const sql = await tokenSqlExecutor(url);
  const { rows: totals } = await sql.query(
    `select count(*)::int as facilities,
            count(*) filter (where publication_state = 'published')::int as published,
            count(*) filter (where publication_state = 'research')::int as research,
            count(*) filter (where publication_state = 'review_required')::int as review_required
       from reference.facilities`,
    [],
  );
  const stored = (totals[0] ?? {}) as Record<string, number>;
  const model = await loadFacilityReadModel(sql);

  // The response has to pass the same contract the API applies before serving.
  const contractReasons = validatePublicFacilities(JSON.parse(JSON.stringify(model)) as unknown);
  for (const reason of contractReasons) failures.push({ check: "read model contract", detail: reason });

  if (Number(stored.facilities) !== plan.counts.facilities) {
    failures.push({
      check: "dataset → database",
      detail: `the dataset holds ${plan.counts.facilities} facilities and the database holds ${stored.facilities}`,
    });
  }

  // ---- what the deployed application serves --------------------------------
  let apiServed: number | null = null;
  let apiStatus: number | null = null;
  let mapStatus: number | null = null;
  if (!skipSite) {
    const api = await fetchJson(`${site}/api/map/facilities`);
    apiStatus = api.status;
    if (api.status !== 200) {
      failures.push({ check: "api", detail: `${site}/api/map/facilities answered ${api.status}` });
    } else {
      const served = api.body as Partial<FacilityMapReadModel> | null;
      apiServed = Array.isArray(served?.facilities) ? served.facilities.length : null;
      if (apiServed === null) {
        failures.push({ check: "api", detail: "the API response carries no facilities array" });
      } else if (apiServed !== model.facilities.length) {
        // The two read the same rows. A difference is a deployment pointed at
        // another database, or one that has not picked up the write.
        failures.push({
          check: "database → api",
          detail: `the database serves ${model.facilities.length} facilities and the deployed API serves ${apiServed}`,
        });
      }
      if (served?.unavailableReason) {
        failures.push({ check: "api", detail: `the API reports the map unavailable: ${String(served.unavailableReason)}` });
      }
    }

    const page = await fetch(`${site}/map`, { cache: "no-store" });
    mapStatus = page.status;
    if (page.status !== 200) failures.push({ check: "map page", detail: `${site}/map answered ${page.status}` });
  }

  // ---- the operator's explicit expectation ---------------------------------
  if (expectedPublic !== null) {
    const expected = Number(expectedPublic);
    if (!Number.isInteger(expected)) {
      failures.push({ check: "expectation", detail: `--expected-public ${expectedPublic} is not an integer` });
    } else {
      if (model.facilities.length !== expected) {
        failures.push({
          check: "expectation",
          detail: `expected ${expected} public facilities, the database serves ${model.facilities.length}`,
        });
      }
      if (apiServed !== null && apiServed !== expected) {
        failures.push({ check: "expectation", detail: `expected ${expected} public facilities, the API serves ${apiServed}` });
      }
    }
  }

  const idempotence = idempotenceReport ? checkIdempotence(idempotenceReport, failures) : null;

  console.log(
    JSON.stringify(
      {
        check: "map production readiness",
        site: skipSite ? null : site,
        dataset: { path: datasetPath, digest: plan.digest, facilities: plan.counts.facilities },
        database: {
          facilities: Number(stored.facilities ?? 0),
          byPublicationState: {
            published: Number(stored.published ?? 0),
            research: Number(stored.research ?? 0),
            review_required: Number(stored.review_required ?? 0),
          },
          // Candidates that reached the public query, and the dots it draws.
          publicationCandidates: model.coverage.published,
          mapVisible: model.facilities.length,
          byCategory: model.coverage.byCategory,
          countries: model.coverage.countries,
        },
        api: { status: apiStatus, mapVisible: apiServed },
        mapPage: { status: mapStatus },
        expectedPublic: expectedPublic === null ? null : Number(expectedPublic),
        expectedDigest,
        mode: baseline ? "baseline" : "enforcing",
        idempotence,
        failures,
        ok: failures.length === 0,
      },
      null,
      2,
    ),
  );

  // In baseline mode the state of production is information, not a verdict.
  // Only the dataset's own validity and identity still stop the run.
  const blocking = baseline ? failures.filter((failure) => failure.check === "dataset" || failure.check === "digest") : failures;
  if (blocking.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  // Never echo the connection string; `describeDatabaseError` is used by the
  // read paths for the same reason.
  console.error(`map production check failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  process.exitCode = 1;
});
