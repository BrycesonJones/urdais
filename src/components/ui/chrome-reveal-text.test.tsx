import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChromeRevealText } from "@/components/ui/chrome-reveal-text";
import styles from "@/components/ui/chrome-reveal-text.module.css";

// Next types CSS module keys as possibly undefined; the class must exist.
const revealClass = styles.text as string;

// jsdom does not run CSS, so the stylesheet's contract is checked as text
// (comments stripped): the formation only exists when motion is allowed,
// every instance shares one fixed timing, and it never loops.
const css = readFileSync(path.resolve(__dirname, "chrome-reveal-text.module.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

describe("ChromeRevealText", () => {
  it("renders the text once, as plain text, with no aria attributes or duplicate layers", () => {
    render(
      <h2>
        <ChromeRevealText>Information Markets</ChromeRevealText>
      </h2>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Information Markets" });
    expect(heading).toHaveTextContent(/^Information Markets$/);
    expect(screen.getAllByText("Information Markets")).toHaveLength(1);
    expect(heading.querySelectorAll("[aria-hidden], [data-text]")).toHaveLength(0);
    expect(screen.getByText("Information Markets")).toHaveClass(revealClass);
  });

  it("gates the whole formation on prefers-reduced-motion: no-preference", () => {
    const [outsideMedia] = css.split("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    for (const property of ["animation:", "background-clip:", "text-fill-color:", "background-image:", "opacity:"]) {
      expect(outsideMedia).not.toContain(property);
    }
  });

  it("uses one fixed, shared timing so every instance forms together", () => {
    expect(css).toMatch(/animation:\s*form 1200ms 100ms both;/);
    expect(css).not.toMatch(/var\(--reveal-(duration|delay)/);
  });

  it("plays once and hands painting back to ordinary text", () => {
    expect(css).not.toMatch(/infinite|alternate/);
    const finalKeyframe = css.slice(css.lastIndexOf("100% {"));
    expect(finalKeyframe).toContain("-webkit-text-fill-color: currentColor");
    expect(finalKeyframe).toContain("background-image: none");
    expect(finalKeyframe).toContain("text-shadow: inherit");
  });
});
