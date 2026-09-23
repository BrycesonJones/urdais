import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import Markdown, { type Components } from "react-markdown";

import { docHref, isPublicDocHref, publicDocPages, type DocPage } from "@/lib/docs/catalog";
import { getHeadings, remarkTables } from "@/lib/docs/markdown";

type HeadingProps = ComponentPropsWithoutRef<"h2"> & {
  node?: { tagName: string; position?: { start: { line: number } } };
};

export function DocArticle({ page }: { page: DocPage & { markdown: string } }) {
  const headings = getHeadings(page.markdown);
  const toc = headings.filter((heading) => heading.depth === 2);

  // Match by source position, not render order, so repeated/inline-formatted
  // headings receive the same stable IDs as the parsed table of contents.
  function Heading({ node, children, ...props }: HeadingProps) {
    const heading = headings.find((item) => item.line === node?.position?.start.line);
    const Tag = (node?.tagName ?? "h2") as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Tag {...props} id={heading?.id}>
        {heading ? (
          <a href={`#${heading.id}`} className="docs-heading-link">
            {children}<span aria-hidden="true">#</span>
          </a>
        ) : children}
      </Tag>
    );
  }

  const components: Components = {
    h1: Heading,
    h2: Heading,
    h3: Heading,
    h4: Heading,
    h5: Heading,
    h6: Heading,
    // A link to a withheld document renders as plain text. The documents that link to one are
    // themselves public and cannot be edited to drop the link -- their bytes are the
    // `content_hash` of an approved methodology version -- so the link is neutralized where it is
    // rendered rather than where it is written. The surrounding sentence is untouched: this
    // removes a route into withheld documentation, not a mention of it.
    a: ({ href, children }) => {
      if (href && !isPublicDocHref(href)) return <>{children}</>;
      return href?.startsWith("/") && !href.startsWith("//")
        ? <Link href={href}>{children}</Link>
        : <a href={href}>{children}</a>;
    },
    // A coverage matrix is wider than a phone. Scroll the table rather than the page,
    // and keep the table element itself intact so it stays a table to a screen reader.
    table: ({ children, ...props }) => (
      <div className="docs-table-scroll"><table {...props}>{children}</table></div>
    ),
  };
  // The pager walks the public pages, so previous/next can never step onto a withheld document.
  const index = publicDocPages.findIndex((item) => item.slug === page.slug);
  const previous = publicDocPages[index - 1];
  const next = publicDocPages[index + 1];
  const contents = (
    <nav aria-label="On this page">
      <ul>
        {toc.map((heading) => (
          <li key={heading.id}><a href={`#${heading.id}`}>{heading.text}</a></li>
        ))}
      </ul>
    </nav>
  );

  return (
    <div className="docs-reading-layout">
      <main id="docs-content" className="docs-main" tabIndex={-1}>
        <p className="docs-eyebrow">
          {page.section} <span aria-hidden="true">/</span> {page.title}
        </p>
        {toc.length > 0 && (
          <details className="docs-mobile-toc">
            <summary>On this page</summary>
            {contents}
          </details>
        )}
        <article className="docs-prose">
          <Markdown skipHtml remarkPlugins={[remarkTables]} components={components}>{page.markdown}</Markdown>
        </article>
        <nav className="docs-pagination" aria-label="Documentation pages">
          {previous && (
            <Link href={docHref(previous.slug)}>
              <span>← Previous</span>{previous.title}
            </Link>
          )}
          {next && (
            <Link href={docHref(next.slug)} className="docs-next">
              <span>Next →</span>{next.title}
            </Link>
          )}
        </nav>
      </main>
      {toc.length > 0 && (
        <aside className="docs-toc">
          <p className="docs-label">On this page</p>
          {contents}
        </aside>
      )}
    </div>
  );
}
