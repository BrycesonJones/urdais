"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { docHref, docPages, docSections } from "@/lib/docs/catalog";

function NavigationLinks() {
  const pathname = usePathname().replace(/\/$/, "");
  return (
    <nav aria-label="Documentation">
      {docSections.map((section) => {
        const pages = docPages.filter((page) => page.section === section);
        if (!pages.length) return null;
        return (
          <div key={section} className="docs-nav-section">
            <p className="docs-label">{section}</p>
            <ul>
              {pages.map((page) => (
                <li key={page.slug}>
                  <Link href={docHref(page.slug)} aria-current={pathname === docHref(page.slug) ? "page" : undefined}>
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function DocsNavigation() {
  const pathname = usePathname();
  return (
    <>
      <aside className="docs-sidebar"><NavigationLinks /></aside>
      {/* A native disclosure supports keyboard input and works before hydration.
          Remount on route changes so navigation closes on back/forward as well. */}
      <details key={pathname} className="docs-mobile-nav">
        <summary>Documentation menu</summary>
        <NavigationLinks />
      </details>
    </>
  );
}
