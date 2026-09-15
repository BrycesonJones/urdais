/**
 * Verify every UBWI source-rights record against the bytes it claims to rest on.
 *
 * The rights record in src/lib/ubwi/rights.ts carries, for each source, a terms URL, the
 * SHA-256 of the retained document, its byte length, and the decisive clause quoted from
 * it. This script is what makes those claims checkable: it reads the retained documents,
 * hashes them itself, and requires the quoted clause to actually occur in the document.
 *
 * The artifacts are not in the repository -- several are megabytes of third-party HTML
 * and one is 1.5 MB of OECD terms -- so the store lives outside it and the script is run
 * against it deliberately rather than on every build. The structural half of the
 * invariant, which needs no bytes, runs in the test suite on every commit.
 *
 * Usage:
 *   UBWI_TERMS_ARTIFACT_DIR=/path/to/store npm run ubwi:verify-terms
 *
 * The store is a flat directory of files named for the source slug, e.g.
 * `federal-reserve-z1`, `kraken-ticker`. A slug with no file is reported as unverifiable
 * rather than as a failure: "we did not check this today" and "this is wrong" are
 * different facts, and only one of them should stop a release.
 *
 * Exit codes:
 *   0  every artifact present in the store verified, and the structural checks passed
 *   1  a record disagrees with its bytes, or a structural check failed
 *   2  the store path was not given or does not exist
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SOURCE_INTERFACES } from "@/lib/ubwi/rights";
import {
  checkTermsArtifactShape,
  extractDocumentText,
  verifyAgainstRetainedBytes,
} from "@/lib/ubwi/terms-integrity";

function main(): void {
  const dir = process.env.UBWI_TERMS_ARTIFACT_DIR ?? "";
  const shape = checkTermsArtifactShape(SOURCE_INTERFACES);

  console.log("UBWI terms-artifact integrity\n");
  console.log("STRUCTURAL CHECKS (no artifacts needed)");
  if (shape.length === 0) {
    console.log(`  ${SOURCE_INTERFACES.length} source interface(s), no structural problems\n`);
  } else {
    for (const finding of shape) {
      console.log(`  [${finding.problem}] ${finding.slug}: ${finding.detail}`);
    }
    console.log("");
  }

  if (dir === "" || !existsSync(dir)) {
    console.log("BYTE-LEVEL VERIFICATION");
    console.log(
      dir === ""
        ? "  skipped: set UBWI_TERMS_ARTIFACT_DIR to the retained-artifact store"
        : `  skipped: ${dir} does not exist`,
    );
    console.log("\n  A skipped verification is not a passed one. Nothing below was checked.");
    process.exit(shape.length > 0 ? 1 : 2);
  }

  console.log(`BYTE-LEVEL VERIFICATION against ${dir}`);
  let verified = 0;
  let failed = 0;
  let absent = 0;

  for (const iface of SOURCE_INTERFACES) {
    if (iface.termsArtifact === null) {
      console.log(`  ${iface.slug.padEnd(34)} no artifact cited`);
      continue;
    }
    const path = join(dir, iface.slug);
    if (!existsSync(path) || !statSync(path).isFile()) {
      absent += 1;
      console.log(`  ${iface.slug.padEnd(34)} NOT IN STORE -- unverified, not verified`);
      continue;
    }
    const bytes = readFileSync(path);
    const result = verifyAgainstRetainedBytes(iface, {
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.byteLength,
      text: extractDocumentText(bytes.toString("utf8")),
    });
    if (result.verified) {
      verified += 1;
      console.log(`  ${iface.slug.padEnd(34)} ok  ${result.detail}`);
    } else {
      failed += 1;
      console.log(`  ${iface.slug.padEnd(34)} FAILED  ${result.detail}`);
      for (const segment of result.missingClauseSegments) {
        console.log(`  ${"".padEnd(34)}   not in the document: ${segment.slice(0, 96)}...`);
      }
    }
  }

  console.log(
    `\n  ${verified} verified, ${failed} failed, ${absent} not present in the store, ` +
      `${shape.length} structural problem(s)`,
  );
  if (failed > 0) {
    console.log("\n  A rights record that disagrees with its own bytes is not evidence.");
  }
  process.exit(failed > 0 || shape.length > 0 ? 1 : 0);
}

main();
