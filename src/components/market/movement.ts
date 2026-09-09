/** Restrained market colour semantics: sign is always shown in text as well. */
export function movementClass(change: number): string {
  if (change > 0) return "text-emerald-700";
  if (change < 0) return "text-red-600";
  return "text-neutral-500";
}
