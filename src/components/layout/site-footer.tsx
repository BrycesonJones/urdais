import Link from "next/link";

import { GITHUB_REPO_URL, LINKEDIN_URL, SITE_NAME, SITE_URL, X_URL } from "@/constants/site";

const linkClass =
  "rounded-sm transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-400";

/**
 * Sparse editorial footer: copyright left, contact and social labels with
 * "Open source" beneath them centred, and the canonical domain right. The
 * centre column is a fixed grid track so it stays centred regardless of the
 * side text widths; everything stacks and centres below the lg breakpoint.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const domain = new URL(SITE_URL).hostname;

  return (
    <footer className="bg-[#0a0a0a] px-4 pb-16 pt-24 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400 sm:px-6 lg:px-8 lg:pb-20 lg:pt-32 lg:text-left">
      <div className="mx-auto grid max-w-screen-2xl gap-y-10 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-y-0">
        <p>
          © {year} {SITE_NAME}
        </p>

        <nav aria-label="Footer" className="flex flex-col items-center gap-y-7">
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <li>
              <Link href="/docs" className={linkClass}>
                Docs
              </Link>
            </li>
            <li>
              <Link href="/contact" className={linkClass}>
                Contact
              </Link>
            </li>
            <li>
              <a href={X_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                X
              </a>
            </li>
            <li>
              <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                LinkedIn
              </a>
            </li>
          </ul>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Open source
          </a>
        </nav>

        <p className="lg:text-right">
          <a href={SITE_URL} className={linkClass}>
            {domain}
          </a>
        </p>
      </div>
    </footer>
  );
}
