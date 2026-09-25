import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  PLAUSIBILITY_GUARD_USD_PER_MWH, RELEASED_VALUE_DECIMAL_PLACES,
  SPECIFICATION_DIGEST, SPECIFICATION_DOCUMENT_PATH, SPECIFICATION_SLUG, SPECIFICATION_VERSION,
  SpecificationRegistrationError, UEPI_UNIT, assertSpecificationApproved,
} from "@/lib/uepi/methodology";

const MIGRATION = "supabase/migrations/20261021100000_uepi_foundation.sql";

/** A stand-in registry. The guard issues one query and only ever reads it. */
function registry(row: Record<string, unknown> | undefined): {
  query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  texts: string[];
} {
  const texts: string[] = [];
  return {
    texts,
    query: async (text: string) => { texts.push(text); return { rows: row === undefined ? [] : [row] }; },
  };
}

const approvedRow = {
  id: "9e000000-0000-4000-8000-0000000000aa",
  version: SPECIFICATION_VERSION,
  status: "approved",
  content_hash: SPECIFICATION_DIGEST,
};

describe("1. the digest binds the code to the bytes that were approved", () => {
  it("matches the SHA-256 of the frozen specification on disk", async () => {
    const bytes = await readFile(SPECIFICATION_DOCUMENT_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SPECIFICATION_DIGEST);
  });

  it("is the same digest the migration registers", async () => {
    expect(await readFile(MIGRATION, "utf8")).toContain(SPECIFICATION_DIGEST);
  });

  it("is a real SHA-256 and not a placeholder", () => {
    expect(SPECIFICATION_DIGEST).toMatch(/^[0-9a-f]{64}$/);
    expect(SPECIFICATION_DIGEST).not.toMatch(/^0+$/);
  });

  it("names the frozen specification, at the version the migration approves", async () => {
    expect(SPECIFICATION_SLUG).toBe("uepi");
    expect(SPECIFICATION_VERSION).toBe("1.0.0");
    const migration = await readFile(MIGRATION, "utf8");
    expect(migration).toContain("'uepi'");
    expect(migration).toContain("'1.0.0', 'approved'");
  });
});

describe("2. the specification says what it says", () => {
  it("is frozen and approved in its own header, not merely in a commit message", async () => {
    const document = await readFile(SPECIFICATION_DOCUMENT_PATH, "utf8");
    expect(document).toContain("**Specification version** | **1.0.0**");
    expect(document).toContain("**Approved — frozen**");
    expect(document).toContain("Supersession policy");
  });
});

describe("3. the guard reads the registry and nothing else", () => {
  it("returns the version id when the registry says approved and the digest agrees", async () => {
    const sql = registry(approvedRow);
    await expect(assertSpecificationApproved(sql)).resolves.toEqual({
      methodologyVersionId: approvedRow.id,
    });
    expect(sql.texts).toHaveLength(1);
    expect(sql.texts[0]).toContain("reference.methodology_versions");
  });

  it("refuses when the version is not registered at all", async () => {
    await expect(assertSpecificationApproved(registry(undefined)))
      .rejects.toThrow(SpecificationRegistrationError);
  });

  it("refuses a draft, which is what a specification is before it is approved", async () => {
    await expect(assertSpecificationApproved(registry({ ...approvedRow, status: "draft" })))
      .rejects.toThrow(/it is draft, not approved/);
  });

  it("refuses when the registered digest is not the one this code was written against", async () => {
    await expect(assertSpecificationApproved(registry({ ...approvedRow, content_hash: "b".repeat(64) })))
      .rejects.toThrow(/is not the/);
  });

  it("never touches the filesystem, because docs/ is absent from a serverless bundle", async () => {
    const code = await readFile("src/lib/uepi/methodology.ts", "utf8");
    expect(code).not.toMatch(/readFile|readFileSync|node:fs|existsSync/);
  });
});

describe("4. the constants the rest of the product depends on", () => {
  it("publishes dollars per megawatt-hour, never an index level", () => {
    expect(UEPI_UNIT).toBe("$/MWh");
  });

  it("stores six decimal places, one more than the widest source price observed", () => {
    expect(RELEASED_VALUE_DECIMAL_PLACES).toBe(6);
  });

  it("guards against a parse error without claiming anything about offer caps", () => {
    expect(PLAUSIBILITY_GUARD_USD_PER_MWH).toBe(25_000);
  });
});
