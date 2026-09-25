import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * The private, caller-owned client must handle its own connection errors.
 *
 * `pg` emits a connection failure on the client rather than on the query in flight, and treats an
 * unhandled one as an uncaught exception — which ends the process. The pooled path in this module
 * has always guarded against that and says so in a comment; the single-client path did not, and a
 * pooler culling an idle session during a long source fetch killed nine batches of a UEPI
 * production backfill, each after the data had already been retrieved.
 *
 * Asserted against the source because the behaviour needs a real socket to exercise and the thing
 * that must not regress is structural: a listener, attached before the connection is opened.
 */
const MODULE = "src/lib/tokens/read/database.ts";

describe("the caller-owned client survives its connection dropping", () => {
  it("registers an error listener on the private client", async () => {
    const source = await readFile(MODULE, "utf8");
    const factory = source.slice(source.indexOf("export async function createTokenSqlExecutor"));
    expect(factory).toMatch(/client\.on\(\s*"error"/);
  });

  it("attaches the listener before connecting, so an immediate failure is caught too", async () => {
    const source = await readFile(MODULE, "utf8");
    const factory = source.slice(source.indexOf("export async function createTokenSqlExecutor"));
    expect(factory.indexOf('client.on("error"')).toBeLessThan(factory.indexOf("await client.connect()"));
  });

  it("keeps the pool's own guard, which was never the missing half", async () => {
    const source = await readFile(MODULE, "utf8");
    expect(source).toMatch(/pool\.on\(\s*"error"/);
  });
});
