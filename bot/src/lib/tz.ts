// Calendar-date helpers anchored to the gym's timezone. Cron jobs may fire in a
// different zone, but "today" / "tomorrow" for a training session must follow
// local (Chișinău) calendar days.

export const GYM_TZ = "Europe/Chisinau";

// A Date -> "YYYY-MM-DD" as seen in the given timezone.
export function ymdInTz(date: Date, tz: string = GYM_TZ): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayInTz(tz: string = GYM_TZ): string {
  return ymdInTz(new Date(), tz);
}

// The calendar day after today (in the given timezone), as "YYYY-MM-DD".
export function tomorrowInTz(tz: string = GYM_TZ): string {
  return shiftLocalDate(todayInTz(tz), 1);
}

export function shiftLocalDate(date: string, days: number): string {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Current local weekday (0=Sun … 6=Sat) and "HH:MM" in the given timezone.
// Used by the minute scheduler to compare against the configured schedule.
export function localWeekdayAndTime(
  tz: string = GYM_TZ,
  now: Date = new Date(),
): { weekday: number; hhmm: string } {
  const weekday = new Date(ymdInTz(now, tz) + "T00:00:00Z").getUTCDay();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  let hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (hh === "24") hh = "00"; // some ICU builds render midnight as 24
  return { weekday, hhmm: `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}` };
}

// Project local calendar minutes onto UTC. Checking the offsets on both sides
// of the date handles the spring gap and the two fall occurrences in Chișinău.
export function localMinuteInstant(date: string, hhmm: string): number | null {
  const anchor = Date.parse(`${date}T${hhmm}:00Z`);
  if (!Number.isFinite(anchor)) return null;
  const day = 86_400_000;
  function localMinute(at: number): string {
    const instant = new Date(at);
    return `${ymdInTz(instant)}T${localWeekdayAndTime(GYM_TZ, instant).hhmm}`;
  }
  const matches = [anchor - day, anchor, anchor + day].map((at) => {
    const offset = Date.parse(`${localMinute(at)}:00Z`) - at;
    return anchor - offset;
  }).filter((at) => localMinute(at) === `${date}T${hhmm}`);
  return matches.length ? Math.min(...matches) : null;
}
