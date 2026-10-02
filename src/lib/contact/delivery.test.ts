import { describe, expect, it, vi } from "vitest";

import { buildContactEmail, deliverContactMessage } from "@/lib/contact/delivery";

const ENV = {
  RESEND_API_KEY: "re_test_secret",
  CONTACT_TO_EMAIL: "inbox@urdais.test",
  CONTACT_FROM_EMAIL: "Urdais Contact <contact@urdais.test>",
};
const INPUT = { email: "reader@example.com", message: "<b>Hi</b>\nSecond line." };

function stubFetch(response: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

describe("buildContactEmail", () => {
  it("identifies the contact form and carries the message verbatim", () => {
    const { subject, text } = buildContactEmail(INPUT);
    expect(subject).toBe("Urdais Contact — reader@example.com");
    expect(text).toBe(
      "New message from the Urdais contact form\n\nFrom:\nreader@example.com\n\nMessage:\n<b>Hi</b>\nSecond line.\n",
    );
  });
});

describe("deliverContactMessage", () => {
  it("sends plain text to the configured recipient, from the configured sender, replying to the reader", async () => {
    const fetchStub = stubFetch(new Response(JSON.stringify({ id: "x" }), { status: 200 }));
    expect(await deliverContactMessage(INPUT, { env: ENV, fetch: fetchStub })).toEqual({ ok: true });

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test_secret");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      from: ENV.CONTACT_FROM_EMAIL,
      to: [ENV.CONTACT_TO_EMAIL],
      reply_to: INPUT.email,
      subject: "Urdais Contact — reader@example.com",
      text: buildContactEmail(INPUT).text,
    });
    // Never HTML, and never sent as the reader.
    expect(body).not.toHaveProperty("html");
    expect(body.from).not.toContain(INPUT.email);
  });

  it("reports missing configuration by name and makes no request", async () => {
    const fetchStub = stubFetch(new Response("{}"));
    expect(await deliverContactMessage(INPUT, { env: { CONTACT_TO_EMAIL: "x@y.z" }, fetch: fetchStub })).toEqual({
      ok: false,
      reason: "not_configured",
      missing: ["RESEND_API_KEY", "CONTACT_FROM_EMAIL"],
    });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("reduces a provider rejection to its status", async () => {
    const fetchStub = stubFetch(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }));
    expect(await deliverContactMessage(INPUT, { env: ENV, fetch: fetchStub })).toEqual({
      ok: false,
      reason: "provider_rejected",
      status: 403,
    });
  });

  it("reports a network failure or timeout as unreachable", async () => {
    const fetchStub = stubFetch(new Error("ECONNRESET"));
    expect(await deliverContactMessage(INPUT, { env: ENV, fetch: fetchStub })).toEqual({
      ok: false,
      reason: "provider_unreachable",
    });
  });
});
