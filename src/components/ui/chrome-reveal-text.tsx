import styles from "./chrome-reveal-text.module.css";

export type ChromeRevealTextProps = {
  /** The text itself. Rendered once, as ordinary text; nothing is duplicated. */
  children: string;
  className?: string;
};

/**
 * Wraps heading text in a one-time "chrome reveal": the glyphs first show
 * the hero's liquid-chrome material, which then resolves into the element's
 * normal text colour. The effect is pure CSS (see the module), and every
 * instance shares the same start time, duration, and easing, so the hero
 * title and the Information Markets heading form together as one event.
 *
 * It runs on initial render and never replays; there is no scroll or
 * intersection trigger. Under `prefers-reduced-motion: reduce` the final,
 * static text renders immediately.
 */
export function ChromeRevealText({ children, className }: ChromeRevealTextProps) {
  return (
    <span className={[styles.text, className].filter(Boolean).join(" ")}>{children}</span>
  );
}
