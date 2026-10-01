import type { SVGProps } from "react";

/**
 * Simple person/profile icon rendered as an inline SVG.
 *
 * Decorative by default (`aria-hidden`); callers that use it as the only
 * content of a control must label the control itself.
 */
export function AccountIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
