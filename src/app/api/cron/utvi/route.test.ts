import { describe, expect, it } from "vitest";

import { cronRequestAuthorized } from "@/app/api/cron/utvi/route";

/**
 * The cron trigger is the only thing that publishes UTVI, so an open one would let a stranger
 * decide when Urdais publishes an index. These are the refusals, not the happy path.
 */
describe("the UTVI cron trigger", () => {
  const SECRET = "a-long-enough-shared-secret";

  it("accepts the project's own bearer secret", () => {
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("fails closed when no secret is configured, rather than accepting anything", () => {
    // An unconfigured deployment refuses to run. The alternative is an endpoint anyone can
    // fire, which is worse than a job that does not run.
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, "")).toBe(false);
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, "   ")).toBe(false);
  });

  it("rejects a missing, malformed or wrong credential", () => {
    expect(cronRequestAuthorized(null, SECRET)).toBe(false);
    expect(cronRequestAuthorized(SECRET, SECRET)).toBe(false);
    expect(cronRequestAuthorized(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(cronRequestAuthorized("Bearer wrong-secret-same-len", SECRET)).toBe(false);
  });

  it("rejects a secret of a different length without throwing", () => {
    // timingSafeEqual throws on a length mismatch, and a thrown comparison would itself leak
    // the secret's length through a 500 rather than a 401.
    expect(() => cronRequestAuthorized("Bearer short", SECRET)).not.toThrow();
    expect(cronRequestAuthorized("Bearer short", SECRET)).toBe(false);
  });

  it("rejects an empty bearer value", () => {
    expect(cronRequestAuthorized("Bearer ", SECRET)).toBe(false);
  });
});
