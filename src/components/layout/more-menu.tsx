"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";

import { EllipsisIcon } from "@/components/icons/ellipsis-icon";
import { getConsentView, getServerConsentView, openConsentPreferences, subscribeConsent } from "@/lib/analytics/consent-client";
import { PRIVACY_POLICY_HREF, privacyPolicyLinked } from "@/lib/privacy/policy";

// Docs is a header link from `md` up; below that this menu carries it, since the
// footer no longer does.
const NARROW_QUERY = "(max-width: 767.98px)";
function subscribeNarrow(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getNarrow = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;
const getServerNarrow = () => false;

const itemClass =
  "block w-full cursor-pointer rounded px-3 py-2 text-left text-sm text-neutral-400 outline-none transition-colors hover:bg-white/5 hover:text-neutral-100 focus-visible:bg-white/5 focus-visible:text-neutral-100";

/**
 * The header's "More options" menu: Privacy Policy and Privacy Settings.
 *
 * The WAI-ARIA menu button pattern, built by hand because the app has no menu
 * primitive. Enter, Space or ArrowDown open it on the first item, ArrowUp on the
 * last; the arrows, Home and End move between items; Escape closes it and returns
 * focus to the trigger; Tab, a click outside, or choosing an item closes it.
 *
 * Privacy Settings opens the same consent panel as every other "Privacy settings"
 * control. Focus goes back to the trigger first, because the panel returns focus
 * to whatever had it when it opened, and the menu item is about to unmount.
 */
export function MoreMenu({ className, focusRing }: { className?: string; focusRing: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");
  const menuId = useId();
  const { status } = useSyncExternalStore(subscribeConsent, getConsentView, getServerConsentView);
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrow, getServerNarrow);

  function items(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  function close({ returnFocus }: { returnFocus: boolean }) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const list = items();
    (focusOnOpen.current === "last" ? list.at(-1) : list[0])?.focus();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function openMenu(at: "first" | "last") {
    focusOnOpen.current = at;
    setOpen(true);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? "last" : "first");
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(index - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(list.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close({ returnFocus: true });
        break;
      case "Tab":
        close({ returnFocus: false });
        break;
    }
  }

  function openPrivacySettings() {
    close({ returnFocus: true });
    openConsentPreferences();
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close({ returnFocus: false }) : openMenu("first"))}
        onKeyDown={handleTriggerKeyDown}
        className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100 ${focusRing}`}
      >
        <EllipsisIcon className="size-5" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="More options"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border border-white/10 bg-neutral-950 p-1"
        >
          {narrow ? (
            <Link href="/docs" role="menuitem" tabIndex={-1} onClick={() => close({ returnFocus: false })} className={itemClass}>
              Docs
            </Link>
          ) : null}
          {privacyPolicyLinked() ? (
            <Link
              href={PRIVACY_POLICY_HREF}
              role="menuitem"
              tabIndex={-1}
              onClick={() => close({ returnFocus: false })}
              className={itemClass}
            >
              Privacy Policy
            </Link>
          ) : null}
          {status !== "off" ? (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={openPrivacySettings}
              className={itemClass}
            >
              Privacy Settings
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
