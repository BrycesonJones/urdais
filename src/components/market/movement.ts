/** Restrained market colour semantics for the dark surface; the sign is always shown in text as well. */
export function movementClass(change: number): string {
  if (change > 0) return "text-emerald-500";
  if (change < 0) return "text-red-400";
  return "text-neutral-400";
}
