"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";

import { SearchIcon } from "@/components/icons/search-icon";
import { searchMarketCatalog } from "@/data/market-catalog";

type SearchModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Global search dialog. For now it searches only the first-class Urdais
 * indices from the lightweight market catalog, filtered locally, and is the
 * primary way to jump between their detail pages. Instruments, news, and
 * pages join when a real catalog backend exists.
 *
 * Built on the native <dialog> element so that modal semantics, the top
 * layer, Escape handling, and focus restoration come from the platform
 * rather than hand-rolled event listeners. The `open` prop is the source of
 * truth; the effect below keeps the DOM dialog in sync with it.
 */
export function SearchModal({ open, onClose }: SearchModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const results = searchMarketCatalog(query);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
      inputRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fired for Escape, programmatic close(), and the close button alike, so
  // every way of closing clears the query.
  function handleClose() {
    setQuery("");
    onClose();
  }

  // The dialog element itself covers the viewport and acts as the backdrop;
  // a click whose target is the dialog (not a descendant) landed outside the panel.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  // Enter in the input opens the first match; the result links remain the
  // primary, tabbable way to navigate.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const first = results[0];
    if (!first) return;
    router.push(first.href);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search Urdais"
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col items-center bg-black/60 px-4 pt-[12vh] text-neutral-100 backdrop:bg-transparent open:flex"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-white/10 bg-neutral-900 shadow-2xl shadow-black/50">
        <form
          role="search"
          onSubmit={handleSubmit}
          className="flex items-center gap-3 border-b border-white/10 px-4"
        >
          <SearchIcon className="size-5 shrink-0 text-neutral-500" />
          {/*
            A plain text input rather than type="search": Chrome makes the
            first Escape in a non-empty search input clear it instead of
            reaching the dialog, which would break "Escape closes the modal".
          */}
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            enterKeyHint="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search Urdais"
            placeholder="Search indices"
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-neutral-100 outline-none placeholder:text-neutral-500"
          />
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[11px] font-medium text-neutral-500 sm:inline-block">
            Esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
              className="size-4"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </form>

        {results.length > 0 ? (
          <nav aria-label="Search results" className="p-2">
            <p className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              Indices
            </p>
            <ul>
              {results.map((market) => (
                <li key={market.symbol}>
                  <Link
                    href={market.href}
                    onClick={onClose}
                    className="group flex items-center gap-4 rounded-md px-2 py-2.5 transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#8ca4ff]"
                  >
                    <span className="w-14 shrink-0 text-sm font-semibold text-neutral-50">{market.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-400">{market.name}</span>
                    <span
                      aria-hidden="true"
                      className="text-neutral-600 transition-colors group-hover:text-neutral-300 group-focus-visible:text-neutral-300"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">No matching indices.</p>
        )}
      </div>
    </dialog>
  );
}
