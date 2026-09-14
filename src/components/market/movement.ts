/** Restrained market colour semantics for a percentage move on the dark surface; the sign is always shown in text as well. */
export function movementClass(changePercent: number | null): string {
  if (changePercent === null || changePercent === 0) return "text-neutral-400";
  if (changePercent > 0) return "text-emerald-500";
  return "text-red-400";
}
