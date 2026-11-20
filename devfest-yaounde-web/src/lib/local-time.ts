/**
 * A session's time in the VIEWER'S zone (ADR 0092), for speakers and guests
 * following from abroad. Sessions carry a wall-clock time in Yaoundé
 * (Africa/Douala, UTC+1 all year); this converts it for whoever is looking.
 */

const EVENT_ZONE_OFFSET = "+01:00";

export interface LocalTimeInfo {
  /** "03:20" in the viewer's zone. */
  time: string;
  /** Short zone name, e.g. "EST" or "GMT+9". */
  zone: string;
  /** "-1" / "+1" when the viewer's calendar day differs, else 0. */
  dayShift: -1 | 0 | 1;
}

/**
 * `date` is the event day ("2026-11-21"), `time` the Yaoundé time ("09:20").
 * Returns null when the viewer is on Yaoundé time already (nothing to add).
 * `zone` is injectable so it can be tested without the machine's own setting.
 */
export function localTimeFor(
  date: string,
  time: string,
  locale: string,
  zone?: string,
): LocalTimeInfo | null {
  const at = new Date(`${date}T${time}:00${EVENT_ZONE_OFFSET}`);
  if (Number.isNaN(at.getTime())) return null;
  const opts = (z?: string): Intl.DateTimeFormatOptions => ({
    ...(z ? { timeZone: z } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const mine = new Intl.DateTimeFormat(locale, opts(zone)).format(at);
  const yaounde = new Intl.DateTimeFormat(locale, opts("Africa/Douala")).format(
    at,
  );
  const dayOf = (z?: string) =>
    new Intl.DateTimeFormat("en-CA", {
      ...(z ? { timeZone: z } : {}),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  const myDay = dayOf(zone);
  const theirDay = dayOf("Africa/Douala");
  if (mine === yaounde && myDay === theirDay) return null;
  const zoneName =
    new Intl.DateTimeFormat(locale, {
      ...(zone ? { timeZone: zone } : {}),
      timeZoneName: "short",
    })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return {
    time: mine,
    zone: zoneName,
    dayShift: myDay === theirDay ? 0 : myDay > theirDay ? 1 : -1,
  };
}
