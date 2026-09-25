/**
 * Loading a committed fixture, with its identity checked.
 *
 * The digest check is the point: a fixture is evidence of what a market operator's file looked
 * like on a named day, and evidence that can be edited without anyone noticing is not evidence. If
 * a committed byte changes, every test that reads it fails immediately and says so, rather than
 * quietly re-baselining the parser against whatever the file now contains.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SOURCE_FIXTURES, type SourceFixture } from "@/lib/uepi/source/fixtures/manifest";
import type { RetrievedArtifact } from "@/lib/uepi/source/types";

const FIXTURE_DIRECTORY = "src/lib/uepi/source/fixtures";

export function fixtureByFile(file: string): SourceFixture {
  const fixture = SOURCE_FIXTURES.find((candidate) => candidate.file === file);
  if (fixture === undefined) throw new Error(`${file} is not a registered UEPI source fixture`);
  return fixture;
}

/** The fixture's bytes, refusing to return them if they are not the bytes the manifest recorded. */
export function readFixture(file: string): Buffer {
  const fixture = fixtureByFile(file);
  const body = readFileSync(join(process.cwd(), FIXTURE_DIRECTORY, file));
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== fixture.fixtureSha256) {
    throw new Error(
      `${file} hashes to ${digest} but the manifest records ${fixture.fixtureSha256}; a source `
      + "fixture may not be edited, because its whole purpose is to preserve what the operator sent");
  }
  return body;
}

/**
 * A fixture presented to an adapter as though it had just been retrieved.
 *
 * `retrievedAt` and `url` come from the manifest rather than from the clock, so a parser test is
 * deterministic and the artifact keeps its real provenance.
 */
export function fixtureArtifact(file: string, label: string): RetrievedArtifact {
  const fixture = fixtureByFile(file);
  const body = readFixture(file);
  return {
    label,
    url: fixture.url,
    retrievedAt: fixture.retrievedAt,
    status: 200,
    contentType: fixture.format.startsWith("ZIP") ? "application/zip" : "text/csv",
    byteLength: body.byteLength,
    sha256: fixture.fixtureSha256,
    body,
  };
}

/** The artifact map an adapter's `parse` expects, for a fixture that needs only one file. */
export function fixtureArtifacts(file: string, label: string): Map<string, RetrievedArtifact> {
  return new Map([[label, fixtureArtifact(file, label)]]);
}
