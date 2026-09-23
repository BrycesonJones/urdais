import { formatNumber } from "@/lib/format";
import {
  formatReferenceMonth,
  monthOrdinal,
  umpiHasGaps,
  umpiSegments,
} from "@/lib/umpi/read/months";
import type { UmpiPoint } from "@/lib/umpi/read/read-model";

/**
 * A monthly index drawn from published months only.
 *
 * Points are positioned by elapsed months rather than by array index, and the line is broken
 * wherever consecutive points are not consecutive months. Both choices exist for the same
 * reason: the export unit-value series publishes its 2020 base year and then resumes in 2026,
 * and an evenly spaced, continuously joined line would render that five-year hole as observed
 * movement. Nothing here interpolates, smooths, or carries a value forward.
 *
 * A single point is drawn as a dot. One observation is not a trend, and a one-point line is
 * either invisible or a lie about direction.
 */
export function UmpiChart({
  points,
  seriesName,
  base,
}: {
  points: readonly UmpiPoint[];
  seriesName: string;
  base: string;
}) {
  if (points.length === 0) return null;

  const levels = points.map((point) => point.level);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const span = max - min || 1;
  const first = monthOrdinal(points[0]!.referenceMonth);
  const last = monthOrdinal(points[points.length - 1]!.referenceMonth);
  const months = last - first || 1;

  const x = (point: UmpiPoint) =>
    points.length === 1 ? 50 : ((monthOrdinal(point.referenceMonth) - first) / months) * 100;
  const y = (point: UmpiPoint) => 100 - ((point.level - min) / span) * 100;

  const segments = umpiSegments(points);
  const gapped = umpiHasGaps(points);

  // The chart is decorative once the same numbers are in the table below it; the readable
  // summary is what a screen reader gets, so it states the shape rather than the pixels.
  const summary =
    points.length === 1
      ? `${seriesName}: one published month, ${formatReferenceMonth(points[0]!.referenceMonth)} at ${formatNumber(points[0]!.level, 2)} index points.`
      : `${seriesName}: ${points.length} published months from ${formatReferenceMonth(points[0]!.referenceMonth)} to ${formatReferenceMonth(points[points.length - 1]!.referenceMonth)}, ranging from ${formatNumber(min, 2)} to ${formatNumber(max, 2)} index points on a base of ${base}.${gapped ? " The line is broken where months are not published." : ""}`;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-48 w-full sm:h-64"
        role="img"
        aria-label={summary}
      >
        {segments.map((segment, index) =>
          segment.length === 1 ? (
            <circle
              key={index}
              cx={x(segment[0]!)}
              cy={y(segment[0]!)}
              r="1.2"
              className="text-amber-400"
              fill="currentColor"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <path
              key={index}
              d={segment
                .map((point, i) => `${i === 0 ? "M" : "L"}${x(point).toFixed(3)},${y(point).toFixed(3)}`)
                .join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              className="text-amber-400"
            />
          ),
        )}
      </svg>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span>{formatReferenceMonth(points[0]!.referenceMonth)}</span>
        <span className="tabular-nums">
          {formatNumber(min, 2)} – {formatNumber(max, 2)} index points
        </span>
        <span>{formatReferenceMonth(points[points.length - 1]!.referenceMonth)}</span>
      </div>
      <figcaption className="text-xs text-neutral-500">
        {points.length} published month{points.length === 1 ? "" : "s"}, plotted on the months they
        describe.
        {gapped
          ? " The line breaks where Urdais publishes no month; nothing is interpolated across a gap."
          : null}
      </figcaption>
    </figure>
  );
}
