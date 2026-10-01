import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

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

  it("does not send anything yet", () => {
    const { dialog } = openContact();
    const submit = within(dialog).getByRole("button", { name: /send/i });
    const event = new Event("submit", { bubbles: true, cancelable: true });
    submit.closest("form")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(dialog).toHaveProperty("open", true);
  });
});
