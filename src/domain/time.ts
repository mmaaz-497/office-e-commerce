/**
 * Western Indonesian Time (WIB) is UTC+7 with no daylight-saving offset
 * (spec A-007). Every helper here is plain arithmetic on that fixed offset
 * rather than an Intl time-zone lookup, so the whole module is pure, needs no
 * ICU data, and cannot disagree with itself about where a day boundary falls.
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Today" on the admin dashboard means the calendar day in WIB — regardless of
 * the server's own timezone. Returns the UTC instants bounding that day so
 * callers can use a plain `createdAt >= start AND createdAt < end` range.
 */
export function wibDayBoundsUtc(now: Date = new Date()): { start: Date; end: Date } {
  const wibNow = new Date(now.getTime() + WIB_OFFSET_MS);
  const wibMidnightAsUtcMillis = Date.UTC(
    wibNow.getUTCFullYear(),
    wibNow.getUTCMonth(),
    wibNow.getUTCDate(),
  );
  const start = new Date(wibMidnightAsUtcMillis - WIB_OFFSET_MS);
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end };
}

/**
 * The UTC instant of the WIB midnight that opened the day `daysAgo` whole days
 * before today's. `wibDayStartUtc(0)` is today's midnight, `wibDayStartUtc(29)`
 * opens a 30-day window ending tonight.
 */
export function wibDayStartUtc(daysAgo: number, now: Date = new Date()): Date {
  return new Date(wibDayBoundsUtc(now).start.getTime() - daysAgo * DAY_MS);
}

/** Every WIB day key from `daysAgo` days back through today, oldest first. */
export function wibDayKeysBack(daysAgo: number, now: Date = new Date()): string[] {
  const start = wibDayStartUtc(daysAgo, now).getTime();
  return Array.from({ length: daysAgo + 1 }, (_, i) => wibDayKey(new Date(start + i * DAY_MS)));
}

function wibParts(date: Date) {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The WIB calendar day an instant falls in, as `YYYY-MM-DD`. This is the key
 * daily aggregates are bucketed by — the SQL side produces the same string
 * from `to_char("createdAt" + interval '7 hours', 'YYYY-MM-DD')`.
 */
export function wibDayKey(date: Date): string {
  const { year, month, day } = wibParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** `2026-09-27 14:32` — numeric on purpose, so no month name needs translating. */
export function formatWibDateTime(date: Date): string {
  const { year, month, day, hour, minute } = wibParts(date);
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

/** `27/09` — the short axis label for a daily series. */
export function formatWibDayMonth(dayKey: string): string {
  const [, month, day] = dayKey.split("-");
  return `${day}/${month}`;
}

/** Whole hours between two instants, rounded down, negative when `to` is past. */
export function hoursBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (60 * 60 * 1000));
}
