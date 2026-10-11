import type { SVGProps } from "react";

/**
 * Horizontal three-dot ("more") icon rendered as an inline SVG.
 *
 * Decorative by default (`aria-hidden`); callers that use it as the only
 * content of a control must label the control itself.
 */
export function EllipsisIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}
