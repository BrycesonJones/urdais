import { MAP_LEGEND_ROWS } from "@/components/map/map-point-style";
import type { MapVisibilityGroup, MapVisibilityState } from "@/components/map/map-point-style";

type MapLegendProps = {
  /** Which groups are shown; a row for a hidden group renders muted but stays in place. */
  visibility: MapVisibilityState;
  onToggle: (group: MapVisibilityGroup) => void;
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
 */
export function MapLegend({ visibility, onToggle, className }: MapLegendProps) {
  return (
    <div
      role="group"
      aria-label="Map legend"
      className={["rounded-md border border-black/10 bg-white/90 p-1 text-xs text-neutral-800 backdrop-blur-sm", className].filter(Boolean).join(" ")}
    >
      <ul className="flex flex-col">
        {MAP_LEGEND_ROWS.map((row) => {
          const group = row.id as MapVisibilityGroup;
          const visible = visibility[group];
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
