import { useId } from "react";

/** React's useId, stripped to characters that are valid inside url(#…) references. */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
