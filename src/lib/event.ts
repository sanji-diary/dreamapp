import { isSunday, weekEnd } from "./time";

/**
 * 행사 기간: a stretch of days an admin sets for a retreat, a special event or a trial run
 * (설정 > 행사 기간). It can do two things, each on its own:
 *
 * - `attendanceQr`: the attendance QR is accepted on every day of the period, not only on Sundays.
 *   Each of those extra days is its own attendance day: the attendance mission can be finished once
 *   on that day, whatever the child did earlier in the week.
 * - `weeklyDropCap`: the weeks that touch the period use this weekly drop cap instead of the usual
 *   one (never a lower one).
 *
 * Once the period is over everything is back to normal by itself; nobody has to switch it off.
 * Kept in settings as 'event_period'.
 */
export interface EventPeriod {
  from: string;
  to: string;
  attendanceQr: boolean;
  weeklyDropCap: number | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the stored value. Anything that is not a well-formed period counts as "no period". */
export function parseEventPeriod(value: unknown): EventPeriod | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.from !== "string" || typeof v.to !== "string" || !DATE.test(v.from) || !DATE.test(v.to) || v.from > v.to) return null;
  const cap = typeof v.weeklyDropCap === "number" && Number.isInteger(v.weeklyDropCap) && v.weeklyDropCap > 0 ? v.weeklyDropCap : null;
  return { from: v.from, to: v.to, attendanceQr: v.attendanceQr === true, weeklyDropCap: cap };
}

function inPeriod(event: EventPeriod | null, date: string): event is EventPeriod {
  return event !== null && event.from <= date && date <= event.to;
}

/** A day that is not a Sunday on which the attendance QR is accepted all the same. */
export function extraAttendanceDay(event: EventPeriod | null, date: string): boolean {
  return !isSunday(date) && inPeriod(event, date) && event.attendanceQr;
}

/** Whether the attendance QR is accepted on `date`: every Sunday, and the extra days of the period. */
export function attendanceOpenOn(event: EventPeriod | null, date: string): boolean {
  return isSunday(date) || extraAttendanceDay(event, date);
}

/** The weekly drop cap of the week that starts on `ws` (a Sunday). */
export function dropCapForWeek(usual: number, event: EventPeriod | null, ws: string): number {
  if (event === null || event.weeklyDropCap === null) return usual;
  const touches = event.from <= weekEnd(ws) && event.to >= ws;
  return touches ? Math.max(usual, event.weeklyDropCap) : usual;
}
