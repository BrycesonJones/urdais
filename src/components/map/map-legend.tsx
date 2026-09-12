import { MAP_LEGEND_ROWS } from "@/components/map/map-point-style";

type MapLegendProps = {
  className?: string;
};

/**
 * Compact legend for the points on the map: one row per infrastructure
 * category, then unmapped. Plain React UI: it reads the same colour table
 * the MapLibre layer paints with and knows nothing about the map instance,
 * so it renders (and stays readable to assistive technology, through its
 * text labels) whether or not the map has loaded. The colour swatches are
 * decorative; the words carry meaning.
 */
export function MapLegend({ className }: MapLegendProps) {
  return (
    <div
      role="group"
      aria-label="Map legend"
      className={["rounded-md border border-black/10 bg-white/90 px-2.5 py-2 text-xs text-neutral-800 backdrop-blur-sm", className].filter(Boolean).join(" ")}
    >
      <ul className="flex flex-col gap-1.5">
        {MAP_LEGEND_ROWS.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-full border border-white" style={{ backgroundColor: row.color }} />
            <span>{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
