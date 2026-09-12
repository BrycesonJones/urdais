import type { ReactNode } from "react";

import { DocsNavigation } from "@/components/docs/docs-navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

import "./docs.css";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-shell">
      <a href="#docs-content" className="docs-skip">Skip to documentation</a>
      <SiteHeader />
      <div className="docs-layout"><DocsNavigation />{children}</div>
      <SiteFooter />
    </div>
  );
}
