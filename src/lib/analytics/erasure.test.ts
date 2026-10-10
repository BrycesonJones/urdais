import { describe, expect, it, vi } from "vitest";

import { apiHostForIngestionHost, erasePostHogPerson, erasureConfig, erasureRequest } from "@/lib/analytics/erasure";

const ACCOUNT = "0f8e1c3a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const KEY = ["phx", "fixturepersonalkey"].join("_");
const CONFIG = { apiHost: "https://eu.posthog.com", projectId: "12345", personalApiKey: KEY };

describe("configuration", () => {
  it("maps ingestion hosts to the private API hosts", () => {
    expect(apiHostForIngestionHost("https://eu.i.posthog.com")).toBe("https://eu.posthog.com");
    expect(apiHostForIngestionHost("https://us.i.posthog.com")).toBe("https://us.posthog.com");
    expect(apiHostForIngestionHost("https://posthog.example.com")).toBeNull();
  });

  it("reports missing settings by name only, never by value", () => {
    const result = erasureConfig({ POSTHOG_PERSONAL_API_KEY: "phc_wrongkind", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" });
    expect(result).toEqual({ missing: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"] });
    expect(JSON.stringify(result)).not.toContain("phc_wrongkind");
  });

  it("accepts a complete configuration", () => {
    expect(erasureConfig({ POSTHOG_PERSONAL_API_KEY: KEY, POSTHOG_PROJECT_ID: "12345", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com" })).toEqual(CONFIG);
  });
});

describe("erasePostHogPerson", () => {
  it("asks PostHog to delete the person by the account id and queue its events", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ persons_found: 1 }), { status: 202 }));
    expect(await erasePostHogPerson(ACCOUNT, CONFIG, fetchImpl as unknown as typeof fetch)).toEqual({ kind: "queued", personsFound: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://eu.posthog.com/api/projects/12345/persons/bulk_delete/");
    expect(JSON.parse(String(init.body))).toEqual({ distinct_ids: [ACCOUNT], delete_events: true });
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });

  it("refuses anything that is not an account id, without calling PostHog", async () => {
    const fetchImpl = vi.fn();
    for (const id of ["reader@example.com", "", "$posthog_cookieless", `${ACCOUNT},other`]) {
      expect(await erasePostHogPerson(id, CONFIG, fetchImpl as unknown as typeof fetch)).toEqual({ kind: "failed", status: null });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a refusal or an outage as failed, and never throws", async () => {
    const refused = vi.fn(async () => new Response("{}", { status: 403 }));
    expect(await erasePostHogPerson(ACCOUNT, CONFIG, refused as unknown as typeof fetch)).toEqual({ kind: "failed", status: 403 });
    const down = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await erasePostHogPerson(ACCOUNT, CONFIG, down as unknown as typeof fetch)).toEqual({ kind: "failed", status: null });
  });

  it("builds the same request a dry run prints", () => {
    expect(erasureRequest(CONFIG, ACCOUNT).body).toEqual({ distinct_ids: [ACCOUNT], delete_events: true });
  });
});
