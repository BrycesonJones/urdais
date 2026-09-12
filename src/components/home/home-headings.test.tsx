import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The hero canvas needs WebGL and the market panels need real layout; the
// heading semantics are what these tests cover, so those are stubbed out.
vi.mock("@/components/ui/liquid-chrome", () => ({ LiquidChrome: () => <div data-testid="chrome" /> }));
vi.mock("@/components/market/ucpi-summary", () => ({ UcpiSummary: () => <article data-testid="ucpi" /> }));
vi.mock("@/components/market/urdais-indices", () => ({ UrdaisIndices: () => <aside data-testid="indices" /> }));

import { InformationMarketsSection } from "@/components/home/information-markets-section";
import { LiquidChromeSection } from "@/components/home/liquid-chrome-section";
import styles from "@/components/ui/chrome-reveal-text.module.css";

// Next types CSS module keys as possibly undefined; the class must exist.
const revealClass = styles.text as string;
import { SITE_NAME, SITE_TAGLINE } from "@/constants/site";
import { MARKETS_HREF } from "@/lib/routes";

describe("hero", () => {
  it("keeps the title and tagline as single, real text with the chrome reveal applied", () => {
    render(<LiquidChromeSection />);
    const title = screen.getByRole("heading", { level: 1, name: SITE_NAME });
    expect(title).toHaveTextContent(new RegExp(`^${SITE_NAME}$`));
    expect(screen.getAllByText(SITE_NAME)).toHaveLength(1);
    expect(screen.getAllByText(SITE_TAGLINE)).toHaveLength(1);
    expect(title.firstElementChild).toHaveClass(revealClass);
    expect(screen.getByText(SITE_TAGLINE)).toHaveClass(revealClass);
  });
});

describe("Information Markets", () => {
  it("is a labelled section whose H2 links to the markets index and reads once", () => {
    render(<InformationMarketsSection />);
    const section = screen.getByRole("region", { name: "Information Markets" });
    const heading = within(section).getByRole("heading", { level: 2, name: "Information Markets" });
    const link = within(heading).getByRole("link", { name: "Information Markets" });
    expect(link).toHaveAttribute("href", MARKETS_HREF);
    expect(screen.getAllByText("Information Markets")).toHaveLength(1);
    expect(within(section).getByTestId("ucpi")).toBeInTheDocument();
    expect(within(section).getByTestId("indices")).toBeInTheDocument();
  });

  it("applies the same chrome reveal as the hero title", () => {
    render(<InformationMarketsSection />);
    expect(screen.getByText("Information Markets")).toHaveClass(revealClass);
  });

  it("rises further into the hero than the hero's own bottom padding", () => {
    render(<InformationMarketsSection />);
    const section = screen.getByRole("region", { name: "Information Markets" });
    expect(section).toHaveClass("-mt-16", "md:-mt-28", "lg:-mt-40", "pt-8", "md:pt-10", "lg:pt-12");
  });
});
