/** Restrained market colour semantics for a percentage move on the dark surface; the sign is always shown in text as well. */
export function movementClass(changePercent: number): string {
  if (changePercent > 0) return "text-emerald-500";
  if (changePercent < 0) return "text-red-400";
  return "text-neutral-400";
}
