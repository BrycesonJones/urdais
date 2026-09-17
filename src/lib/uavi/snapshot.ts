/**
 * Resolving the official snapshot instant: 15:45:00.000 America/New_York, per session date.
 *
 * The instant is specified as a local time in a **named zone** and never as a fixed UTC offset,
 * and this module is why that distinction is worth a file. New York is UTC−4 for part of the year
 * and UTC−5 for the rest; an implementation that froze either would put the snapshot an hour away
 * from 15:45 local for roughly half of every year, quietly, in a direction that changes twice
 * annually. Every derived quantity — minutes to expiration, and through it the interpolation
 * weights and the variance — would move with it.
 *
 * Two transition cases are refused rather than resolved by a default. On a spring-forward date
 * the requested local time may not exist; on a fall-back date it may occur twice. Neither can be
 * answered by picking one, because picking one is a methodology decision nobody made. In practice
 * US transitions fall on Sundays, when no options session is held, so the cases do not arise —
 * which is a reason to refuse them cheaply rather than a reason to assume them away.
 */

import { SNAPSHOT_TIMEZONE } from "@/lib/uavi/parameters";

/** The zone's offset from UTC, in milliseconds, at a given instant. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const field = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part === undefined ? Number.NaN : Number(part.value);
  };
  const asIfUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second"),
  );
  return asIfUtc - instant;
}

/** The wall-clock reading of an instant in a zone, as `YYYY-MM-DDTHH:MM:SS`. */
function localReading(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const field = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}T${field("hour")}:${field("minute")}:${field("second")}`;
}

/**
 * The official snapshot instant for one session date, as an ISO string in UTC.
 *
 * Returns null where the session date is malformed, or where the requested local time does not
 * exist or is ambiguous in the zone. A null is a refusal to calculate that date, never a
 * fallback.
 */
export function resolveSnapshotInstant(
  sessionDate: string,
  timeZone: string = SNAPSHOT_TIMEZONE,
  localTime = { hour: 15, minute: 45, second: 0 },
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];

  const wanted = Date.UTC(year, month - 1, day, localTime.hour, localTime.minute, localTime.second);
  if (!Number.isFinite(wanted)) return null;

  // Two passes converge everywhere the offset is locally constant, which is everywhere except a
  // transition — and a transition is exactly what the verification below catches.
  let instant = wanted - zoneOffsetMs(wanted, timeZone);
  instant = wanted - zoneOffsetMs(instant, timeZone);
  if (!Number.isFinite(instant)) return null;

  const expected = `${match[1]}-${match[2]}-${match[3]}T${String(localTime.hour).padStart(2, "0")}:${String(localTime.minute).padStart(2, "0")}:${String(localTime.second).padStart(2, "0")}`;
  if (localReading(instant, timeZone) !== expected) return null;

  // Ambiguity: on a fall-back date the same wall-clock reading occurs twice, an hour apart in
  // absolute time. Both directions are checked because which of the two the convergence above
  // lands on is not something to rely on -- and resolving silently to either would make the
  // instant depend on an unstated convention rather than on a rule.
  for (const shift of [-3_600_000, 3_600_000]) {
    if (localReading(instant + shift, timeZone) === expected) return null;
  }

  return new Date(instant).toISOString();
}
