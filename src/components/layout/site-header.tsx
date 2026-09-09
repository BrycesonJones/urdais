"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { SearchIcon } from "@/components/icons/search-icon";
import { SearchModal } from "@/components/layout/search-modal";
import { SITE_NAME } from "@/constants/site";

const NAV_LINKS = [
  { label: "Products", href: "/products" },
  { label: "Contact", href: "/contact" },
] as const;

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300";

// The platform never changes at runtime, so there is nothing to subscribe to;
// useSyncExternalStore is used only for its hydration-safe server snapshot.
const subscribeToNothing = () => () => {};
const getModifierKey = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "\u2318" : "Ctrl";
const getServerModifierKey = () => "\u2318";

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const modifierKey = useSyncExternalStore(
    subscribeToNothing,
    getModifierKey,
    getServerModifierKey,
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      const isShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k";
      if (!isShortcut) return;

      event.preventDefault();
      setSearchOpen(true);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link
          href="/"
          className={`shrink-0 rounded-sm text-lg font-semibold tracking-tight text-neutral-50 ${focusRing}`}
        >
          {SITE_NAME}
        </Link>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          aria-haspopup="dialog"
          className={`flex h-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-sm text-neutral-400 transition-colors hover:border-white/15 hover:bg-white/10 hover:text-neutral-200 sm:w-64 sm:justify-start sm:gap-2 sm:px-3 lg:w-80 max-sm:w-9 ${focusRing}`}
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="hidden flex-1 text-left sm:inline">Search</span>
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[11px] font-medium text-neutral-500 sm:inline-block">
            {modifierKey}K
          </kbd>
        </button>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-1 sm:gap-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`hidden rounded-md px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100 md:inline-block ${focusRing}`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/get-started"
            className={`ml-1 rounded-md bg-neutral-100 px-3.5 py-1.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-white sm:ml-2 ${focusRing}`}
          >
            Get Started
          </Link>
        </nav>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
