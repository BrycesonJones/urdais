import type { SVGProps } from "react";

/** Small check mark used to indicate the selected option in a menu. Decorative by default. */
export function CheckIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}
