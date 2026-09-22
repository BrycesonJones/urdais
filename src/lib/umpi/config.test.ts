import { describe, expect, it } from "vitest";

import {
  UMPI_DATA_GO_KR_SERVICE_KEY_ENV,
  UMPI_ECOS_API_KEY_ENV,
  credentialPresence,
  requireCredential,
} from "./config";

describe("credential configuration", () => {
  it("reports presence without exposing a value", () => {
    const presence = credentialPresence({ [UMPI_ECOS_API_KEY_ENV]: "abc" } as unknown as NodeJS.ProcessEnv);
    expect(presence[UMPI_ECOS_API_KEY_ENV]).toBe(true);
    expect(presence[UMPI_DATA_GO_KR_SERVICE_KEY_ENV]).toBe(false);
    expect(Object.values(presence).every((v) => typeof v === "boolean")).toBe(true);
  });

  it("treats whitespace as absent, so a blank key is not sent as one", () => {
    expect(credentialPresence({ [UMPI_ECOS_API_KEY_ENV]: "   " } as unknown as NodeJS.ProcessEnv)[UMPI_ECOS_API_KEY_ENV]).toBe(false);
  });

  it("fails by name when a key is missing rather than requesting with undefined", () => {
    expect(() => requireCredential(UMPI_ECOS_API_KEY_ENV, {} as unknown as NodeJS.ProcessEnv)).toThrow(/UMPI_ECOS_API_KEY/);
  });

  it("unit tests need no credential: the repository environment has none configured", () => {
    // Guards against a key being committed or exported into the test environment.
    const presence = credentialPresence(process.env);
    expect(presence[UMPI_ECOS_API_KEY_ENV]).toBe(false);
    expect(presence[UMPI_DATA_GO_KR_SERVICE_KEY_ENV]).toBe(false);
  });
});
