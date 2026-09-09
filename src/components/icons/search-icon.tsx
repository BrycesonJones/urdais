import type { SVGProps } from "react";

/**
 * Simple magnifying-glass icon rendered as an inline SVG.
 *
 * Decorative by default (`aria-hidden`); callers that use it as the only
 * content of a control must label the control itself.
 */
export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
