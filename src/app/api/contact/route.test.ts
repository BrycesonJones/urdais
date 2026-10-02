/**
 * The contact endpoint's contract: fixed response bodies, the provider stubbed, and nothing
 * secret or provider-specific ever reaching the client.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as route from "@/app/api/contact/route";

const ORIGINAL = { ...process.env };
const SECRET = "re_test_do_not_leak";

function post(body: unknown): Request {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let fetchStub: ReturnType<typeof vi.fn<typeof fetch>>;
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.RESEND_API_KEY = SECRET;
  process.env.CONTACT_TO_EMAIL = "inbox@urdais.test";
  process.env.CONTACT_FROM_EMAIL = "contact@urdais.test";
  fetchStub = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchStub);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/contact", () => {
  it("exports POST only, so every other method is a 405", () => {
    expect(typeof route.POST).toBe("function");
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) expect(route).not.toHaveProperty(method);
  });

  it("delivers a valid submission to the configured recipient with the reader as Reply-To", async () => {
    const response = await route.POST(post({ email: " reader@example.com ", message: "Hello there." }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchStub.mock.calls[0]![1]?.body));
    expect(body.to).toEqual(["inbox@urdais.test"]);
    expect(body.reply_to).toBe("reader@example.com");
    expect(body.from).toBe("contact@urdais.test");
  });

  it.each([
    ["not JSON", "{not json"],
    ["an array", [1, 2]],
    ["null", null],
    ["a missing email", { message: "Hi" }],
    ["an invalid email", { email: "nope", message: "Hi" }],
    ["a whitespace-only message", { email: "reader@example.com", message: "  \n " }],
    ["an over-long message", { email: "reader@example.com", message: "x".repeat(5001) }],
    ["an oversized body", { email: "reader@example.com", message: "Hi", padding: "x".repeat(40_000) }],
  ])("rejects %s with invalid_input and sends nothing", async (_label, body) => {
    const response = await route.POST(post(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_input" });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("maps a provider rejection to delivery_failed without exposing its details", async () => {
    fetchStub.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "validation_error", message: "The urdais.test domain is not verified" }), {
        status: 403,
      }),
    );
    const response = await route.POST(post({ email: "reader@example.com", message: "Hi" }));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "delivery_failed" });
    expect(text).not.toMatch(/verified|validation_error|403/);
  });

  it("maps a network failure to delivery_failed", async () => {
    fetchStub.mockRejectedValueOnce(new Error(`connect failed with key ${SECRET}`));
    const response = await route.POST(post({ email: "reader@example.com", message: "Hi" }));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe(JSON.stringify({ ok: false, error: "delivery_failed" }));
  });

  it("fails safely when unconfigured, logging names but never values", async () => {
    delete process.env.RESEND_API_KEY;
    const response = await route.POST(post({ email: "reader@example.com", message: "Private words" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "delivery_failed" });
    expect(fetchStub).not.toHaveBeenCalled();
    const logged = errorLog.mock.calls.flat().join(" ");
    expect(logged).toContain("RESEND_API_KEY");
    expect(logged).not.toContain("inbox@urdais.test");
  });

  it("never puts the key, the recipient, the reader or the message in a response or a log line", async () => {
    fetchStub.mockResolvedValueOnce(new Response(`bad key ${SECRET}`, { status: 401 }));
    const response = await route.POST(post({ email: "reader@example.com", message: "Private words" }));
    const text = await response.text();
    const logged = errorLog.mock.calls.flat().join(" ");
    for (const sensitive of [SECRET, "inbox@urdais.test", "reader@example.com", "Private words"]) {
      expect(text).not.toContain(sensitive);
      expect(logged).not.toContain(sensitive);
    }
  });
});
