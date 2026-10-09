import { afterEach, describe, expect, it, vi } from "vitest";

import { analyticsConfig } from "@/lib/analytics/config";

const KEY = ["phc", "fixtureprojectkey"].join("_");
const ON = { key: KEY, host: "https://us.i.posthog.com", nodeEnv: "production" };

afterEach(() => vi.restoreAllMocks());

describe("analyticsConfig", () => {
  it("is on for a production build with a project key and an https host", () => {
    expect(analyticsConfig(ON)).toEqual({ key: KEY, host: "https://us.i.posthog.com" });
  });

  it("trims whitespace and a trailing slash", () => {
    expect(analyticsConfig({ ...ON, key: ` ${KEY} `, host: "https://eu.i.posthog.com/" })).toEqual({ key: KEY, host: "https://eu.i.posthog.com" });
  });

  it("is off outside a production build, so next dev and tests send nothing", () => {
    expect(analyticsConfig({ ...ON, nodeEnv: "development" })).toBeNull();
    expect(analyticsConfig({ ...ON, nodeEnv: "test" })).toBeNull();
    expect(analyticsConfig({ ...ON, nodeEnv: undefined })).toBeNull();
  });

  it("is off, quietly, when either variable is missing", () => {
    expect(analyticsConfig({ ...ON, key: undefined })).toBeNull();
    expect(analyticsConfig({ ...ON, host: "" })).toBeNull();
  });

  it("refuses a personal API key, and never logs its value", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const personal = ["phx", "fixturepersonalkey"].join("_");
    expect(analyticsConfig({ ...ON, key: personal })).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).not.toContain(personal);
  });

  it("refuses a host that is not an https origin", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(analyticsConfig({ ...ON, host: "http://us.i.posthog.com" })).toBeNull();
    expect(analyticsConfig({ ...ON, host: "us.i.posthog.com" })).toBeNull();
  });

  it("reads the real environment as off under vitest", () => {
    expect(analyticsConfig()).toBeNull();
  });
});
