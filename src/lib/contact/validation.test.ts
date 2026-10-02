import { describe, expect, it } from "vitest";

import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  validateContactInput,
} from "@/lib/contact/validation";

const VALID = { email: "reader@example.com", message: "Hello." };

describe("validateContactInput", () => {
  it("accepts a valid submission and trims both fields", () => {
    expect(validateContactInput({ email: "  reader@example.com\n", message: "\n  Hello.  " })).toEqual({
      ok: true,
      value: { email: "reader@example.com", message: "Hello." },
    });
  });

  it("requires an email", () => {
    for (const email of [undefined, "", "   "]) {
      expect(validateContactInput({ ...VALID, email })).toEqual({ ok: false, errors: { email: "email_required" } });
    }
  });

  it("rejects malformed addresses, including anything that could inject a header", () => {
    for (const email of [
      "reader",
      "reader@",
      "@example.com",
      "reader@example",
      "reader@example.",
      "a b@example.com",
      "reader@example.com\nBcc: x@y.com",
      "reader@example.com,other@example.com",
      "Reader <reader@example.com>",
      "a@b@example.com",
    ]) {
      expect(validateContactInput({ ...VALID, email }), email).toEqual({ ok: false, errors: { email: "email_invalid" } });
    }
  });

  it("enforces the email length limit", () => {
    const atLimit = `${"a".repeat(CONTACT_EMAIL_MAX_LENGTH - "@example.com".length)}@example.com`;
    expect(validateContactInput({ ...VALID, email: atLimit }).ok).toBe(true);
    expect(validateContactInput({ ...VALID, email: `a${atLimit}` })).toEqual({
      ok: false,
      errors: { email: "email_too_long" },
    });
  });

  it("requires a message and rejects whitespace-only messages", () => {
    for (const message of [undefined, "", " \n\t "]) {
      expect(validateContactInput({ ...VALID, message })).toEqual({ ok: false, errors: { message: "message_required" } });
    }
  });

  it("enforces the message length limit without truncating", () => {
    expect(validateContactInput({ ...VALID, message: "x".repeat(CONTACT_MESSAGE_MAX_LENGTH) })).toEqual({
      ok: true,
      value: { ...VALID, message: "x".repeat(CONTACT_MESSAGE_MAX_LENGTH) },
    });
    expect(validateContactInput({ ...VALID, message: "x".repeat(CONTACT_MESSAGE_MAX_LENGTH + 1) })).toEqual({
      ok: false,
      errors: { message: "message_too_long" },
    });
  });

  it("treats malformed payloads as missing fields", () => {
    for (const input of [null, undefined, "text", 42, [], { email: 1, message: { html: "<b>" } }]) {
      expect(validateContactInput(input).ok).toBe(false);
    }
  });
});
