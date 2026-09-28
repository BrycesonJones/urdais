/**
 * The "or" between Google and email.
 *
 * `aria-hidden` on the whole thing: the rule and the word are a visual separator,
 * and a screen reader that announced "or" between two labelled controls would be
 * narrating the layout rather than the choice.
 */
export function AuthDivider() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 text-xs text-neutral-600">
      <span className="h-px flex-1 bg-white/10" />
      or
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
