import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SiteFooter } from "@/components/layout/site-footer";

// jsdom implements <dialog> markup but none of its methods. The stubs are the minimum the
// modal touches, and close() fires the close event as the browser does.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

function openContact() {
  render(<SiteFooter />);
  const trigger = screen.getByRole("button", { name: "Contact" });
  fireEvent.click(trigger);
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Contact" });
  return { trigger, dialog };
}

describe("SiteFooter contact", () => {
  it("is a button in the footer navigation, not a link to /contact", () => {
    render(<SiteFooter />);
    const trigger = screen.getByRole("button", { name: "Contact" });
    expect(trigger.closest("nav")).toHaveAttribute("aria-label", "Footer");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("link", { name: "Contact" })).toBeNull();
    expect(document.querySelector('a[href="/contact"]')).toBeNull();
  });

  it("keeps the other footer links", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
    for (const name of ["X", "LinkedIn", "Open source"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("target", "_blank");
    }
  });

  it("opens the contact modal with its fields and focuses the email input", () => {
    const { dialog } = openContact();
    expect(dialog).toHaveProperty("open", true);
    const email = within(dialog).getByLabelText("Your email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("placeholder", "name@email.com");
    expect(within(dialog).getByLabelText("How can we help?").tagName).toBe("TEXTAREA");
    expect(within(dialog).getByRole("button", { name: /send/i })).toHaveAttribute("type", "submit");
    expect(document.activeElement).toBe(email);
  });

  it("locks page scrolling while open and restores it on close", () => {
    const { dialog } = openContact();
    expect(document.documentElement.style.overflow).toBe("hidden");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close contact form" }));
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("closes from the close button and returns focus to the trigger", () => {
    const { trigger, dialog } = openContact();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close contact form" }));
    expect(dialog).toHaveProperty("open", false);
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a backdrop click but not on a click inside the panel", () => {
    const { trigger, dialog } = openContact();
    fireEvent.click(within(dialog).getByLabelText("How can we help?"));
    fireEvent.click(within(dialog).getByRole("heading", { name: "Contact" }));
    expect(dialog).toHaveProperty("open", true);
    fireEvent.click(dialog);
    expect(dialog).toHaveProperty("open", false);
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the browser closes it for Escape", () => {
    // The platform turns Escape into a cancel and then a close event on a modal dialog.
    const { trigger, dialog } = openContact();
    act(() => dialog.close());
    expect(dialog).toHaveProperty("open", false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

});

type Deferred = { resolve: (response: Response) => void; reject: (error: Error) => void };

/** Stubs fetch with responses the test settles by hand, so the in-flight state can be inspected. */
function stubFetch() {
  const pending: Deferred[] = [];
  const fetchStub = vi.fn<typeof fetch>(
    () => new Promise<Response>((resolve, reject) => pending.push({ resolve, reject })),
  );
  vi.stubGlobal("fetch", fetchStub);
  return { fetchStub, pending };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fill(dialog: HTMLElement, email: string, message: string) {
  fireEvent.input(within(dialog).getByLabelText("Your email"), { target: { value: email } });
  fireEvent.input(within(dialog).getByLabelText("How can we help?"), { target: { value: message } });
}

const sendButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: /^send|sending/i });

describe("ContactModal submission", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the trimmed fields to /api/contact", async () => {
    const { fetchStub, pending } = stubFetch();
    const { dialog } = openContact();
    fill(dialog, "  reader@example.com ", "  Hello there.\n");
    fireEvent.click(sendButton(dialog));

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0]!;
    expect(url).toBe("/api/contact");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "reader@example.com", message: "Hello there." });
    await act(async () => pending[0]!.resolve(json(200, { ok: true })));
  });

  it.each([
    ["an empty email", "", "Hello.", "Your email", "Enter your email."],
    ["an invalid email", "reader@", "Hello.", "Your email", "Enter a valid email address."],
    ["an empty message", "reader@example.com", "", "How can we help?", "Enter a message."],
    ["a whitespace-only message", "reader@example.com", "  \n  ", "How can we help?", "Enter a message."],
    ["an over-long message", "reader@example.com", "x".repeat(5001), "How can we help?", "Keep your message under 5,000 characters."],
    ["an over-long email", `${"a".repeat(250)}@example.com`, "Hello.", "Your email", "Keep your email under 254 characters."],
  ])("blocks %s on the client with an inline error", (_label, email, message, field, text) => {
    const { fetchStub } = stubFetch();
    const { dialog } = openContact();
    fill(dialog, email, message);
    fireEvent.click(sendButton(dialog));

    expect(fetchStub).not.toHaveBeenCalled();
    const input = within(dialog).getByLabelText(field);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(text);
    expect(document.activeElement).toBe(input);
    // Nothing is silently cut: the draft is exactly what was typed.
    expect(input).toHaveValue(field === "Your email" ? email : message);
  });

  it("disables Send while sending and refuses to close until there is an outcome", async () => {
    const { pending } = stubFetch();
    const { dialog } = openContact();
    fill(dialog, "reader@example.com", "Hello.");
    fireEvent.click(sendButton(dialog));

    expect(sendButton(dialog)).toBeDisabled();
    expect(sendButton(dialog)).toHaveTextContent("Sending…");
    expect(within(dialog).getByLabelText("Your email")).toHaveAttribute("readonly");
    fireEvent.click(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close contact form" }));
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog).toHaveProperty("open", true);

    await act(async () => pending[0]!.resolve(json(200, { ok: true })));
    expect(sendButton(dialog)).toBeEnabled();
  });

  it("sends once however fast Send is clicked", async () => {
    const { fetchStub, pending } = stubFetch();
    const { dialog } = openContact();
    fill(dialog, "reader@example.com", "Hello.");
    const form = sendButton(dialog).closest("form")!;
    // Three submits in the same tick, before React can re-render the button as disabled.
    act(() => {
      for (let i = 0; i < 3; i++) form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await act(async () => pending[0]!.resolve(json(200, { ok: true })));
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("confirms success and clears the form only after the server confirms", async () => {
    const { pending } = stubFetch();
    const { dialog } = openContact();
    fill(dialog, "reader@example.com", "Hello.");
    fireEvent.click(sendButton(dialog));

    // In flight: the draft is still there.
    expect(within(dialog).getByLabelText("Your email")).toHaveValue("reader@example.com");
    expect(within(dialog).getByRole("status")).toHaveTextContent("");

    await act(async () => pending[0]!.resolve(json(200, { ok: true })));
    expect(within(dialog).getByRole("status")).toHaveTextContent("Message sent.");
    expect(within(dialog).getByLabelText("Your email")).toHaveValue("");
    expect(within(dialog).getByLabelText("How can we help?")).toHaveValue("");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    // The modal stays open on the confirmation; it does not snap shut.
    expect(dialog).toHaveProperty("open", true);
    expect(document.activeElement).toBe(sendButton(dialog));
  });

  it.each([
    ["a delivery failure", () => json(500, { ok: false, error: "delivery_failed" })],
    ["a validation failure", () => json(400, { ok: false, error: "invalid_input" })],
    ["a 200 without ok: true", () => json(200, { id: "x" })],
    ["a non-JSON response", () => new Response("<html>Bad gateway</html>", { status: 502 })],
  ])("shows a generic error and keeps the draft on %s", async (_label, response) => {
    const { pending } = stubFetch();
    const { dialog } = openContact();
    fill(dialog, "reader@example.com", "Hello.");
    fireEvent.click(sendButton(dialog));
    await act(async () => pending[0]!.resolve(response()));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(within(dialog).getByRole("status")).toHaveTextContent("");
    expect(within(dialog).getByLabelText("Your email")).toHaveValue("reader@example.com");
    expect(within(dialog).getByLabelText("How can we help?")).toHaveValue("Hello.");
    expect(sendButton(dialog)).toBeEnabled();
    expect(dialog.textContent).not.toMatch(/delivery_failed|invalid_input|gateway/i);
  });

  it("shows the error on a network failure, and a retry can then succeed", async () => {
    const { fetchStub, pending } = stubFetch();
    const { dialog } = openContact();
    fill(dialog, "reader@example.com", "Hello.");
    fireEvent.click(sendButton(dialog));
    await act(async () => pending[0]!.reject(new TypeError("Failed to fetch")));
    expect(within(dialog).getByRole("alert")).toBeInTheDocument();

    fireEvent.click(sendButton(dialog));
    expect(fetchStub).toHaveBeenCalledTimes(2);
    await act(async () => pending[1]!.resolve(json(200, { ok: true })));
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Message sent.");
  });
});
