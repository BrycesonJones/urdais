import { MAP_LEGEND_ROWS } from "@/components/map/map-point-style";
import type { MapVisibilityGroup, MapVisibilityState } from "@/components/map/map-point-style";
import type { FacilityCategory } from "@/lib/facilities/domain";

type MapLegendProps = {
  /** Which groups are shown; a row for a hidden group renders muted but stays in place. */
  visibility: MapVisibilityState;
  onToggle: (group: MapVisibilityGroup) => void;
  /** Categories this reader may not see. Empty when enforcement is off or they are entitled. */
  lockedCategories?: readonly FacilityCategory[];
  /** Called when a locked row is activated, so the workspace can open the gate. */
  onLockedSelect?: (group: MapVisibilityGroup) => void;
  className?: string;
};

/**
 * The map's legend and, since every row is a toggle, its first filter
 * control: one row per infrastructure category, then unmapped. Plain React
 * UI owned by the workspace: it reads the same colour table the MapLibre
 * layer paints with and knows nothing about the map instance. Each row is a
 * real button spanning its full width with `aria-pressed` carrying the
 * state, so it works from the keyboard and reads correctly to assistive
 * technology; the swatches stay decorative and the words carry meaning. A
 * hidden group keeps its canonical colour and is merely muted, so it can
 * always be turned back on.
 *
 * ## Locked rows
 *
 * A premium category the reader cannot see stays in this list. Removing it would
 * make the map look emptier rather than gated, and nobody can decide to buy
 * something they cannot tell exists.
 *
 * A locked row is not a toggle, so it carries no `aria-pressed` — announcing it as
 * an unpressed switch would say the layer is merely switched off. It is a button
 * that opens the gate, labelled "Premium" **in words**: the lock is never conveyed
 * by colour or by the icon alone. It is deliberately not `disabled`, because a
 * disabled control is unfocusable and would leave a keyboard user unable to reach
 * the one affordance that explains the lock.
 */
export function MapLegend({ visibility, onToggle, lockedCategories = [], onLockedSelect, className }: MapLegendProps) {
  const isLocked = (group: MapVisibilityGroup) => (lockedCategories as readonly string[]).includes(group);

  return (
    <div
      role="group"
      aria-label="Map legend"
      className={["rounded-md border border-black/10 bg-white/90 p-1 text-xs text-neutral-800 backdrop-blur-sm", className].filter(Boolean).join(" ")}
    >
      <ul className="flex flex-col">
        {MAP_LEGEND_ROWS.map((row) => {
          const group = row.id as MapVisibilityGroup;
          const locked = isLocked(group);
          const visible = visibility[group];

          if (locked) {
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onLockedSelect?.(group)}
                  className="flex min-h-8 w-full items-center gap-2 rounded px-1.5 text-left text-neutral-500 transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#526fe0]"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block size-2.5 shrink-0 rounded-full border border-white opacity-40"
                    style={{ backgroundColor: row.color }}
                  />
                  <span>{row.label}</span>
                  <span aria-hidden="true" className="ml-auto flex items-center text-neutral-400">
                    <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" focusable="false">
                      <rect x="3.75" y="7.25" width="8.5" height="5.5" rx="1.1" />
                      <path d="M5.75 7.25V5.5a2.25 2.25 0 0 1 4.5 0v1.75" />
                    </svg>
                  </span>
                  {/*
                    The lock stated in words, and part of the row's accessible name.
                    The leading space matters: without it a screen reader announces
                    "GPU Compute ClusterPremium".
                  */}
                  <span className="sr-only">{" — Premium, subscription required"}</span>
                </button>
              </li>
            );
          }

          return (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={visible}
                onClick={() => onToggle(group)}
                className={`flex min-h-8 w-full items-center gap-2 rounded px-1.5 text-left transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#526fe0] ${
                  visible ? "text-neutral-800" : "text-neutral-400"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block size-2.5 shrink-0 rounded-full border border-white transition-opacity ${visible ? "" : "opacity-30"}`}
                  style={{ backgroundColor: row.color }}
                />
                <span className={visible ? "" : "line-through decoration-neutral-400/70"}>{row.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
